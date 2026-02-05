/**
 * Tombstone Manager
 *
 * Tracks deleted item IDs so Realtime INSERTs don't resurrect them.
 * Each tombstone now stores a timestamp so we can auto-expire old entries
 * and prevent unbounded growth.
 */

const STORAGE_KEY = 'stash_deleted_tombstones';

/** 7 days in milliseconds */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface TombstoneEntry {
    id: string;
    /** Epoch ms when the tombstone was created */
    ts: number;
}

// ---- Internal helpers ----

function loadEntries(): TombstoneEntry[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);

        // Migration: old format was string[] -- upgrade to TombstoneEntry[]
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
            const now = Date.now();
            return (parsed as string[]).map(id => ({ id, ts: now }));
        }

        return parsed as TombstoneEntry[];
    } catch {
        return [];
    }
}

function saveEntries(entries: TombstoneEntry[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
        console.error('[Tombstones] Failed to save', e);
    }
}

/** Remove entries older than TTL */
function removeExpired(entries: TombstoneEntry[]): TombstoneEntry[] {
    const cutoff = Date.now() - TTL_MS;
    return entries.filter(e => e.ts > cutoff);
}

// ---- Public API ----

export const tombstoneManager = {
    add(ids: string[]): void {
        const now = Date.now();
        const current = removeExpired(loadEntries());
        const existing = new Set(current.map(e => e.id));
        const newEntries = ids
            .filter(id => !existing.has(id))
            .map(id => ({ id, ts: now }));
        saveEntries([...current, ...newEntries]);
    },

    getAll(): string[] {
        const entries = removeExpired(loadEntries());
        // Persist the cleanup so expired entries don't accumulate
        saveEntries(entries);
        return entries.map(e => e.id);
    },

    has(id: string): boolean {
        return loadEntries().some(e => e.id === id && e.ts > Date.now() - TTL_MS);
    },

    /**
     * Remove tombstones for IDs that the server no longer returns
     * (i.e., the server has fully processed the delete).
     */
    prune(serverIds: string[]): void {
        try {
            const entries = removeExpired(loadEntries());
            const serverIdSet = new Set(serverIds);
            const needed = entries.filter(e => serverIdSet.has(e.id));
            if (needed.length !== entries.length) {
                saveEntries(needed);
            }
        } catch (e) {
            console.error('[Tombstones] Failed to prune', e);
        }
    },

    /** Force-expire all entries (useful for testing or sign-out) */
    clear(): void {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore
        }
    },
};
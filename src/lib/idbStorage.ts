/**
 * IndexedDB Storage Adapter for Zustand Persist
 * 
 * Replaces localStorage for the main Zustand store to handle large datasets
 * (items, tasks, lists) without hitting the ~5MB localStorage quota.
 * 
 * Features:
 * - Debounced writes (1s) to avoid thrashing on rapid state changes
 * - Automatic migration from localStorage on first load
 * - Emergency flush to localStorage on page hide (IDB is async, may not complete)
 * - Graceful fallback to localStorage if IndexedDB is unavailable
 */

const DB_NAME = 'stash-persist';
const DB_VERSION = 1;
const STORE_NAME = 'zustand';
const DEBOUNCE_MS = 1000;

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB not available'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            // Handle connection loss
            dbInstance.onclose = () => { dbInstance = null; };
            dbInstance.onversionchange = () => {
                dbInstance?.close();
                dbInstance = null;
            };
            resolve(dbInstance);
        };

        request.onerror = () => reject(request.error);
    });
}

// Debounce state
let pendingValue: string | null = null;
let pendingName: string | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

async function flushToIDB(): Promise<void> {
    if (!pendingName || pendingValue === null) return;

    const name = pendingName;
    const value = pendingValue;
    pendingValue = null;
    pendingName = null;

    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(value, name);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn('[IDB] Write failed, falling back to localStorage', e);
        try {
            localStorage.setItem(name, value);
        } catch {
            console.error('[IDB] localStorage fallback also failed (QuotaExceeded?)');
        }
    }
}

// Emergency flush on page hide — uses synchronous localStorage
// because IDB transactions may not complete during unload
if (typeof window !== 'undefined') {
    const emergencyFlush = () => {
        if (document.visibilityState === 'hidden' && pendingName && pendingValue !== null) {
            if (debounceTimer) clearTimeout(debounceTimer);
            try {
                localStorage.setItem(pendingName, pendingValue);
            } catch {
                // QuotaExceeded — nothing we can do
            }
            pendingName = null;
            pendingValue = null;
        }
    };

    document.addEventListener('visibilitychange', emergencyFlush);
    window.addEventListener('beforeunload', () => {
        if (pendingName && pendingValue !== null) {
            if (debounceTimer) clearTimeout(debounceTimer);
            try {
                localStorage.setItem(pendingName, pendingValue);
            } catch { /* ignore */ }
            pendingName = null;
            pendingValue = null;
        }
    });
}

/**
 * Zustand-compatible StateStorage backed by IndexedDB with debounced writes.
 */
export const idbStorage = {
    getItem: async (name: string): Promise<string | null> => {
        try {
            const db = await openDB();
            const value = await new Promise<string | null>((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const request = tx.objectStore(STORE_NAME).get(name);
                request.onsuccess = () => resolve(request.result ?? null);
                request.onerror = () => reject(request.error);
            });

            if (value !== null) {
                // Clean up localStorage copy if IDB has the data
                try { localStorage.removeItem(name); } catch { /* ignore */ }
                return value;
            }

            // Migration: Check localStorage for existing data from pre-IDB versions
            const lsValue = localStorage.getItem(name);
            if (lsValue) {
                console.log('[IDB] Migrating data from localStorage to IndexedDB');
                try {
                    const writeTx = db.transaction(STORE_NAME, 'readwrite');
                    writeTx.objectStore(STORE_NAME).put(lsValue, name);
                    await new Promise<void>((res, rej) => {
                        writeTx.oncomplete = () => res();
                        writeTx.onerror = () => rej(writeTx.error);
                    });
                    localStorage.removeItem(name);
                    console.log('[IDB] Migration complete, localStorage entry removed');
                } catch (migrationErr) {
                    console.warn('[IDB] Migration write failed, data stays in localStorage', migrationErr);
                }
                return lsValue;
            }

            return null;
        } catch (e) {
            console.warn('[IDB] getItem failed, trying localStorage fallback', e);
            return localStorage.getItem(name);
        }
    },

    setItem: (name: string, value: string): void => {
        pendingName = name;
        pendingValue = value;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            flushToIDB().catch(console.error);
        }, DEBOUNCE_MS);
    },

    removeItem: async (name: string): Promise<void> => {
        // Cancel any pending writes
        if (debounceTimer) clearTimeout(debounceTimer);
        pendingName = null;
        pendingValue = null;

        try {
            const db = await openDB();
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).delete(name);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) {
            console.warn('[IDB] removeItem failed', e);
        }
        // Also clean localStorage (migration remnants)
        try { localStorage.removeItem(name); } catch { /* ignore */ }
    },
};

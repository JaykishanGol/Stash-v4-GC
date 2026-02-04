const STORAGE_KEY = 'stash_deleted_tombstones';

export const tombstoneManager = {
    add: (ids: string[]) => {
        try {
            const current = tombstoneManager.getAll();
            const newSet = new Set([...current, ...ids]);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(newSet)));
        } catch (e) {
            console.error('Failed to save tombstones', e);
        }
    },

    getAll: (): string[] => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    },

    has: (id: string): boolean => {
        const all = tombstoneManager.getAll();
        return all.includes(id);
    },

    // Clean up IDs that are no longer returned by server (confirmed deleted)
    prune: (serverIds: string[]) => {
        try {
            const tombstones = tombstoneManager.getAll();
            const serverIdSet = new Set(serverIds);
            
            // Keep tombstones ONLY if they still exist on server (meaning we still need to hide them)
            // If server doesn't return it, it's truly gone, so we can stop tracking it.
            const neededTombstones = tombstones.filter(id => serverIdSet.has(id));
            
            if (neededTombstones.length !== tombstones.length) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(neededTombstones));
            }
        } catch (e) {
            console.error('Failed to prune tombstones', e);
        }
    }
};

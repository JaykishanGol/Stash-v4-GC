/**
 * PersistentSyncQueue Tests
 * 
 * Tests the critical offline sync queue that ensures data operations
 * survive page refreshes and network failures.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the PersistentQueue class directly, but it's exported as a singleton.
// To test properly, we'll re-create the class from scratch by mocking dependencies
// and testing the exported singleton's behavior.

// Mock localStorage
const mockStorage: Record<string, string> = {};
const localStorageMock = {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value; }),
    removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
    clear: vi.fn(() => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// Mock supabase module
const mockSupabase = {
    from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
        })),
    })),
};

vi.mock('../supabase', () => ({
    supabase: mockSupabase,
    isSupabaseConfigured: vi.fn(() => true),
}));

// Mock the store for notification calls
vi.mock('../../store/useAppStore', () => ({
    useAppStore: {
        getState: () => ({
            addNotification: vi.fn(),
        }),
    },
}));

describe('PersistentSyncQueue', () => {
    let persistentSyncQueue: typeof import('./persistentQueue').persistentSyncQueue;

    beforeEach(async () => {
        vi.clearAllMocks();
        localStorageMock.clear();
        Object.keys(mockStorage).forEach(k => delete mockStorage[k]);

        // Reset module to get fresh singleton
        vi.resetModules();
        const mod = await import('./persistentQueue');
        persistentSyncQueue = mod.persistentSyncQueue;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('add()', () => {
        it('should add an operation to the queue', () => {
            persistentSyncQueue.add('upsert-item', 'item-1', { id: 'item-1', title: 'Test' });
            expect(persistentSyncQueue.getPendingCount()).toBe(1);
        });

        it('should deduplicate same-type operations for the same ID', () => {
            persistentSyncQueue.add('upsert-item', 'item-1', { id: 'item-1', title: 'V1' });
            persistentSyncQueue.add('upsert-item', 'item-1', { id: 'item-1', title: 'V2' });
            expect(persistentSyncQueue.getPendingCount()).toBe(1);
        });

        it('should keep operations for different IDs', () => {
            persistentSyncQueue.add('upsert-item', 'item-1', { id: 'item-1', title: 'A' });
            persistentSyncQueue.add('upsert-item', 'item-2', { id: 'item-2', title: 'B' });
            expect(persistentSyncQueue.getPendingCount()).toBe(2);
        });

        it('should remove pending upserts when a delete is added', () => {
            persistentSyncQueue.add('upsert-item', 'item-1', { id: 'item-1', title: 'Test' });
            persistentSyncQueue.add('delete-item', 'item-1', null);
            // Only the delete should remain
            expect(persistentSyncQueue.getPendingCount()).toBe(1);
            const deletes = persistentSyncQueue.getPendingDeletes();
            expect(deletes.has('item-1')).toBe(true);
        });

        it('should persist queue to localStorage', () => {
            persistentSyncQueue.add('upsert-item', 'item-1', { id: 'item-1' });
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                'stash_sync_queue',
                expect.any(String)
            );
        });
    });

    describe('getPendingDeletes()', () => {
        it('should return empty set when no deletes are pending', () => {
            const deletes = persistentSyncQueue.getPendingDeletes();
            expect(deletes.size).toBe(0);
        });

        it('should return IDs of pending delete operations', () => {
            persistentSyncQueue.add('delete-item', 'item-1', null);
            persistentSyncQueue.add('delete-task', 'task-1', null);
            persistentSyncQueue.add('upsert-item', 'item-2', { id: 'item-2' });

            const deletes = persistentSyncQueue.getPendingDeletes();
            expect(deletes.size).toBe(2);
            expect(deletes.has('item-1')).toBe(true);
            expect(deletes.has('task-1')).toBe(true);
            expect(deletes.has('item-2')).toBe(false);
        });
    });

    describe('clearPendingForItems()', () => {
        it('should remove all operations for specified IDs', () => {
            persistentSyncQueue.add('upsert-item', 'item-1', { id: 'item-1' });
            persistentSyncQueue.add('upsert-item', 'item-2', { id: 'item-2' });
            persistentSyncQueue.add('upsert-item', 'item-3', { id: 'item-3' });

            persistentSyncQueue.clearPendingForItems(['item-1', 'item-3']);

            expect(persistentSyncQueue.getPendingCount()).toBe(1);
        });

        it('should handle clearing IDs that are not in the queue', () => {
            persistentSyncQueue.add('upsert-item', 'item-1', { id: 'item-1' });
            persistentSyncQueue.clearPendingForItems(['item-999']);
            expect(persistentSyncQueue.getPendingCount()).toBe(1);
        });
    });

    describe('getPendingItems()', () => {
        it('should return only upsert-item payloads', () => {
            persistentSyncQueue.add('upsert-item', 'item-1', { id: 'item-1', title: 'A' });
            persistentSyncQueue.add('delete-item', 'item-2', null);
            persistentSyncQueue.add('upsert-task', 'task-1', { id: 'task-1', title: 'T' });

            const pending = persistentSyncQueue.getPendingItems();
            expect(pending).toHaveLength(1);
            expect(pending[0].id).toBe('item-1');
        });
    });

    describe('getStats()', () => {
        it('should return stats with pending count', () => {
            const stats = persistentSyncQueue.getStats();
            expect(stats).toHaveProperty('pendingCount');
            expect(stats).toHaveProperty('totalProcessed');
            expect(stats).toHaveProperty('totalFailed');
            expect(stats).toHaveProperty('avgProcessingTimeMs');
            expect(stats.pendingCount).toBe(0);
        });

        it('should reflect pending count after adding items', () => {
            persistentSyncQueue.add('upsert-item', 'item-1', { id: 'item-1' });
            persistentSyncQueue.add('upsert-item', 'item-2', { id: 'item-2' });
            const stats = persistentSyncQueue.getStats();
            expect(stats.pendingCount).toBe(2);
        });
    });

    describe('deduplication edge cases', () => {
        it('should handle rapid updates followed by delete', () => {
            // Simulate rapid edits then delete
            persistentSyncQueue.add('upsert-item', 'item-1', { id: 'item-1', title: 'V1' });
            persistentSyncQueue.add('upsert-item', 'item-1', { id: 'item-1', title: 'V2' });
            persistentSyncQueue.add('upsert-item', 'item-1', { id: 'item-1', title: 'V3' });
            persistentSyncQueue.add('delete-item', 'item-1', null);

            // Should only have the delete
            expect(persistentSyncQueue.getPendingCount()).toBe(1);
            expect(persistentSyncQueue.getPendingDeletes().has('item-1')).toBe(true);
        });

        it('should handle mixed entity types independently', () => {
            persistentSyncQueue.add('upsert-item', 'id-1', { id: 'id-1', title: 'Item' });
            persistentSyncQueue.add('upsert-task', 'id-1', { id: 'id-1', title: 'Task' });

            // Same ID but different types should both exist
            expect(persistentSyncQueue.getPendingCount()).toBe(2);
        });

        it('should handle upsert-list operations', () => {
            persistentSyncQueue.add('upsert-list', 'list-1', { id: 'list-1', name: 'My List' });
            persistentSyncQueue.add('upsert-list', 'list-1', { id: 'list-1', name: 'My List Updated' });

            expect(persistentSyncQueue.getPendingCount()).toBe(1);
        });

        it('should handle delete-list removing pending upsert-list', () => {
            persistentSyncQueue.add('upsert-list', 'list-1', { id: 'list-1', name: 'My List' });
            persistentSyncQueue.add('delete-list', 'list-1', null);

            expect(persistentSyncQueue.getPendingCount()).toBe(1);
            expect(persistentSyncQueue.getPendingDeletes().has('list-1')).toBe(true);
        });
    });

    describe('persistence', () => {
        it('should save queue state to localStorage on every add', () => {
            persistentSyncQueue.add('upsert-item', 'item-1', { id: 'item-1' });

            const saved = localStorageMock.setItem.mock.calls.find(
                ([key, _value]: [string, string]) => key === 'stash_sync_queue'
            );
            expect(saved).toBeDefined();

            const parsed = JSON.parse(saved![1]);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].id).toBe('item-1');
            expect(parsed[0].type).toBe('upsert-item');
            expect(parsed[0].retries).toBe(0);
            expect(parsed[0].timestamp).toBeDefined();
        });
    });
});

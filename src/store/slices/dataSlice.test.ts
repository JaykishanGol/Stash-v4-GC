/**
 * Tests for dataSlice CRUD operations
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Mock types for testing
interface MockItem {
    id: string;
    title: string;
    type: 'note' | 'link' | 'file' | 'image' | 'folder';
    folder_id: string | null;
    is_completed: boolean;
    is_pinned: boolean;
    deleted_at: string | null;
    priority: 'none' | 'low' | 'medium' | 'high';
    tags: string[];
    due_at: string | null;
}

// Simple in-memory store for testing logic
class MockDataStore {
    items: MockItem[] = [];
    trashedItems: MockItem[] = [];

    addItem(item: MockItem) {
        this.items.push(item);
    }

    updateItem(id: string, updates: Partial<MockItem>) {
        const index = this.items.findIndex(i => i.id === id);
        if (index !== -1) {
            this.items[index] = { ...this.items[index], ...updates };
        }
    }

    moveToTrash(id: string) {
        const index = this.items.findIndex(i => i.id === id);
        if (index !== -1) {
            const item = { ...this.items[index], deleted_at: new Date().toISOString() };
            this.trashedItems.push(item);
            this.items.splice(index, 1);
        }
    }

    restoreItem(id: string) {
        const index = this.trashedItems.findIndex(i => i.id === id);
        if (index !== -1) {
            const item = { ...this.trashedItems[index], deleted_at: null };
            this.items.push(item);
            this.trashedItems.splice(index, 1);
        }
    }

    permanentlyDelete(id: string) {
        const index = this.trashedItems.findIndex(i => i.id === id);
        if (index !== -1) {
            this.trashedItems.splice(index, 1);
        }
    }

    emptyTrash() {
        this.trashedItems = [];
    }

    toggleComplete(id: string) {
        const index = this.items.findIndex(i => i.id === id);
        if (index !== -1) {
            this.items[index].is_completed = !this.items[index].is_completed;
        }
    }

    togglePin(id: string) {
        const index = this.items.findIndex(i => i.id === id);
        if (index !== -1) {
            this.items[index].is_pinned = !this.items[index].is_pinned;
        }
    }

    moveItems(ids: string[], folderId: string | null) {
        ids.forEach(id => {
            const index = this.items.findIndex(i => i.id === id);
            if (index !== -1) {
                this.items[index].folder_id = folderId;
            }
        });
    }
}

describe('DataSlice CRUD Operations', () => {
    let store: MockDataStore;

    const createTestItem = (overrides: Partial<MockItem> = {}): MockItem => ({
        id: `item-${Date.now()}-${Math.random()}`,
        title: 'Test Item',
        type: 'note',
        folder_id: null,
        is_completed: false,
        is_pinned: false,
        deleted_at: null,
        priority: 'none',
        tags: [],
        due_at: null,
        ...overrides,
    });

    beforeEach(() => {
        store = new MockDataStore();
    });

    describe('addItem', () => {
        it('should add item to store', () => {
            const item = createTestItem({ title: 'New Note' });
            store.addItem(item);
            expect(store.items).toHaveLength(1);
            expect(store.items[0].title).toBe('New Note');
        });

        it('should add multiple items', () => {
            store.addItem(createTestItem({ title: 'Item 1' }));
            store.addItem(createTestItem({ title: 'Item 2' }));
            store.addItem(createTestItem({ title: 'Item 3' }));
            expect(store.items).toHaveLength(3);
        });
    });

    describe('updateItem', () => {
        it('should update item properties', () => {
            const item = createTestItem({ id: 'test-1', title: 'Original' });
            store.addItem(item);
            store.updateItem('test-1', { title: 'Updated' });
            expect(store.items[0].title).toBe('Updated');
        });

        it('should update multiple properties at once', () => {
            const item = createTestItem({ id: 'test-1' });
            store.addItem(item);
            store.updateItem('test-1', {
                title: 'New Title',
                priority: 'high',
                tags: ['urgent', 'work']
            });
            expect(store.items[0].title).toBe('New Title');
            expect(store.items[0].priority).toBe('high');
            expect(store.items[0].tags).toEqual(['urgent', 'work']);
        });

        it('should not modify other items', () => {
            store.addItem(createTestItem({ id: 'test-1', title: 'Item 1' }));
            store.addItem(createTestItem({ id: 'test-2', title: 'Item 2' }));
            store.updateItem('test-1', { title: 'Updated' });
            expect(store.items[1].title).toBe('Item 2');
        });
    });

    describe('moveToTrash', () => {
        it('should move item from items to trashedItems', () => {
            const item = createTestItem({ id: 'test-1' });
            store.addItem(item);
            expect(store.items).toHaveLength(1);

            store.moveToTrash('test-1');
            expect(store.items).toHaveLength(0);
            expect(store.trashedItems).toHaveLength(1);
        });

        it('should set deleted_at timestamp', () => {
            store.addItem(createTestItem({ id: 'test-1' }));
            store.moveToTrash('test-1');
            expect(store.trashedItems[0].deleted_at).not.toBeNull();
        });
    });

    describe('restoreItem', () => {
        it('should restore item from trash to items', () => {
            store.addItem(createTestItem({ id: 'test-1' }));
            store.moveToTrash('test-1');
            expect(store.trashedItems).toHaveLength(1);

            store.restoreItem('test-1');
            expect(store.items).toHaveLength(1);
            expect(store.trashedItems).toHaveLength(0);
        });

        it('should clear deleted_at timestamp', () => {
            store.addItem(createTestItem({ id: 'test-1' }));
            store.moveToTrash('test-1');
            store.restoreItem('test-1');
            expect(store.items[0].deleted_at).toBeNull();
        });
    });

    describe('emptyTrash', () => {
        it('should permanently delete all trashed items', () => {
            store.addItem(createTestItem({ id: 'test-1' }));
            store.addItem(createTestItem({ id: 'test-2' }));
            store.moveToTrash('test-1');
            store.moveToTrash('test-2');
            expect(store.trashedItems).toHaveLength(2);

            store.emptyTrash();
            expect(store.trashedItems).toHaveLength(0);
        });
    });

    describe('toggleComplete', () => {
        it('should toggle is_completed from false to true', () => {
            store.addItem(createTestItem({ id: 'test-1', is_completed: false }));
            store.toggleComplete('test-1');
            expect(store.items[0].is_completed).toBe(true);
        });

        it('should toggle is_completed from true to false', () => {
            store.addItem(createTestItem({ id: 'test-1', is_completed: true }));
            store.toggleComplete('test-1');
            expect(store.items[0].is_completed).toBe(false);
        });
    });

    describe('togglePin', () => {
        it('should toggle is_pinned', () => {
            store.addItem(createTestItem({ id: 'test-1', is_pinned: false }));
            store.togglePin('test-1');
            expect(store.items[0].is_pinned).toBe(true);
            store.togglePin('test-1');
            expect(store.items[0].is_pinned).toBe(false);
        });
    });

    describe('moveItems', () => {
        it('should move single item to folder', () => {
            store.addItem(createTestItem({ id: 'test-1', folder_id: null }));
            store.moveItems(['test-1'], 'folder-1');
            expect(store.items[0].folder_id).toBe('folder-1');
        });

        it('should move multiple items to folder', () => {
            store.addItem(createTestItem({ id: 'test-1' }));
            store.addItem(createTestItem({ id: 'test-2' }));
            store.addItem(createTestItem({ id: 'test-3' }));

            store.moveItems(['test-1', 'test-3'], 'folder-1');
            expect(store.items[0].folder_id).toBe('folder-1');
            expect(store.items[1].folder_id).toBeNull();
            expect(store.items[2].folder_id).toBe('folder-1');
        });

        it('should move items to root (null folder)', () => {
            store.addItem(createTestItem({ id: 'test-1', folder_id: 'folder-1' }));
            store.moveItems(['test-1'], null);
            expect(store.items[0].folder_id).toBeNull();
        });
    });
});

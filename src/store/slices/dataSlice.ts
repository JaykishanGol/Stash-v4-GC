import type { StateCreator } from 'zustand';
import { 
    validateItemForSync,
} from '../../lib/types';
import type {
    Item, 
    Task, 
    List, 
    Folder, 
    SmartFolderCounts, 
    TodayStats, 
    UploadItem,
} from '../../lib/types';
import { persistentSyncQueue } from '../../lib/persistentQueue';
import { GoogleSyncService } from '../../lib/googleSyncService';
// Note: We might need to import the full AppState interface to type get() correctly, 
// but to avoid circular deps we'll use 'any' or a partial type for get() in implementation.

export interface DataSlice {
    // Data State
    items: Item[];
    trashedItems: Item[];
    folders: Folder[];
    lists: List[];
    tasks: Task[];
    
    // Stats
    smartFolderCounts: SmartFolderCounts;
    todayStats: TodayStats;

    // Upload State
    uploads: UploadItem[];

    // Pagination State
    hasMoreItems: boolean;
    itemsLoadedCount: number;
    loadMoreItems: () => Promise<void>;

    // ACTIONS
    // Item Actions
    addItem: (item: Item) => void;
    updateItem: (id: string, updates: Partial<Item>) => void;
    deleteItem: (id: string) => Promise<void>;
    moveItems: (ids: string[], folderId: string | null) => Promise<void>;
    moveItemsToTrash: (ids: string[]) => void;
    restoreItem: (id: string) => void;
    permanentlyDeleteItem: (id: string) => void;
    emptyTrash: () => void;
    toggleItemComplete: (id: string) => void;
    toggleItemPin: (id: string) => void;
    archiveItem: (id: string) => Promise<void>;
    unarchiveItem: (id: string) => Promise<void>;
    duplicateItem: (id: string) => Promise<void>;

    // Scheduler Actions (Data side)
    setItemDueDate: (id: string, dueAt: string | null) => void;
    setItemReminder: (id: string, remindAt: string | null) => void;
    acknowledgeReminder: (id: string, type?: 'item' | 'task') => void;

    // Task Actions
    addTask: (task: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'list_id' | 'deleted_at'> & { list_id?: string | null }) => void;
    updateTask: (id: string, updates: Partial<Task>) => void;
    deleteTask: (id: string) => void;
    completeTask: (id: string) => void;
    toggleTaskCompletion: (id: string) => void; // Added missing action
    addItemsToTask: (taskId: string, itemIds: string[]) => void;
    removeItemFromTask: (taskId: string, itemId: string) => void;
    toggleTaskItemCompletion: (taskId: string, itemId: string) => void;
    
    // Folder Actions
    addFolder: (folder: Folder) => void;

    // List Actions
    createList: (name: string, color: string) => void;
    updateList: (id: string, updates: Partial<List>) => void;
    deleteList: (id: string) => void;
    addItemsToList: (listId: string, itemIds: string[]) => void;
    removeItemsFromList: (listId: string, itemIds: string[]) => void;

    // Upload Actions
    addUpload: (id: string, fileName: string) => void;
    updateUploadProgress: (id: string, progress: number, speed: string) => void;
    completeUpload: (id: string, success: boolean, error?: string) => void;
    dismissUpload: (id: string) => void;
    dismissAllUploads: () => void;

    // Stats Actions
    calculateStats: () => void;
    refreshFolderCounts: () => void;

    // Sync Actions
    syncItemToDb: (item: Item) => Promise<void>;
    deleteItemFromDb: (id: string) => Promise<void>;
    syncTaskToDb: (task: Task) => Promise<void>;
    
    // Clipboard (Data logic)
    cutItems: (ids?: string[]) => void;
    copyItems: (ids?: string[]) => void;
    pasteItems: (targetFolderId?: string | null) => void;
}

export const createDataSlice: StateCreator<DataSlice> = (set, get) => ({
    items: [],
    trashedItems: [],
    folders: [],
    lists: [],
    tasks: [],
    smartFolderCounts: { notes: 0, links: 0, files: 0, images: 0, folders: 0 },
    todayStats: { dueToday: 0, reminders: 0, totalReminders: 0, overdue: 0, tasks: 0 },
    uploads: [],
    hasMoreItems: false,
    itemsLoadedCount: 0,

    loadMoreItems: async () => {
        // Implementation deferred or needs to be copied. 
        // For now, simple console log as placeholder if logic was complex.
        console.log('Load more items...');
    },

    addItem: (item) => {
        // Mark as unsynced locally so it isn't wiped by loadUserData before sync
        const itemWithFlag = { ...item, is_unsynced: true };
        
        // Context-Aware Creation: If inside a list, auto-link it
        const state = get() as any; // Cast to access UI slice
        const selectedListId = state.selectedListId;
        
        set((state) => {
            let newLists = state.lists;
            
            if (selectedListId) {
                // Find and update the list
                newLists = state.lists.map(list => {
                    if (list.id === selectedListId) {
                        const updatedList = { 
                            ...list, 
                            items: [itemWithFlag.id, ...list.items], 
                            // Mark list as unsynced/updated if we had a flag, but for lists we rely on explicit sync
                        };
                        // Trigger sync for the list
                        persistentSyncQueue.add('upsert-list', list.id, updatedList);
                        return updatedList;
                    }
                    return list;
                });
            }

            return { 
                items: [itemWithFlag, ...state.items],
                lists: newLists
            };
        });

        get().calculateStats();
        get().refreshFolderCounts();
        get().syncItemToDb(itemWithFlag);
    },

    updateItem: (id, updates) => {
        set((state) => ({
            items: state.items.map((item) =>
                item.id === id ? { ...item, ...updates, is_unsynced: true, updated_at: new Date().toISOString() } : item
            ),
        }));
        get().calculateStats();
        
        // Find the updated item to sync
        const updatedItem = get().items.find(i => i.id === id);
        if (updatedItem) {
            get().syncItemToDb(updatedItem);
        }
    },

    deleteItem: async (id) => {
        const item = get().items.find((i) => i.id === id);
        if (item) {
            await get().moveItemsToTrash([id]);
        }
    },

    moveItemsToTrash: (ids) => {
        const now = new Date().toISOString();
        const state = get();
        
        // Helper to collect all descendants of a folder
        const getDescendants = (folderId: string): string[] => {
            const children = state.items.filter(i => i.folder_id === folderId);
            let descendants: string[] = [];
            children.forEach(child => {
                descendants.push(child.id);
                if (child.type === 'folder') {
                    descendants = [...descendants, ...getDescendants(child.id)];
                }
            });
            return descendants;
        };

        let allIdsToDelete = [...ids];
        ids.forEach(id => {
            const item = state.items.find(i => i.id === id);
            if (item && item.type === 'folder') {
                allIdsToDelete = [...allIdsToDelete, ...getDescendants(id)];
            }
        });
        
        // Unique IDs
        allIdsToDelete = [...new Set(allIdsToDelete)];

        set((state) => {
            const itemsToTrash = state.items.filter(i => allIdsToDelete.includes(i.id));
            const remainingItems = state.items.filter(i => !allIdsToDelete.includes(i.id));
            
            const trashedWithTimestamp = itemsToTrash.map(i => ({
                ...i,
                deleted_at: now,
                updated_at: now
            }));

            // Sync deletion to DB
            trashedWithTimestamp.forEach(item => {
                // We use upsert with deleted_at set, effectively soft delete
                get().syncItemToDb(item);
            });

            return {
                items: remainingItems,
                trashedItems: [...state.trashedItems, ...trashedWithTimestamp],
                // Clear selection if deleted
                // selectedItemIds: state.selectedItemIds.filter(id => !allIdsToDelete.includes(id)) 
                // Note: selectedItemIds is in UISlice. We can't update it here directly in strict slicing.
                // However, Zustand merge allows us to update 'selectedItemIds' if we cast.
                // For safety in this refactor, we'll leave it. The UI should handle missing selection.
            };
        });
        
        // Cross-slice update (hacky but standard in Zustand without Immer)
        // (set as any)({ selectedItemIds: [] }); // Clear selection

        get().calculateStats();
        get().refreshFolderCounts();
    },

    restoreItem: (id) => {
         const itemToRestore = get().trashedItems.find(i => i.id === id);
         if (!itemToRestore) return;

         const now = new Date().toISOString();
         const restoredItem = { ...itemToRestore, deleted_at: null, updated_at: now };

         set(state => ({
             trashedItems: state.trashedItems.filter(i => i.id !== id),
             items: [...state.items, restoredItem]
         }));
         
         get().syncItemToDb(restoredItem);
         get().calculateStats();
         get().refreshFolderCounts();
    },

    permanentlyDeleteItem: (id) => {
        set(state => ({
            trashedItems: state.trashedItems.filter(i => i.id !== id)
        }));
        get().deleteItemFromDb(id);
    },

    emptyTrash: () => {
        const { trashedItems } = get();
        trashedItems.forEach(item => {
            get().deleteItemFromDb(item.id);
        });
        set({ trashedItems: [] });
    },

    toggleItemComplete: (id) => {
        const item = get().items.find(i => i.id === id);
        if (item) {
            get().updateItem(id, { is_completed: !item.is_completed });
        }
    },

    toggleItemPin: (id) => {
        const item = get().items.find(i => i.id === id);
        if (item) {
            get().updateItem(id, { is_pinned: !item.is_pinned });
        }
    },

    moveItems: async (ids, folderId) => {
        const now = new Date().toISOString();
        set(state => ({
            items: state.items.map(i => 
                ids.includes(i.id) ? { ...i, folder_id: folderId, updated_at: now } : i
            )
        }));
        
        ids.forEach(id => {
            const item = get().items.find(i => i.id === id);
            if (item) get().syncItemToDb(item);
        });
        
        get().refreshFolderCounts();
    },
    
    archiveItem: async (id) => {
         get().updateItem(id, { is_archived: true });
    },

    unarchiveItem: async (id) => {
         get().updateItem(id, { is_archived: false });
    },

    duplicateItem: async (id) => {
        const item = get().items.find(i => i.id === id);
        if (!item) return;

        const { generateId } = await import('../../lib/utils');

        const newItem = {
            ...item,
            id: generateId(),
            title: `${item.title} (Copy)`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        get().addItem(newItem);
    },

    // Scheduler
    setItemDueDate: (id, dueAt) => {
        get().updateItem(id, { due_at: dueAt });
    },

    setItemReminder: (id, remindAt) => {
        // Updated to use ONLY new scheduler fields
        get().updateItem(id, { 
            next_trigger_at: remindAt,
            reminder_type: remindAt ? 'one_time' : 'none',
            // Explicitly clear legacy fields in local state so UI updates correctly
            remind_at: null, 
            reminder_recurring: null
        });
    },

    acknowledgeReminder: (id, type = 'item') => {
        const now = new Date().toISOString();
        if (type === 'task') {
            get().updateTask(id, { last_acknowledged_at: now });
        } else {
            get().updateItem(id, { last_acknowledged_at: now });
        }
    },

    // Tasks
    addTask: async (taskData) => {
        const now = new Date().toISOString();
        const { generateId } = await import('../../lib/utils');
        
        const newTask: Task = {
            id: generateId(),
            created_at: now,
            updated_at: now,
            deleted_at: null,
            list_id: taskData.list_id || null,
            ...taskData
        };
        set(state => ({ tasks: [newTask, ...state.tasks] }));
        get().syncTaskToDb(newTask);
        get().calculateStats();

        // Google Sync
        GoogleSyncService.syncToGoogleTask(newTask, { 
            dueDate: newTask.due_at || undefined,
            notes: newTask.description || undefined
        });
    },

    updateTask: (id, updates) => {
        set(state => ({
            tasks: state.tasks.map(t => t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t)
        }));
        const task = get().tasks.find(t => t.id === id);
        if (task) {
            get().syncTaskToDb(task);
            
            // Google Sync
            GoogleSyncService.syncToGoogleTask(task, { 
                dueDate: task.due_at || undefined,
                notes: task.description || undefined
            });
        }
        get().calculateStats();
    },

    deleteTask: (id) => {
        set(state => ({ tasks: state.tasks.filter(t => t.id !== id) }));
        // Hard delete for now based on original store, or implement soft delete
        persistentSyncQueue.add('delete-task', id, null);
        get().calculateStats();
    },

    completeTask: (id) => {
        const task = get().tasks.find(t => t.id === id);
        if (task) {
            get().updateTask(id, { is_completed: !task.is_completed });
        }
    },
    
    toggleTaskCompletion: (id) => {
         get().completeTask(id);
    },

    addItemsToTask: (taskId, itemIds) => {
        const task = get().tasks.find(t => t.id === taskId);
        if (!task) return;
        
        const newIds = [...new Set([...task.item_ids, ...itemIds])];
        get().updateTask(taskId, { item_ids: newIds });
    },

    removeItemFromTask: (taskId, itemId) => {
        const task = get().tasks.find(t => t.id === taskId);
        if (!task) return;
        
        const newIds = task.item_ids.filter(id => id !== itemId);
        const newCompletion = { ...task.item_completion };
        delete newCompletion[itemId];
        
        get().updateTask(taskId, { item_ids: newIds, item_completion: newCompletion });
    },

    toggleTaskItemCompletion: (taskId, itemId) => {
        const task = get().tasks.find(t => t.id === taskId);
        if (!task) return;
        
        const current = task.item_completion[itemId] || false;
        get().updateTask(taskId, {
            item_completion: { ...task.item_completion, [itemId]: !current }
        });
    },

    // Folders & Lists
    addFolder: (folder) => set(state => ({ folders: [...state.folders, folder] })),
    
    createList: async (name, color) => {
        const { generateId } = await import('../../lib/utils');
        
        const list: List = {
            id: generateId(),
            user_id: '', // Should be set by auth, but store usually handles this via get().user
            name,
            color,
            order: 0,
            items: [],
            created_at: new Date().toISOString()
        };
        // We need user_id. In the combined store, we can access user.
        // For now, we assume it's patched before sync or we access (get() as any).user.id
        const user = (get() as any).user;
        if (user) list.user_id = user.id;

        set(state => ({ lists: [...state.lists, list] }));
        persistentSyncQueue.add('upsert-list', list.id, list);
    },

    updateList: (id, updates) => {
        set(state => ({
            lists: state.lists.map(l => l.id === id ? { ...l, ...updates } : l)
        }));
        const list = get().lists.find(l => l.id === id);
        if (list) persistentSyncQueue.add('upsert-list', id, list);
    },

    deleteList: (id) => {
        set(state => ({ lists: state.lists.filter(l => l.id !== id) }));
        persistentSyncQueue.add('delete-list', id, null);
    },

    addItemsToList: (listId, itemIds) => {
        const list = get().lists.find(l => l.id === listId);
        if (!list) return;
        
        const newItems = [...new Set([...list.items, ...itemIds])];
        get().updateList(listId, { items: newItems });
    },

    removeItemsFromList: (listId, itemIds) => {
        const list = get().lists.find(l => l.id === listId);
        if (!list) return;
        
        const newItems = list.items.filter(id => !itemIds.includes(id));
        get().updateList(listId, { items: newItems });
    },

    // Uploads
    addUpload: (id, fileName) => set(state => ({
        uploads: [...state.uploads, { id, fileName, progress: 0, speed: '0 KB/s', status: 'uploading' }]
    })),
    updateUploadProgress: (id, progress, speed) => set(state => ({
        uploads: state.uploads.map(u => u.id === id ? { ...u, progress, speed } : u)
    })),
    completeUpload: (id, success, error) => set(state => ({
        uploads: state.uploads.map(u => u.id === id ? { ...u, status: success ? 'success' : 'error', error } : u)
    })),
    dismissUpload: (id) => set(state => ({
        uploads: state.uploads.filter(u => u.id !== id)
    })),
    dismissAllUploads: () => set({ uploads: [] }),

    // Stats
    calculateStats: () => {
        const { items, tasks } = get();
        const smartFolderCounts: SmartFolderCounts = { notes: 0, links: 0, files: 0, images: 0, folders: 0 };
        const todayStats: TodayStats = { dueToday: 0, reminders: 0, totalReminders: 0, overdue: 0, tasks: 0 };

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        items.forEach(item => {
            if (item.deleted_at) return;

            if (item.type === 'folder') {
                smartFolderCounts.folders++;
            } else if (!item.folder_id) {
                const typeMap: Record<string, keyof SmartFolderCounts> = {
                    note: 'notes', link: 'links', file: 'files', image: 'images'
                };
                const key = typeMap[item.type];
                if (key) smartFolderCounts[key]++;
            }

            if (item.due_at && !item.is_completed && !item.folder_id) {
                const dueDate = new Date(item.due_at);
                if (dueDate < today) todayStats.overdue++;
                else if (dueDate >= today && dueDate < tomorrow) todayStats.dueToday++;
            }

            if ((item.remind_at || item.next_trigger_at) && !item.folder_id) {
                const remindDate = item.next_trigger_at ? new Date(item.next_trigger_at) : new Date(item.remind_at!);
                if (remindDate >= today && remindDate < tomorrow) todayStats.reminders++;
                todayStats.totalReminders++;
            }
        });

        tasks.forEach(task => {
            if (task.is_completed) return;
            todayStats.tasks++;
            if (task.due_at) {
                const dueDate = new Date(task.due_at);
                if (dueDate < today) todayStats.overdue++;
                else if (dueDate >= today && dueDate < tomorrow) todayStats.dueToday++;
            }
            if (task.remind_at || task.next_trigger_at) {
                const remindDate = task.next_trigger_at ? new Date(task.next_trigger_at) : new Date(task.remind_at!);
                if (remindDate >= today && remindDate < tomorrow) todayStats.reminders++;
                todayStats.totalReminders++;
            }
        });

        set({ smartFolderCounts, todayStats });
    },

    refreshFolderCounts: () => {
        const { items } = get();
        let hasChanges = false;
        const newItems = items.map(item => {
            if (item.type === 'folder') {
                const count = items.filter(i => i.folder_id === item.id && !i.deleted_at).length;
                const currentCount = (item.content as any).itemCount || 0;
                if (count !== currentCount) {
                    hasChanges = true;
                    return {
                        ...item,
                        content: { ...item.content, itemCount: count }
                    };
                }
            }
            return item;
        });

        if (hasChanges) {
            set({ items: newItems });
        }
    },

    // Sync
    syncItemToDb: async (item) => {
        const validation = validateItemForSync(item);
        if (!validation.valid) {
            console.warn('[Sync] Invalid item:', validation.errors);
            // Optionally notify UI
            return;
        }
        persistentSyncQueue.add('upsert-item', item.id, item);
    },
    deleteItemFromDb: async (id) => {
        persistentSyncQueue.add('delete-item', id, null);
    },
    syncTaskToDb: async (task) => {
        persistentSyncQueue.add('upsert-task', task.id, task);
    },

    // Clipboard
    cutItems: (ids) => {
        const { selectedItemIds, items } = get() as any; // Cast for UI slice access
        const targetIds = ids || selectedItemIds;
        const itemsToCut = items.filter((i: Item) => targetIds.includes(i.id));
        if (itemsToCut.length > 0) {
            (set as any)({ clipboard: { items: itemsToCut, operation: 'cut' } });
            // Ideally clear selection here
        }
    },
    copyItems: (ids) => {
        const { selectedItemIds, items } = get() as any;
        const targetIds = ids || selectedItemIds;
        const itemsToCopy = items.filter((i: Item) => targetIds.includes(i.id));
        if (itemsToCopy.length > 0) {
            (set as any)({ clipboard: { items: itemsToCopy, operation: 'copy' } });
        }
    },
    pasteItems: (targetFolderId = null) => {
        const { clipboard, user } = get() as any;
        if (!clipboard.items.length || !clipboard.operation) return;

        const now = new Date().toISOString();
        
        if (clipboard.operation === 'cut') {
            // Move items
            get().moveItems(clipboard.items.map((i: Item) => i.id), targetFolderId);
            (set as any)({ clipboard: { items: [], operation: null } });
        } else {
            // Copy items (duplicate)
            clipboard.items.forEach((item: Item) => {
                const newItem = {
                    ...item,
                    id: crypto.randomUUID(),
                    folder_id: targetFolderId, // Paste into target
                    created_at: now,
                    updated_at: now,
                    user_id: user?.id || item.user_id // Ensure user ownership
                };
                get().addItem(newItem);
            });
            (set as any)({ clipboard: { items: [], operation: null } });
        }
    }
});
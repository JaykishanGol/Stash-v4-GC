import type { StateCreator } from 'zustand';
import type { AppState } from '../types';
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
import { tombstoneManager } from '../../lib/tombstones';
import { adaptItemRows } from '../../lib/dbAdapters';
import { 
    undoStack, 
    createDeleteItemsAction, 
    createMoveItemsAction,
} from '../../lib/undoStack';
import { scheduleSync } from '../../lib/sync';

// Debounce helper for expensive store computations
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return ((...args: any[]) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    }) as unknown as T;
}

// Module-level references to set/get, assigned once when the slice is created
let _sliceGet: (() => AppState) | null = null;
let _sliceSet: ((partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void) | null = null;

// Debounced implementations (created once at module load, use module-level get/set refs)
const _debouncedCalculateStats = debounce(() => {
    if (!_sliceGet || !_sliceSet) return;
    const { items, tasks } = _sliceGet();
    const smartFolderCounts: SmartFolderCounts = { notes: 0, links: 0, files: 0, images: 0, folders: 0 };
    const todayStats: TodayStats = { dueToday: 0, reminders: 0, totalReminders: 0, overdue: 0, tasks: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    items.forEach(item => {
        if (item.deleted_at || item.is_archived) return;
        if (item.type === 'folder') {
            smartFolderCounts.folders++;
        } else {
            const typeMap: Record<string, keyof SmartFolderCounts> = {
                note: 'notes', link: 'links', file: 'files', image: 'images'
            };
            const key = typeMap[item.type];
            if (key) smartFolderCounts[key]++;
        }
        if (item.scheduled_at && !item.is_completed) {
            const scheduledDate = new Date(item.scheduled_at);
            if (scheduledDate < today && !item.is_completed) todayStats.overdue++;
            else if (scheduledDate >= today && scheduledDate < tomorrow) todayStats.dueToday++;
            if (item.remind_before !== null && item.remind_before !== undefined) {
                if (scheduledDate >= today && scheduledDate < tomorrow) todayStats.reminders++;
                todayStats.totalReminders++;
            }
        }
    });

    tasks.forEach(task => {
        if (task.is_completed) return;
        todayStats.tasks++;
        if (task.scheduled_at) {
            const scheduledDate = new Date(task.scheduled_at);
            if (scheduledDate < today) todayStats.overdue++;
            else if (scheduledDate >= today && scheduledDate < tomorrow) todayStats.dueToday++;
            if (task.remind_before !== null) {
                if (scheduledDate >= today && scheduledDate < tomorrow) todayStats.reminders++;
                todayStats.totalReminders++;
            }
        }
    });

    _sliceSet({ smartFolderCounts, todayStats });
}, 300);

const _debouncedRefreshFolderCounts = debounce(() => {
    if (!_sliceGet || !_sliceSet) return;
    const { items } = _sliceGet();
    let hasChanges = false;
    const updatedFolders: typeof items = [];

    // Build a parent→children count map for O(n) instead of O(n²)
    const childCountMap = new Map<string, number>();
    for (const item of items) {
        if (item.folder_id && !item.deleted_at) {
            childCountMap.set(item.folder_id, (childCountMap.get(item.folder_id) || 0) + 1);
        }
    }

    const newItems = items.map(item => {
        if (item.type === 'folder') {
            const count = childCountMap.get(item.id) || 0;
            const currentCount = (item.content as any).itemCount || 0;
            if (count !== currentCount) {
                hasChanges = true;
                const updatedFolder = {
                    ...item,
                    content: { ...item.content, itemCount: count },
                    updated_at: new Date().toISOString()
                };
                updatedFolders.push(updatedFolder);
                return updatedFolder;
            }
        }
        return item;
    });

    if (hasChanges) {
        _sliceSet({ items: newItems });
    }
}, 500);


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

    // Search Actions
    searchItems: (query: string) => Promise<Item[]>;

    // Data Reset (for sign out)
    clearAllUserData: () => void;
}

export const createDataSlice: StateCreator<AppState, [], [], DataSlice> = (set, get) => {
    // Wire up module-level refs for debounced functions
    _sliceGet = get;
    _sliceSet = set;

    return {
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
        const state = get();
        const { user, itemsLoadedCount, hasMoreItems } = state;
        
        if (!user || !hasMoreItems) {
            console.log('[Store] Load more skipped: no user or no more items');
            return;
        }

        const PAGE_SIZE = 500;

        try {
            const { supabase, isSupabaseConfigured } = await import('../../lib/supabase');

            if (!isSupabaseConfigured()) {
                return;
            }

            console.log(`[Store] Loading more items from offset ${itemsLoadedCount}...`);

            const { data: moreItems, error, count } = await supabase
                .from('items')
                .select('*', { count: 'exact' })
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .range(itemsLoadedCount, itemsLoadedCount + PAGE_SIZE - 1);

            if (error) {
                console.error('[Store] Error loading more items:', error);
                return;
            }

            if (moreItems && moreItems.length > 0) {
                const adapted = adaptItemRows(moreItems);
                const activeItems = adapted.filter((i: Item) => !i.deleted_at);
                const trashedItems = adapted.filter((i: Item) => i.deleted_at);

                set((state) => ({
                    items: [...state.items, ...activeItems],
                    trashedItems: [...state.trashedItems, ...trashedItems],
                    itemsLoadedCount: state.itemsLoadedCount + moreItems.length,
                    hasMoreItems: count ? (state.itemsLoadedCount + moreItems.length) < count : false,
                }));

                console.log(`[Store] Loaded ${moreItems.length} more items. Total: ${itemsLoadedCount + moreItems.length}`);
                get().calculateStats();
            } else {
                set({ hasMoreItems: false });
            }
        } catch (error) {
            console.error('[Store] Error in loadMoreItems:', error);
            get().addNotification?.('error', 'Load Failed', 'Could not load more items. Check your connection.');
        }
    },

    addItem: (item) => {
        // Mark as unsynced locally so it isn't wiped by loadUserData before sync
        const itemWithFlag = { ...item, is_unsynced: true };

        // Context-Aware Creation: If inside a list, auto-link it
        const state = get();
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
        scheduleSync();
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
            scheduleSync();
        }
    },

    deleteItem: async (id) => {
        const item = get().items.find((i) => i.id === id);
        if (item) {
            await get().moveItemsToTrash([id]);
        }
    },

    moveItemsToTrash: async (ids) => {
        const now = new Date().toISOString();

        // 1. Check for Folders to use RPC optimization (read state BEFORE async gap)
        const preState = get();
        const folderIds = ids.filter(id => preState.items.find(i => i.id === id)?.type === 'folder');

        // If we have folders, try to use the Server-Side RPC first (Phase 1 Fix)
        if (folderIds.length > 0) {
            const { supabase, isSupabaseConfigured } = await import('../../lib/supabase');
            if (isSupabaseConfigured()) {
                for (const folderId of folderIds) {
                    try {
                        await supabase.rpc('delete_folder_recursive', { target_folder_id: folderId });
                    } catch (err) {
                        console.error('RPC delete failed, falling back to local recursion', err);
                    }
                }
            }
        }

        // 2. Re-read state AFTER async operations to avoid stale references
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

        // Save items for undo BEFORE deleting
        const itemsToTrash = state.items.filter(i => allIdsToDelete.includes(i.id));
        
        // Push to undo stack
        undoStack.push(createDeleteItemsAction(itemsToTrash));
        get().updateUndoState();

        set((state) => {
            const itemsToTrash = state.items.filter(i => allIdsToDelete.includes(i.id));
            const remainingItems = state.items.filter(i => !allIdsToDelete.includes(i.id));

            const trashedWithTimestamp = itemsToTrash.map(i => ({
                ...i,
                deleted_at: now,
                updated_at: now
            }));

            // Sync deletion to DB (Fallback for items not covered by RPC or if offline)
            // If RPC succeeded, these upserts are redundant but harmless (idempotent)
            trashedWithTimestamp.forEach(item => {
                get().syncItemToDb(item);
            });

            return {
                items: remainingItems,
                trashedItems: [
                    ...state.trashedItems.filter(i => !allIdsToDelete.includes(i.id)),
                    ...trashedWithTimestamp
                ],
            };
        });

        get().calculateStats();
        get().refreshFolderCounts();
        
        // Clean up notifications referencing trashed items
        const currentNotifications = get().notifications;
        const filteredNotifications = currentNotifications.filter(
            n => !n.itemId || !allIdsToDelete.includes(n.itemId)
        );
        if (filteredNotifications.length !== currentNotifications.length) {
            set({ notifications: filteredNotifications });
        }

        // Notify with Undo
        get().addNotification(
            'success', 
            `Moved ${itemsToTrash.length} item${itemsToTrash.length !== 1 ? 's' : ''} to trash`, 
            'Undo available',
            'Undo',
            () => get().undo()
        );
        scheduleSync();
    },

    restoreItem: (id) => {
        const state = get();
        const itemToRestore = state.trashedItems.find(i => i.id === id);
        if (!itemToRestore) return;

        // Helper to collect all descendants in trash
        const getTrashedDescendants = (folderId: string): string[] => {
            const children = state.trashedItems.filter(i => i.folder_id === folderId);
            let descendants: string[] = [];
            children.forEach(child => {
                descendants.push(child.id);
                if (child.type === 'folder') {
                    descendants = [...descendants, ...getTrashedDescendants(child.id)];
                }
            });
            return descendants;
        };

        let idsToRestore = [id];
        if (itemToRestore.type === 'folder') {
            idsToRestore = [...idsToRestore, ...getTrashedDescendants(id)];
        }

        const now = new Date().toISOString();
        
        set(state => {
            const itemsRestoring = state.trashedItems.filter(i => idsToRestore.includes(i.id));
            const restoredItems = itemsRestoring.map(i => ({
                 ...i, 
                 deleted_at: null, 
                 updated_at: now 
            }));

            return {
                trashedItems: state.trashedItems.filter(i => !idsToRestore.includes(i.id)),
                items: [...state.items, ...restoredItems]
            };
        });

        // Sync all restored items
        idsToRestore.forEach(itemId => {
            const item = get().items.find(i => i.id === itemId);
            if (item) get().syncItemToDb(item);
        });

        get().calculateStats();
        get().refreshFolderCounts();
        scheduleSync();
    },

    permanentlyDeleteItem: async (id) => {
        const state = get();
        const item = state.trashedItems.find(i => i.id === id);

        // Helper to collect all descendants (same as moveItemsToTrash)
        const getDescendants = (folderId: string): string[] => {
            const children = [...state.items, ...state.trashedItems].filter(i => i.folder_id === folderId);
            let descendants: string[] = [];
            children.forEach(child => {
                descendants.push(child.id);
                if (child.type === 'folder') {
                    descendants = [...descendants, ...getDescendants(child.id)];
                }
            });
            return descendants;
        };

        let idsToDelete = [id];
        if (item && item.type === 'folder') {
            idsToDelete = [...idsToDelete, ...getDescendants(id)];
        }
        
        // Remove duplicates
        idsToDelete = [...new Set(idsToDelete)];

        // CRITICAL: Clear pending queue operations for these items.
        // This prevents resurrection if a soft-delete upsert is still pending.
        persistentSyncQueue.clearPendingForItems(idsToDelete);
        
        // TOMBSTONE: Locally ban these IDs immediately.
        // Even if server delete fails or lags, these will never show in UI again.
        tombstoneManager.add(idsToDelete);

        // Clean up storage for ALL items
        for (const targetId of idsToDelete) {
            const targetItem = [...state.items, ...state.trashedItems].find(i => i.id === targetId);
            if (targetItem?.file_meta?.path) {
                try {
                    const { deleteFile } = await import('../../lib/supabase');
                    await deleteFile(targetItem.file_meta.path);
                } catch (err) {
                    console.warn('[DataSlice] Failed to delete storage file:', targetItem.file_meta.path, err);
                }
            }
        }

        set(state => ({
            trashedItems: state.trashedItems.filter(i => !idsToDelete.includes(i.id)),
            items: state.items.filter(i => !idsToDelete.includes(i.id)) // Just in case
        }));

        // Queue deletes for ALL items
        // We use a loop, or `persistentQueue` needs a bulk delete.
        // Loop is fine for now.
        idsToDelete.forEach(targetId => {
            get().deleteItemFromDb(targetId);
        });
        scheduleSync();
    },

    emptyTrash: async () => {
        const { trashedItems } = get();
        const trashedIds = trashedItems.map(i => i.id);

        if (trashedIds.length === 0) return;

        // 1. Clean up storage files (Best effort)
        for (const item of trashedItems) {
            if (item.file_meta?.path) {
                try {
                    const { deleteFile } = await import('../../lib/supabase');
                    await deleteFile(item.file_meta.path);
                } catch (err) {
                    console.warn('[DataSlice] Failed to delete storage file:', item.file_meta.path, err);
                }
            }
        }

        // 2. CRITICAL: Clear pending queue operations for these items.
        // This prevents resurrection if a soft-delete upsert is still pending.
        persistentSyncQueue.clearPendingForItems(trashedIds);
        
        // 3. TOMBSTONE: Locally ban these IDs immediately. 
        // Even if server delete fails or lags, these will never show in UI again.
        tombstoneManager.add(trashedIds);

        const { supabase, isSupabaseConfigured } = await import('../../lib/supabase');
        
        // 4. Optimistically clear local state immediately (keep snapshot for rollback)
        const trashedSnapshot = [...trashedItems];
        set({ trashedItems: [] });

        if (!isSupabaseConfigured()) {
            // Offline: Queue individual deletes
            trashedItems.forEach(item => {
                get().deleteItemFromDb(item.id);
            });
            scheduleSync();
            return;
        }

        // 4. SERVER-SIDE DELETION (Hard Delete by ID)
        // We do not rely on server-side 'deleted_at' status. We explicitly delete these IDs.
        try {
            // Batch delete to avoid URL length limits
            const BATCH_SIZE = 500;
            for (let i = 0; i < trashedIds.length; i += BATCH_SIZE) {
                const batch = trashedIds.slice(i, i + BATCH_SIZE);
                const { error } = await supabase
                    .from('items')
                    .delete()
                    .in('id', batch);

                if (error) throw error;
            }
            console.log(`[DataSlice] Trash emptied (${trashedIds.length} items deleted)`);

        } catch (error) {
            console.error('[DataSlice] Server-side batch delete failed.', error);
            
            // Restore local state so user sees the items again
            set({ trashedItems: trashedSnapshot });
            // Remove tombstones so the items are visible
            trashedIds.forEach(id => tombstoneManager.remove?.(id));
            
            // Fallback: Re-queue individual deletes to persistent queue
            trashedItems.forEach(item => {
                get().deleteItemFromDb(item.id);
            });
            
            const state = get();
            state.addNotification?.('warning', 'Trash emptying slowly', 'Using fallback method due to network error.');
        }
        scheduleSync();
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
        const state = get();

        // Save original folder IDs for undo
        const originalFolderIds = new Map<string, string | null>();
        ids.forEach(id => {
            const item = state.items.find(i => i.id === id);
            if (item) originalFolderIds.set(id, item.folder_id);
        });

        // Get the first item's original folder (for undo description)
        const firstItemFolder = originalFolderIds.get(ids[0]) || null;

        // 1. Circular Dependency Check (Phase 1 Fix)
        if (folderId) {
            const state = get();

            // Helper to check if folderId is a descendant of any movedId
            const isDescendant = (childId: string, parentIds: string[]): boolean => {
                if (parentIds.includes(childId)) return true;

                const parent = state.items.find(i => i.id === childId);
                if (!parent || !parent.folder_id) return false;

                return isDescendant(parent.folder_id, parentIds);
            };

            // If we are moving Folder A into Folder B, 
            // check if Folder B is actually inside Folder A (or is Folder A itself)
            // We check if the TARGET (folderId) is a child of any MOVED item.
            // Wait, logic is: Is 'folderId' (destination) inside 'id' (source)?
            // We trace 'folderId' upwards. If we hit any 'id' in 'ids', it's a cycle.

            let currentCheckId: string | null = folderId;
            while (currentCheckId) {
                if (ids.includes(currentCheckId)) {
                    console.error("Circular dependency detected! Cannot move a folder into itself.");
                    // Optionally notify user
                    return;
                }
                const parent = state.items.find(i => i.id === currentCheckId);
                currentCheckId = parent ? parent.folder_id : null;
            }
        }

        // Push to undo stack before moving
        undoStack.push(createMoveItemsAction(ids, firstItemFolder, folderId));
        get().updateUndoState();

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
        scheduleSync();

        // Notify
        get().addNotification(
            'success',
            `Moved ${ids.length} item${ids.length !== 1 ? 's' : ''}`,
            'Undo available',
            'Undo',
            () => get().undo()
        );
    },

    // Search (Phase 3)
    searchItems: async (query: string): Promise<Item[]> => {
        if (!query || query.trim().length < 2) return [];

        const { supabase, isSupabaseConfigured } = await import('../../lib/supabase');
        if (!isSupabaseConfigured()) return [];

        try {
            const { data, error } = await supabase.rpc('search_items', { query_text: query });

            if (error) {
                console.error('Search RPC failed:', error);
                return [];
            }

            // Convert result to Item[] structure (partial)
            // The RPC returns { id, type, title, snippet, rank, updated_at }
            // We might need to fetch full items or just map to a preview type.
            // For now, let's map to a partial Item that the UI can render.
            return (data as any[]).map(row => ({
                id: row.id,
                type: row.type,
                title: row.title,
                content: { text: row.snippet }, // Put snippet in text for preview
                updated_at: row.updated_at,
                // Defaults for required fields
                user_id: '',
                folder_id: null,
                file_meta: null,
                priority: 'none',
                tags: [],
                // Scheduler Defaults
                scheduled_at: null,
                remind_before: null,
                recurring_config: null,
                bg_color: '#FFFFFF',
                is_pinned: false,
                is_archived: false,
                is_completed: false,
                created_at: row.updated_at,
                deleted_at: null
            })) as Item[];

        } catch (e) {
            console.error('Search failed', e);
            get().addNotification?.('error', 'Search Error', 'Could not complete search. Please try again.');
            return [];
        }
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
        get().updateItem(id, { scheduled_at: dueAt });
    },

    setItemReminder: (id, remindAt, remindBefore = 0) => {
        // Set scheduled_at and remind_before (minutes before to fire notification)
        // The DB trigger will auto-compute next_trigger_at = scheduled_at - remind_before minutes
        get().updateItem(id, {
            scheduled_at: remindAt,
            remind_before: remindAt ? remindBefore : null,
        });
    },

    acknowledgeReminder: async (id, type = 'item') => {
        const now = new Date().toISOString();
        const table = type === 'task' ? 'tasks' : 'items';

        // Direct Zustand state patch — does NOT set is_unsynced
        // (acknowledgment is a local-only operation, not synced to Google)
        if (type === 'task') {
            set((state) => ({
                tasks: state.tasks.map(t =>
                    t.id === id ? { ...t, last_acknowledged_at: now } as any : t
                ),
            }));
        } else {
            set((state) => ({
                items: state.items.map(i =>
                    i.id === id ? { ...i, last_acknowledged_at: now } as any : i
                ),
            }));
        }

        // Persist to DB directly (bypasses sync-triggering path)
        const { supabase, isSupabaseConfigured } = await import('../../lib/supabase');
        if (isSupabaseConfigured()) {
            const { error } = await supabase
                .from(table)
                .update({ last_acknowledged_at: now })
                .eq('id', id);
            if (error) {
                console.error(`[DataSlice] Failed to acknowledge reminder for ${id}:`, error);
            }
        }
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
        const user = get().user;
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

    // Stats (debounced to prevent excessive recalculation)
    calculateStats: () => _debouncedCalculateStats(),

    refreshFolderCounts: () => _debouncedRefreshFolderCounts(),

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

    // Data Reset (for sign out) - clears all user data from memory
    clearAllUserData: () => {
        console.log('[Store] Clearing all user data...');
        set({
            items: [],
            trashedItems: [],
            folders: [],
            lists: [],
            tasks: [],
            calendarEvents: [],
            uploads: [],
            smartFolderCounts: { notes: 0, links: 0, files: 0, images: 0, folders: 0 },
            todayStats: { dueToday: 0, reminders: 0, totalReminders: 0, overdue: 0, tasks: 0 },
            hasMoreItems: false,
            itemsLoadedCount: 0,
            canUndo: false,
            canRedo: false,
            undoDescription: null,
            redoDescription: null,
        });
        // Clear undo stack to prevent data leaks
        undoStack.clear();
        console.log('[Store] All user data cleared');
    },
}; };

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createAuthSlice } from './slices/authSlice';
import { createUISlice } from './slices/uiSlice';
import { createDataSlice } from './slices/dataSlice';
import { createSelectionSlice } from './slices/selectionSlice';
import { createTaskSlice } from './slices/taskSlice';
import { createClipboardUndoSlice } from './slices/clipboardUndoSlice';
import type { Item } from '../lib/types';
import { persistentSyncQueue } from '../lib/persistentQueue';
import { tombstoneManager } from '../lib/tombstones';
import { adaptItemRows, adaptTaskRows, adaptListRows } from '../lib/dbAdapters';
import { STORAGE_KEY } from '../lib/constants';
import { computeFilteredItems, computeFilteredTasks } from '../lib/filterUtils';
import { idbStorage } from '../lib/idbStorage';
import type { AppState } from './types';

// Re-export AppState for consumers
export type { AppState } from './types';

export const useAppStore = create<AppState>()(
    persist(
        (set, get, api) => ({
            ...createAuthSlice(set, get, api),
            ...createUISlice(set, get, api),
            ...createDataSlice(set, get, api),
            ...createSelectionSlice(set, get, api),
            ...createTaskSlice(set, get, api),
            ...createClipboardUndoSlice(set, get, api),

            // ============ COMPUTED IMPLEMENTATIONS ============

            getFilteredItems: (overrideListId?: string | null) => {
                return computeFilteredItems(get(), overrideListId);
            },

            getFilteredTasks: () => {
                return computeFilteredTasks(get());
            },

            loadUserData: async () => {
                const { user } = get();
                if (!user) {
                    console.log('[Store] Load skipped: No user');
                    set({ isLoading: false });
                    return;
                }

                set({ isLoading: true });

                try {
                    const { supabase, isSupabaseConfigured } = await import('../lib/supabase');

                    if (!isSupabaseConfigured()) {
                        set({ isLoading: false });
                        get().calculateStats();
                        return;
                    }

                    const PAGE_SIZE = 500;

                    // Load items with PAGINATION
                    const { data: itemsData, error: itemsError, count } = await supabase
                        .from('items')
                        .select('*', { count: 'exact' })
                        .eq('user_id', user.id)
                        .order('created_at', { ascending: false })
                        .range(0, PAGE_SIZE - 1);

                    if (itemsError) throw itemsError;

                    // Load lists
                    const { data: listsData } = await supabase
                        .from('lists')
                        .select('*')
                        .eq('user_id', user.id);

                    // Load tasks
                    const { data: tasksData } = await supabase
                        .from('tasks')
                        .select('*')
                        .eq('user_id', user.id);

                    const allItems = adaptItemRows(itemsData || []);

                    // SMART MERGE: Preserve local items that haven't synced yet
                    const { items: localItems } = get();
                    const unsyncedLocalItems = localItems.filter(i => i.is_unsynced);

                    // Start with server items
                    const mergedItems = [...allItems];

                    // Add local items IF they are not already in the server list
                    // (If they ARE in the server list, the server version wins and clears the flag)
                    unsyncedLocalItems.forEach(localItem => {
                        const existsOnServer = allItems.some(serverItem => serverItem.id === localItem.id);
                        if (!existsOnServer) {
                            mergedItems.unshift(localItem);
                        }
                    });

                    // FILTER OUT PENDING DELETES (Critical for preventing resurrection)
                    // We must trust the local queue over the server state for deletion.
                    const pendingDeletes = persistentSyncQueue.getPendingDeletes();
                    const tombstones = new Set(tombstoneManager.getAll());
                    
                    const finalItems = mergedItems.filter(i => !pendingDeletes.has(i.id) && !tombstones.has(i.id));

                    // Cleanup: If a tombstone ID is NOT in the server list (allItems), we can remove it from tombstones
                    // because the server has finally processed the delete.
                    const serverIdSet = new Set(allItems.map(i => i.id));
                    // We pass the IDs that DO exist on server to prune. Logic: Keep T if T in Server.
                    tombstoneManager.prune(Array.from(serverIdSet));

                    const activeItems = finalItems.filter((i: Item) => !i.deleted_at);
                    const trashedItems = finalItems.filter((i: Item) => i.deleted_at);

                    // Use adapters for proper type conversion
                    const sanitizedTasks = adaptTaskRows(tasksData || []);
                    const sanitizedLists = adaptListRows(listsData || []);

                    const hasMore = count ? count > PAGE_SIZE : false;

                    set({
                        items: activeItems,
                        trashedItems: trashedItems,
                        lists: sanitizedLists,
                        tasks: sanitizedTasks,
                        isLoading: false,
                        hasMoreItems: hasMore,
                        itemsLoadedCount: allItems.length,
                    });

                    console.log(`[Store] Loaded ${allItems.length} items (${count} total, hasMore: ${hasMore})`);
                    get().calculateStats();
                } catch (error) {
                    console.error('Error loading user data:', error);
                    set({ isLoading: false });
                }
            },
        }),
        {
            name: STORAGE_KEY,
            storage: createJSONStorage(() => idbStorage),
            version: 1, // Increment when persisted shape changes
            migrate: (persisted: unknown, version: number) => {
                const state = persisted as Record<string, unknown>;

                if (version === 0 || !version) {
                    // v0 → v1: Ensure arrays exist (guards against corrupt/stale data)
                    return {
                        ...state,
                        items: Array.isArray(state.items) ? state.items : [],
                        trashedItems: Array.isArray(state.trashedItems) ? state.trashedItems : [],
                        folders: Array.isArray(state.folders) ? state.folders : [],
                        lists: Array.isArray(state.lists) ? state.lists : [],
                        tasks: Array.isArray(state.tasks) ? state.tasks : [],
                    };
                }

                return state;
            },
            partialize: (state) => ({
                theme: state.theme,
                viewMode: state.viewMode,
                isSidebarOpen: state.isSidebarOpen,
                // Persist Data for offline capability
                items: state.items,
                trashedItems: state.trashedItems,
                folders: state.folders,
                lists: state.lists,
                tasks: state.tasks,
                // Do not persist:
                // user, isLoading, isAuthModalOpen (security/transient)
                // editingItem, clipboard (transient)
            }),
        }
    )
);
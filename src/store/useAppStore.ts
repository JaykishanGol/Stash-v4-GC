import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createAuthSlice } from './slices/authSlice';
import type { AuthSlice } from './slices/authSlice';
import { createUISlice } from './slices/uiSlice';
import type { UISlice } from './slices/uiSlice';
import { createDataSlice } from './slices/dataSlice';
import type { DataSlice } from './slices/dataSlice';
import type { Item, Task } from '../lib/types';
import { FOLDERS_ROOT_ID } from '../lib/types';

// Define the full application state
export type AppState = AuthSlice & UISlice & DataSlice & {
    // Computed (Selectors)
    getFilteredItems: (overrideListId?: string | null) => Item[];
    getFilteredTasks: () => Task[];
    loadUserData: () => Promise<void>;
};

export const useAppStore = create<AppState>()(
    persist(
        (set, get, api) => ({
            ...createAuthSlice(set, get, api),
            ...createUISlice(set, get, api),
            ...createDataSlice(set, get, api),

            // ============ COMPUTED IMPLEMENTATIONS ============

            getFilteredItems: (overrideListId?: string | null) => {
                const state = get();
                // Filter out trashed items by default (they are in trashedItems)
                let filtered = state.items.filter(item => !item.deleted_at);

                // Archive Logic
                if (state.activeView === 'archive') {
                    // In archive view, show ONLY archived items
                    filtered = filtered.filter(item => item.is_archived);
                } else if (state.searchQuery) {
                    // During search, INCLUDE archived items (Keep-style)
                    // No filter needed, perform search on full set
                } else {
                    // Normal views: HIDE archived items
                    filtered = filtered.filter(item => !item.is_archived);
                }

                const effectiveListId = overrideListId !== undefined ? overrideListId : state.selectedListId;

                // PRIORITY 1: List filtering (highest priority)
                if (effectiveListId) {
                    const list = state.lists.find(l => l.id === effectiveListId);
                    if (list) {
                        filtered = filtered.filter(item => list.items.includes(item.id));
                    } else {
                        // List selected but not found? Return empty to avoid leaking "All Items"
                        filtered = [];
                    }
                    // STRICT RETURN: Do not apply folder or view logic if we are in "List Mode"
                    // We only apply search/type/priority filters below.
                }
                // PRIORITY 2: Folder filtering
                else if (state.selectedFolderId) {
                    filtered = filtered.filter(item => item.folder_id === state.selectedFolderId);
                }
                // PRIORITY 3: View-based filtering
                else {
                    switch (state.activeView) {
                        case 'notes':
                            filtered = filtered.filter(i => i.type === 'note');
                            break;
                        case 'links':
                            filtered = filtered.filter(i => i.type === 'link');
                            break;
                        case 'files':
                            filtered = filtered.filter(i => i.type === 'file');
                            break;
                        case 'images':
                            filtered = filtered.filter(i => i.type === 'image');
                            break;
                        case 'folders':
                            // Show: folder items + items moved to folders section root
                            filtered = filtered.filter(i =>
                                i.type === 'folder' || i.folder_id === FOLDERS_ROOT_ID
                            );
                            break;
                        case 'overdue': {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            filtered = filtered.filter(i => i.scheduled_at && !i.is_completed && new Date(i.scheduled_at) < today);
                            break;
                        }
                        case 'completed':
                            filtered = filtered.filter(i => i.is_completed === true);
                            break;
                        case 'home':
                            // Home dashboard: Show root items only (not in folders)
                            filtered = filtered.filter(i => i.folder_id === null);
                            break;
                        case 'all':
                            // All Items: Show everything (no additional filter)
                            break;
                        case 'scheduled':
                            // Show all scheduled items
                            filtered = filtered.filter(i => i.scheduled_at && !i.is_completed);
                            break;
                        default:
                            // For any unhandled view, show all items
                            break;
                    }
                }

                // Apply search
                if (state.searchQuery) {
                    const query = state.searchQuery.toLowerCase();
                    const stripHtml = (html: string): string => html.replace(/<[^>]*>/g, '');

                    filtered = filtered.filter(item => {
                        // Title match
                        if (item.title.toLowerCase().includes(query)) return true;

                        // Content match with HTML stripping
                        if (item.type === 'note' && item.content && typeof item.content === 'object') {
                            const noteContent = item.content as { text?: string };
                            if (noteContent.text && stripHtml(noteContent.text).toLowerCase().includes(query)) {
                                return true;
                            }
                        }

                        // URL match for links
                        if (item.type === 'link' && item.content && typeof item.content === 'object') {
                            const linkContent = item.content as { url?: string };
                            if (linkContent.url?.toLowerCase().includes(query)) {
                                return true;
                            }
                        }

                        // Tag match
                        if (item.tags?.some(tag => tag.toLowerCase().includes(query))) {
                            return true;
                        }

                        return false;
                    });
                }

                // Apply type filter
                if (state.filters.type) {
                    filtered = filtered.filter(item => item.type === state.filters.type);
                }

                // Apply priority filter
                if (state.filters.priority) {
                    filtered = filtered.filter(item => item.priority === state.filters.priority);
                }

                // Sort: pinned first, then by updated_at
                filtered.sort((a, b) => {
                    if (a.is_pinned && !b.is_pinned) return -1;
                    if (!a.is_pinned && b.is_pinned) return 1;
                    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
                });

                return filtered;
            },

            getFilteredTasks: () => {
                const state = get();
                // Filter out soft-deleted tasks (moved to trash)
                let filtered = state.tasks.filter(t => !t.deleted_at);

                // PRIORITY 1: List filtering
                if (state.selectedListId) {
                    filtered = filtered.filter(t => t.list_id === state.selectedListId);
                }

                // Active vs Completed
                if (state.activeView === 'completed') {
                    filtered = filtered.filter(t => t.is_completed);
                } else {
                    filtered = filtered.filter(t => !t.is_completed);
                }

                // View-based filtering
                switch (state.activeView) {
                    case 'overdue': {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        filtered = filtered.filter(t => t.scheduled_at && !t.is_completed && new Date(t.scheduled_at) < today);
                        break;
                    }
                    case 'scheduled': {
                        // Show all tasks with scheduled_at
                        filtered = filtered.filter(t => t.scheduled_at);
                        break;
                    }
                    case 'tasks':
                        // Show all active tasks
                        break;
                    case 'all':
                        // Show all active tasks
                        break;
                    default:
                        // Hide tasks for type-specific views
                        if (['notes', 'links', 'files', 'images', 'folders'].includes(state.activeView)) {
                            return [];
                        }
                        break;
                }

                // Search
                if (state.searchQuery) {
                    const query = state.searchQuery.toLowerCase();
                    filtered = filtered.filter(t => t.title.toLowerCase().includes(query));
                }

                // Apply priority filter
                if (state.filters.priority) {
                    filtered = filtered.filter(t => t.priority === state.filters.priority);
                }

                return filtered;
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

                    const allItems = (itemsData || []) as Item[];

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

                    const activeItems = mergedItems.filter((i: any) => !i.deleted_at);
                    const trashedItems = mergedItems.filter((i: any) => i.deleted_at);

                    // Ensure task fields are initialized
                    const sanitizedTasks = (tasksData || []).map((t: any) => ({
                        ...t,
                        item_ids: t.item_ids || [],
                        item_completion: t.item_completion || {}
                    }));

                    const hasMore = count ? count > PAGE_SIZE : false;

                    set({
                        items: activeItems,
                        trashedItems: trashedItems,
                        lists: listsData || [],
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
            name: 'stash-storage',
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
import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { FOLDERS_ROOT_ID } from '../lib/types';

/**
 * High-Performance Memoized Filter Hook
 * Replaces the expensive 'getFilteredItems' store function.
 * This ensures sorting/filtering only runs when dependencies actually change.
 */
export function useFilteredItems() {
    // 1. Select specific slices to minimize re-renders
    const items = useAppStore(state => state.items);
    const tasks = useAppStore(state => state.tasks);
    const trashedItems = useAppStore(state => state.trashedItems);
    const lists = useAppStore(state => state.lists);
    
    // 2. Select Filter State
    const activeView = useAppStore(state => state.activeView);
    const selectedFolderId = useAppStore(state => state.selectedFolderId);
    const selectedListId = useAppStore(state => state.selectedListId);
    const searchQuery = useAppStore(state => state.searchQuery);
    const filters = useAppStore(state => state.filters);

    return useMemo(() => {
        const startTime = performance.now();

        // --- TRASH VIEW ---
        if (activeView === 'trash') {
            let filtered = [...trashedItems];
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                filtered = filtered.filter(item => item.title.toLowerCase().includes(query));
            }
            filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
            return { items: filtered, tasks: [] };
        }

        // --- PREPARE SOURCE DATA ---
        // Filter out deleted/archived early (unless archive view)
        const isArchiveView = activeView === 'archive';
        let filteredItems = items.filter(i => 
            !i.deleted_at && (isArchiveView ? i.is_archived : !i.is_archived)
        );
        
        let filteredTasks = tasks.filter(t => 
            !t.deleted_at && (isArchiveView ? false : true) // Tasks don't have is_archived yet, assume active
        );

        // --- LIST FILTERING (Priority 1) ---
        if (selectedListId) {
            const list = lists.find(l => l.id === selectedListId);
            if (list) {
                // Set based filtering is O(1) lookup vs O(N) includes
                const listIds = new Set(list.items);
                filteredItems = filteredItems.filter(item => listIds.has(item.id));
                filteredTasks = filteredTasks.filter(task => task.list_id === selectedListId);
            } else {
                filteredItems = [];
                filteredTasks = [];
            }
            // Strict Return for List Mode (Ignore folder structure)
        }
        
        // --- FOLDER FILTERING (Priority 2) ---
        else if (selectedFolderId) {
            filteredItems = filteredItems.filter(item => item.folder_id === selectedFolderId);
            filteredTasks = []; // Tasks don't live in folders
        }
        
        // --- VIEW FILTERING (Priority 3) ---
        else {
            switch (activeView) {
                case 'notes':
                    filteredItems = filteredItems.filter(i => i.type === 'note' && i.folder_id === null);
                    filteredTasks = [];
                    break;
                case 'links':
                    filteredItems = filteredItems.filter(i => i.type === 'link' && i.folder_id === null);
                    filteredTasks = [];
                    break;
                case 'files':
                    filteredItems = filteredItems.filter(i => i.type === 'file' && i.folder_id === null);
                    filteredTasks = [];
                    break;
                case 'images':
                    filteredItems = filteredItems.filter(i => i.type === 'image' && i.folder_id === null);
                    filteredTasks = [];
                    break;
                case 'folders':
                    filteredItems = filteredItems.filter(i => (i.type === 'folder' || i.folder_id === FOLDERS_ROOT_ID));
                    filteredTasks = [];
                    break;
                case 'overdue': {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    filteredItems = filteredItems.filter(i => i.scheduled_at && !i.is_completed && new Date(i.scheduled_at) < today);
                    filteredTasks = filteredTasks.filter(t => t.scheduled_at && !t.is_completed && new Date(t.scheduled_at) < today);
                    break;
                }
                case 'completed':
                    filteredItems = filteredItems.filter(i => i.is_completed);
                    filteredTasks = filteredTasks.filter(t => t.is_completed);
                    break;
                case 'home':
                    filteredItems = filteredItems.filter(i => i.folder_id === null);
                    // Home shows recent/important items, tasks handled separately in widget
                    break;
                case 'scheduled':
                    filteredItems = filteredItems.filter(i => i.scheduled_at && !i.is_completed);
                    filteredTasks = filteredTasks.filter(t => t.scheduled_at && !t.is_completed);
                    break;
                case 'all':
                    // Show everything (no additional filter)
                    break;
                default:
                    // Priority views handled by filter logic below, but base set is all
                    break;
            }
        }

        // --- GLOBAL SEARCH ---
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '');

            filteredItems = filteredItems.filter(item => {
                if (item.title.toLowerCase().includes(query)) return true;
                if (item.type === 'note' && item.content && typeof item.content === 'object') {
                    const text = (item.content as any).text;
                    if (text && stripHtml(text).toLowerCase().includes(query)) return true;
                }
                if (item.tags?.some(tag => tag.toLowerCase().includes(query))) return true;
                return false;
            });

            filteredTasks = filteredTasks.filter(task => 
                task.title.toLowerCase().includes(query)
            );
        }

        // --- METADATA FILTERS ---
        if (filters.type) {
            filteredItems = filteredItems.filter(item => item.type === filters.type);
            filteredTasks = []; // Tasks don't have 'type' field in this context
        }

        if (filters.priority) {
            filteredItems = filteredItems.filter(item => item.priority === filters.priority);
            filteredTasks = filteredTasks.filter(task => task.priority === filters.priority);
        }

        // --- SORTING ---
        // Pinned first, then Newest Updated first
        filteredItems.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });

        // Debug Performance
        const duration = performance.now() - startTime;
        if (duration > 5) console.log(`[useFilteredItems] Slow filter: ${duration.toFixed(1)}ms`);

        return { items: filteredItems, tasks: filteredTasks };

    }, [
        items, tasks, trashedItems, lists, // Data Dependencies
        activeView, selectedFolderId, selectedListId, searchQuery, filters // Filter Dependencies
    ]);
}

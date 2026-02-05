/**
 * Filtering & Sorting Utilities
 *
 * Pure functions extracted from useAppStore.ts so they can be unit-tested
 * independently of Zustand. The store still calls these, but the logic
 * lives here.
 */

import type { Item, Task } from './types';
import { FOLDERS_ROOT_ID } from './types';
import type { AppState } from '../store/types';

// ---- Helpers ----

const stripHtml = (html: string): string => html.replace(/<[^>]*>/g, '');

function matchesSearch(item: Item, query: string): boolean {
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
}

// ---- Exported filter functions ----

/**
 * Derive the visible item list from raw state.
 * Pure function — same inputs always produce same outputs.
 */
export function computeFilteredItems(
    state: Pick<
        AppState,
        | 'items'
        | 'trashedItems'
        | 'lists'
        | 'activeView'
        | 'searchQuery'
        | 'selectedListId'
        | 'selectedFolderId'
        | 'filters'
    >,
    overrideListId?: string | null,
): Item[] {

    // TRASH VIEW SPECIAL HANDLING
    if (state.activeView === 'trash') {
        let filtered = [...state.trashedItems];

        if (state.searchQuery) {
            const query = state.searchQuery.toLowerCase();
            filtered = filtered.filter(item => {
                if (item.title.toLowerCase().includes(query)) return true;
                if (item.type === 'note' && item.content && typeof item.content === 'object') {
                    const noteContent = item.content as { text?: string };
                    if (noteContent.text && stripHtml(noteContent.text).toLowerCase().includes(query)) return true;
                }
                return false;
            });
        }

        filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        return filtered;
    }

    // Filter out trashed items
    let filtered = state.items.filter(item => !item.deleted_at);

    // Archive Logic
    if (state.activeView === 'archive') {
        filtered = filtered.filter(item => item.is_archived);
    } else if (state.searchQuery) {
        // During search, INCLUDE archived items (Keep-style)
    } else {
        filtered = filtered.filter(item => !item.is_archived);
    }

    const effectiveListId = overrideListId !== undefined ? overrideListId : state.selectedListId;

    // PRIORITY 1: List filtering
    if (effectiveListId) {
        const list = state.lists.find(l => l.id === effectiveListId);
        if (list) {
            filtered = filtered.filter(item => list.items.includes(item.id));
        } else {
            filtered = [];
        }
    }
    // PRIORITY 2: Folder filtering
    else if (state.selectedFolderId) {
        filtered = filtered.filter(item => item.folder_id === state.selectedFolderId);
    }
    // PRIORITY 3: View-based filtering
    else {
        switch (state.activeView) {
            case 'notes':
                filtered = filtered.filter(i => i.type === 'note' && i.folder_id === null);
                break;
            case 'links':
                filtered = filtered.filter(i => i.type === 'link' && i.folder_id === null);
                break;
            case 'files':
                filtered = filtered.filter(i => i.type === 'file' && i.folder_id === null);
                break;
            case 'images':
                filtered = filtered.filter(i => i.type === 'image' && i.folder_id === null);
                break;
            case 'folders':
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
                filtered = filtered.filter(i => i.folder_id === null);
                break;
            case 'all':
                break;
            case 'scheduled':
                filtered = filtered.filter(i => i.scheduled_at && !i.is_completed);
                break;
            default:
                break;
        }
    }

    // Apply search
    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        filtered = filtered.filter(item => matchesSearch(item, query));
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
}

/**
 * Derive the visible task list from raw state.
 * Pure function — same inputs always produce same outputs.
 */
export function computeFilteredTasks(
    state: Pick<
        AppState,
        'tasks' | 'activeView' | 'selectedListId' | 'searchQuery' | 'filters'
    >,
): Task[] {
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
        case 'scheduled':
            filtered = filtered.filter(t => t.scheduled_at);
            break;
        case 'tasks':
        case 'all':
            break;
        case 'trash':
        case 'notes':
        case 'links':
        case 'files':
        case 'images':
        case 'folders':
            return [];
        default:
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
}

import type { StateCreator } from 'zustand';
import type { AppState } from '../types';
import { supabase } from '../../lib/supabase';
import { generateId } from '../../lib/utils';
import type {
    ActiveView,
    ViewMode,
    ItemType,
    PriorityLevel,
    Item,
    List
} from '../../lib/types';

// Types (Moving these locally if they aren't exported from types.ts, or importing them)
// Clipboard state
export interface ClipboardState {
    items: Item[];
    operation: 'cut' | 'copy' | null;
}

// Filter state
export interface FilterState {
    type: ItemType | null;
    priority: PriorityLevel | null;
}

// Notification state
export interface AppNotification {
    id: string;
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
    timestamp: string;
    read: boolean;
    itemId?: string;
    itemType?: string; // 'task' | 'note' | 'link' | 'image' | 'file' | 'folder'
}

export interface UISlice {
    // UI State
    isSidebarOpen: boolean;
    viewMode: ViewMode;
    activeView: ActiveView;
    selectedFolderId: string | null;
    selectedListId: string | null;
    selectedTaskId: string | null;
    isHeaderVisible: boolean;
    theme: 'dark' | 'light';

    // Modal State
    isQuickAddOpen: boolean;
    quickAddType: ItemType;
    editingItem: Item | null;
    editingList: List | null;
    deletingList: List | null;

    // Scheduler Modal State
    isSchedulerOpen: boolean;
    schedulerItemId: string | null;
    schedulerEventId: string | null;
    /** When editing a recurring instance: the original occurrence start */
    schedulerOriginalStart: string | null;

    // Context Menu State
    contextMenu: {
        isOpen: boolean;
        x: number;
        y: number;
        itemId: string | null;
        type: 'item' | 'list' | null;
    };

    // Info Panel State
    infoPanelItem: Item | null;

    // File Preview State
    previewingItem: Item | null;

    // Share Interceptor State
    pendingShareItems: Item[];

    // Clipboard State
    clipboard: ClipboardState;

    // Search & Filter State
    searchQuery: string;
    filters: FilterState;

    // Notification State
    notifications: AppNotification[];

    isSettingsModalOpen: boolean;

    // ACTIONS
    toggleSidebar: () => void;
    toggleSettingsModal: () => void;
    setViewMode: (mode: ViewMode) => void;
    setActiveView: (view: ActiveView) => void;
    toggleTheme: () => void;

    setHeaderVisible: (visible: boolean) => void;
    setSelectedFolder: (id: string | null) => void;
    setSelectedList: (id: string | null) => void;
    setSelectedTask: (id: string | null) => void;
    setListView: (listId: string) => void; // ATOMIC ACTION

    // Modal Actions
    openQuickAdd: (type?: ItemType) => void;
    closeQuickAdd: () => void;
    setQuickAddType: (type: ItemType) => void;

    setEditingItem: (item: Item | null) => void;
    setEditingList: (list: List | null) => void;
    setDeletingList: (list: List | null) => void;

    // Scheduler Actions
    openScheduler: (itemId: string) => void;
    openEventScheduler: (eventId: string, originalStart?: string) => void;
    closeScheduler: () => void;

    // Context Menu Actions
    openContextMenu: (x: number, y: number, itemId: string | null, type?: 'item' | 'list') => void;
    closeContextMenu: () => void;

    // Info Panel Actions
    openInfoPanel: (item: Item) => void;
    closeInfoPanel: () => void;

    // Preview Actions
    setPreviewingItem: (item: Item | null) => void;

    // Share Interceptor Actions
    setPendingShareItems: (items: Item[]) => void;

    // Clipboard Actions
    setClipboard: (clipboard: ClipboardState) => void;
    clearClipboard: () => void;
    // cut/copy/paste require DataSlice access, so they might be Thunks or in main store

    // Search Actions
    setSearchQuery: (query: string) => void;
    setFilter: (key: keyof FilterState, value: ItemType | PriorityLevel | null) => void;
    clearFilters: () => void;

    // Notification Actions
    fetchNotifications: () => Promise<void>;
    addNotification: (type: AppNotification['type'], title: string, message: string, actionLabel?: string, actionCallback?: () => void) => void;
    markNotificationRead: (id: string) => Promise<void>;
    clearNotifications: () => Promise<void>;
    markAllNotificationsRead: () => Promise<void>;
}

export const createUISlice: StateCreator<AppState, [], [], UISlice> = (set, get) => ({
    isSidebarOpen: true,
    viewMode: 'grid',
    activeView: 'home',
    selectedFolderId: null,
    selectedListId: null,
    selectedTaskId: null,
    isHeaderVisible: true,
    theme: 'light',

    isQuickAddOpen: false,
    quickAddType: 'note',
    editingItem: null,
    editingList: null,
    deletingList: null,

    isSchedulerOpen: false,
    schedulerItemId: null,
    schedulerEventId: null,
    schedulerOriginalStart: null,

    contextMenu: { isOpen: false, x: 0, y: 0, itemId: null, type: null },
    infoPanelItem: null,
    previewingItem: null,
    pendingShareItems: [], // Initial State

    clipboard: { items: [], operation: null },
    searchQuery: '',
    filters: { type: null, priority: null },
    notifications: [],

    isSettingsModalOpen: false,

    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    toggleSettingsModal: () => set((state) => ({ isSettingsModalOpen: !state.isSettingsModalOpen })),
    setViewMode: (mode) => set({ viewMode: mode }),
    setActiveView: (view) => set({
        activeView: view,
        selectedFolderId: null,
        selectedListId: null,
        selectedTaskId: null // Reset deep navigation
    }),
    toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),

    setHeaderVisible: (visible) => set({ isHeaderVisible: visible }),

    setSelectedFolder: (id) => set({ selectedFolderId: id, selectedListId: null, selectedTaskId: null }),
    setSelectedList: (id) => set({ selectedListId: id, selectedFolderId: null, selectedTaskId: null }),
    setSelectedTask: (id) => set({ selectedTaskId: id }),
    setListView: (listId) => set({
        activeView: 'all',
        selectedListId: listId,
        selectedFolderId: null,
        selectedTaskId: null,
        // Clear filters to ensure list content is visible
        filters: { type: null, priority: null },
        searchQuery: ''
    }),

    openQuickAdd: (type = 'note') => set({ isQuickAddOpen: true, quickAddType: type }),
    closeQuickAdd: () => set({ isQuickAddOpen: false, editingItem: null }),
    setQuickAddType: (type) => set({ quickAddType: type }),

    setEditingItem: (item) => set({
        editingItem: item,
        isQuickAddOpen: item !== null,
        quickAddType: item?.type || 'note',
    }),
    setEditingList: (list) => set({ editingList: list }),
    setDeletingList: (list) => set({ deletingList: list }),

    openScheduler: (itemId) => set({ isSchedulerOpen: true, schedulerItemId: itemId, schedulerEventId: null, schedulerOriginalStart: null }),
    openEventScheduler: (eventId, originalStart) => set({ isSchedulerOpen: true, schedulerEventId: eventId, schedulerItemId: null, schedulerOriginalStart: originalStart || null }),
    closeScheduler: () => set({ isSchedulerOpen: false, schedulerItemId: null, schedulerEventId: null, schedulerOriginalStart: null }),

    openContextMenu: (x, y, itemId, type = 'item') => set({ contextMenu: { isOpen: true, x, y, itemId, type } }),
    closeContextMenu: () => set({ contextMenu: { isOpen: false, x: 0, y: 0, itemId: null, type: null } }),

    openInfoPanel: (item) => set({ infoPanelItem: item }),
    closeInfoPanel: () => set({ infoPanelItem: null }),

    setPreviewingItem: (item) => set({ previewingItem: item }),
    setPendingShareItems: (items) => set({ pendingShareItems: items }),

    setClipboard: (clipboard) => set({ clipboard }),
    clearClipboard: () => set({ clipboard: { items: [], operation: null } }),

    setSearchQuery: (query) => set({ searchQuery: query }),
    setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
    clearFilters: () => set({ filters: { type: null, priority: null }, searchQuery: '' }),

    fetchNotifications: async () => {
        // Clean up notifications older than 30 days server-side
        await supabase
            .from('notifications')
            .delete()
            .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && data) {
            const mapped: AppNotification[] = data.map(n => ({
                id: n.id,
                type: n.type as AppNotification['type'],
                title: n.title,
                message: n.message,
                timestamp: n.created_at,
                read: n.is_read,
                itemId: n.data?.itemId || undefined,
                itemType: n.data?.type || n.data?.itemType || undefined,
            }));
            set({ notifications: mapped });
        }
    },

    addNotification: async (type, title, message, _actionLabel?, _actionCallback?) => {
        const notification = {
            id: generateId(),
            type,
            title,
            message,
            timestamp: new Date().toISOString(),
            read: false
        };

        // 1. Optimistic Update
        set((state) => ({
            notifications: [notification, ...state.notifications]
        }));

        // 2. Persist to DB (if authenticated)
        const { user } = get();
        if (user && user.id !== 'demo') {
            try {
                await supabase.from('notifications').insert({
                    id: notification.id,
                    user_id: user.id,
                    type: notification.type,
                    title: notification.title,
                    message: notification.message,
                    is_read: false,
                    created_at: notification.timestamp
                });
            } catch (err) {
                console.error('[UI] Failed to persist notification', err);
            }
        }
    },

    markNotificationRead: async (id) => {
        set((state) => ({
            notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n)
        }));
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    },

    clearNotifications: async () => {
        set({ notifications: [] });
        // Optional: Delete from DB or just mark all read? Usually delete or just clear local view.
        // Let's mark all as read for now, or delete? The UI says "Clear".
        // Let's actually delete.
        await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all for user (via RLS)
    },

    markAllNotificationsRead: async () => {
        set((state) => ({
            notifications: state.notifications.map(n => ({ ...n, read: true }))
        }));
        await supabase.from('notifications').update({ is_read: true }).neq('id', '00000000-0000-0000-0000-000000000000');
    },
});

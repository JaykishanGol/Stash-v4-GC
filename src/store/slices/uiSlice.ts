import type { StateCreator } from 'zustand';
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
    pendingShareItem: Item | null;

    // Selection State
    selectedItemIds: string[];

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
    setPendingShareItem: (item: Item | null) => void;

    // Selection Actions
    selectItem: (id: string, multi?: boolean) => void;
    selectAll: () => void; // Requires access to items, might need to be in main store or receive items
    clearSelection: () => void;
    isSelected: (id: string) => boolean;

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
    addNotification: (type: AppNotification['type'], title: string, message: string) => void;
    markNotificationRead: (id: string) => Promise<void>;
    clearNotifications: () => Promise<void>;
    markAllNotificationsRead: () => Promise<void>;
}

export const createUISlice: StateCreator<UISlice> = (set, get) => ({
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

    contextMenu: { isOpen: false, x: 0, y: 0, itemId: null, type: null },
    infoPanelItem: null,
    previewingItem: null,
    pendingShareItem: null, // Initial State

    selectedItemIds: [],
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

    openScheduler: (itemId) => set({ isSchedulerOpen: true, schedulerItemId: itemId }),
    closeScheduler: () => set({ isSchedulerOpen: false, schedulerItemId: null }),

    openContextMenu: (x, y, itemId, type = 'item') => set({ contextMenu: { isOpen: true, x, y, itemId, type } }),
    closeContextMenu: () => set({ contextMenu: { isOpen: false, x: 0, y: 0, itemId: null, type: null } }),

    openInfoPanel: (item) => set({ infoPanelItem: item }),
    closeInfoPanel: () => set({ infoPanelItem: null }),

    setPreviewingItem: (item) => set({ previewingItem: item }),
    setPendingShareItem: (item: Item | null) => set({ pendingShareItem: item }),

    selectItem: (id, multi = false) => set((state) => {
        if (multi) {
            const isSelected = state.selectedItemIds.includes(id);
            return {
                selectedItemIds: isSelected
                    ? state.selectedItemIds.filter(i => i !== id)
                    : [...state.selectedItemIds, id]
            };
        }
        return { selectedItemIds: [id] };
    }),

    // Placeholder for selectAll (needs items)
    selectAll: () => { },

    clearSelection: () => set({ selectedItemIds: [] }),
    isSelected: (id) => get().selectedItemIds.includes(id),

    setClipboard: (clipboard) => set({ clipboard }),
    clearClipboard: () => set({ clipboard: { items: [], operation: null } }),

    setSearchQuery: (query) => set({ searchQuery: query }),
    setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
    clearFilters: () => set({ filters: { type: null, priority: null }, searchQuery: '' }),

    fetchNotifications: async () => {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && data) {
            const mapped: AppNotification[] = data.map(n => ({
                id: n.id,
                type: n.type as any,
                title: n.title,
                message: n.message,
                timestamp: n.created_at,
                read: n.is_read
            }));
            set({ notifications: mapped });
        }
    },

    addNotification: (type, title, message) => set((state) => ({
        // This is for LOCAL-ONLY temporary alerts (like "Copied to clipboard")
        // We don't save these to DB to avoid spamming history
        notifications: [
            {
                id: generateId(),
                type,
                title,
                message,
                timestamp: new Date().toISOString(),
                read: false
            },
            ...state.notifications
        ]
    })),

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

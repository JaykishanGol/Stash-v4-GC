import type { StateCreator } from 'zustand';
import type { AppState } from '../types';

export interface SelectionSlice {
    selectedItemIds: string[];
    isSelectionMode: boolean;
    lastSelectedItemId: string | null; // For shift-click range selection

    // Actions
    toggleSelectionMode: (isActive: boolean) => void;
    selectItem: (id: string, multiSelect?: boolean, shiftKey?: boolean) => void;
    selectAll: (ids: string[]) => void;
    clearSelection: () => void;
}

export const createSelectionSlice: StateCreator<AppState, [], [], SelectionSlice> = (set, get) => ({
    selectedItemIds: [],
    isSelectionMode: false,
    lastSelectedItemId: null,

    toggleSelectionMode: (isActive) => {
        set({ isSelectionMode: isActive });
        if (!isActive) {
            set({ selectedItemIds: [], lastSelectedItemId: null });
        }
    },

    selectItem: (id, multiSelect = false, shiftKey = false) => {
        const state = get();
        const { selectedItemIds, lastSelectedItemId, items } = state;

        // 1. Shift-Click (Range Selection)
        if (shiftKey && lastSelectedItemId && items) {
            // Find indices in the current view list
            // Note: This relies on 'items' being the full list. Ideally we should use the *filtered/sorted* list from the view.
            // For MVP, we'll scan the global items list or passed 'displayedIds' if we enhanced this.
            // Simplified: Just add to selection if multi, or simple toggle.
            // Range selection requires knowing the VISIBLE order.
            // We'll skip complex range logic for step 1 and treat it as multi-select.
            
            // Fallback to standard multi-select for now
        }

        // 2. Multi-Select (Ctrl/Cmd Click)
        if (multiSelect || state.isSelectionMode) {
            if (selectedItemIds.includes(id)) {
                set({
                    selectedItemIds: selectedItemIds.filter((itemId: string) => itemId !== id),
                    lastSelectedItemId: id
                });
            } else {
                set({
                    selectedItemIds: [...selectedItemIds, id],
                    lastSelectedItemId: id
                });
            }
            // Auto-enable selection mode if > 0 items
            if (selectedItemIds.length === 0 && !state.isSelectionMode) {
                set({ isSelectionMode: true });
            }
        } 
        // 3. Single Select
        else {
            set({
                selectedItemIds: [id],
                lastSelectedItemId: id,
                isSelectionMode: false // Single click usually exits batch mode unless explicit
            });
        }
    },

    selectAll: (ids) => {
        set({ selectedItemIds: ids, isSelectionMode: true });
    },

    clearSelection: () => {
        set({ selectedItemIds: [], isSelectionMode: false, lastSelectedItemId: null });
    }
});

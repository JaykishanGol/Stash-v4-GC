import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

export function useKeyboardShortcuts() {
    const {
        openQuickAdd,
        isQuickAddOpen,
        closeQuickAdd,
        selectAll,
        clearSelection,
        selectedItemIds,
        moveItemsToTrash,
        isSchedulerOpen,
        isAuthModalOpen
    } = useAppStore();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in input
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            // Ignore if modals are open (except QuickAdd which has its own close logic, or we handle it here)
            // But we might want Escape to close them.
            if (isSchedulerOpen || isAuthModalOpen) return;

            // Cmd/Ctrl + A for Select All
            if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                e.preventDefault();
                selectAll();
            }

            // Delete / Backspace to trash selected items
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItemIds.length > 0) {
                e.preventDefault();
                moveItemsToTrash(selectedItemIds);
                clearSelection();
            }

            // Escape to close modals or clear selection
            if (e.key === 'Escape') {
                if (isQuickAddOpen) {
                    closeQuickAdd();
                } else if (selectedItemIds.length > 0) {
                    clearSelection();
                }
            }

            // Cmd/Ctrl + N for new note
            if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
                e.preventDefault();
                openQuickAdd('note');
            }

            // Cmd/Ctrl + K for search (future)
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                // Could open search modal
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [openQuickAdd, isQuickAddOpen, closeQuickAdd, selectAll, clearSelection, selectedItemIds, moveItemsToTrash, isSchedulerOpen, isAuthModalOpen]);
}

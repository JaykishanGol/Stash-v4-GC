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
        isAuthModalOpen,
        undo,
        redo,
        canUndo,
        canRedo,
        // Clipboard operations
        copyItems,
        cutItems,
        pasteItems,
        addNotification,
        selectedFolderId
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

            // Cmd/Ctrl + C for Copy
            if ((e.metaKey || e.ctrlKey) && e.key === 'c' && selectedItemIds.length > 0) {
                e.preventDefault();
                copyItems(selectedItemIds);
                addNotification('success', 'Copied', `${selectedItemIds.length} item(s) copied to clipboard`);
                return;
            }

            // Cmd/Ctrl + X for Cut
            if ((e.metaKey || e.ctrlKey) && e.key === 'x' && selectedItemIds.length > 0) {
                e.preventDefault();
                cutItems(selectedItemIds);
                addNotification('info', 'Ready to Move', `${selectedItemIds.length} item(s) ready to move. Press Ctrl+V to paste.`);
                clearSelection();
                return;
            }

            // Cmd/Ctrl + V for Paste
            if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
                e.preventDefault();
                pasteItems(selectedFolderId);
                return;
            }

            // Cmd/Ctrl + Z for Undo
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (canUndo) {
                    undo();
                }
                return;
            }

            // Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y for Redo
            if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                if (canRedo) {
                    redo();
                }
                return;
            }

            // Cmd/Ctrl + A for Select All
            if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                e.preventDefault();
                const items = useAppStore.getState().getFilteredItems();
                selectAll(items.map(i => i.id));
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
    }, [openQuickAdd, isQuickAddOpen, closeQuickAdd, selectAll, clearSelection, selectedItemIds, moveItemsToTrash, isSchedulerOpen, isAuthModalOpen, undo, redo, canUndo, canRedo, copyItems, cutItems, pasteItems, addNotification, selectedFolderId]);
}

import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useFilteredItems } from './useFilteredItems';

/**
 * Premium keyboard navigation hook
 * Provides keyboard shortcuts for navigating and managing items
 */
export function useKeyboardNavigation() {
    const {
        selectedItemIds,
        selectItem,
        setPreviewingItem,
        setEditingItem,
        setSelectedFolder,
        moveItemsToTrash,
        clearSelection,
        activeView
    } = useAppStore();

    // Use memoized visual list for correct spatial navigation
    const { items: visibleItems } = useFilteredItems();
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);

    // Reset focus when view or content changes drastically
    useEffect(() => {
        setFocusedIndex(-1);
    }, [activeView, visibleItems.length]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger if user is typing in an input
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                (e.target as HTMLElement).isContentEditable
            ) {
                return;
            }

            const COLS = 4; // Approx grid columns
            const TOTAL = visibleItems.length;

            if (TOTAL === 0) return;

            const moveFocus = (newIndex: number) => {
                if (newIndex < 0 || newIndex >= TOTAL) return;
                e.preventDefault();
                setFocusedIndex(newIndex);
                
                const item = visibleItems[newIndex];
                selectItem(item.id, e.metaKey || e.ctrlKey, e.shiftKey);
                
                // Try to scroll into view (best effort)
                const element = document.querySelector(`[aria-label*="${item.title}"]`);
                element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            };

            // Initial Focus logic
            if (focusedIndex === -1 && selectedItemIds.length > 0) {
                const idx = visibleItems.findIndex(i => i.id === selectedItemIds[0]);
                if (idx !== -1) setFocusedIndex(idx);
            }

            switch (e.key) {
                case 'ArrowRight':
                    moveFocus(focusedIndex + 1);
                    break;
                case 'ArrowLeft':
                    moveFocus(focusedIndex - 1);
                    break;
                case 'ArrowDown':
                    moveFocus(focusedIndex + COLS);
                    break;
                case 'ArrowUp':
                    moveFocus(focusedIndex - COLS);
                    break;
                
                case 'Enter': {
                    e.preventDefault();
                    const targetIndex = focusedIndex !== -1 ? focusedIndex : 
                        (selectedItemIds.length > 0 ? visibleItems.findIndex(i => i.id === selectedItemIds[0]) : -1);

                    if (targetIndex !== -1) {
                        const selectedItem = visibleItems[targetIndex];
                        if (selectedItem.type === 'folder') {
                            setSelectedFolder(selectedItem.id);
                        } else if (selectedItem.type === 'image' || selectedItem.type === 'file') {
                            setPreviewingItem(selectedItem);
                        } else if (selectedItem.type === 'link') {
                            const content = selectedItem.content as { url?: string };
                            if (content.url) window.open(content.url, '_blank');
                        } else {
                            setEditingItem(selectedItem);
                        }
                    }
                    break;
                }

                case ' ': { // Spacebar -> Quick Look
                    e.preventDefault();
                    if (focusedIndex !== -1) {
                        const item = visibleItems[focusedIndex];
                        if (item.type === 'image' || item.type === 'file') setPreviewingItem(item);
                    }
                    break;
                }

                case 'Delete':
                case 'Backspace': {
                    if (selectedItemIds.length > 0) {
                        e.preventDefault();
                        moveItemsToTrash(selectedItemIds);
                        clearSelection();
                    }
                    break;
                }

                case 'Escape':
                    clearSelection();
                    setFocusedIndex(-1);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedItemIds, visibleItems, focusedIndex, selectItem, setPreviewingItem, setEditingItem, setSelectedFolder, moveItemsToTrash, clearSelection]);
}

/**
 * Format a date as relative time (e.g., "3h ago", "2d ago")
 */
export function getRelativeTime(date: Date | string): string {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffWeeks < 4) return `${diffWeeks}w ago`;
    if (diffMonths < 12) return `${diffMonths}mo ago`;

    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

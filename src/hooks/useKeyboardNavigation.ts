import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * Premium keyboard navigation hook
 * Provides keyboard shortcuts for navigating and managing items
 */
export function useKeyboardNavigation() {
    const {
        selectedItemIds,
        items,
        setPreviewingItem,
        setEditingItem,
        setSelectedFolder,
        moveItemsToTrash,
        clearSelection,
    } = useAppStore();

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Don't trigger if user is typing in an input
        if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement ||
            (e.target as HTMLElement).isContentEditable
        ) {
            return;
        }

        // Get currently selected item (first if multiple)
        const selectedId = selectedItemIds[0];
        const selectedItem = selectedId ? items.find((i: any) => i.id === selectedId) : null;

        // Enter - Open selected item
        if (e.key === 'Enter' && selectedItem && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();

            if (selectedItem.type === 'folder') {
                setSelectedFolder(selectedItem.id);
            } else if (selectedItem.type === 'image' || selectedItem.type === 'file') {
                setPreviewingItem(selectedItem);
            } else if (selectedItem.type === 'link') {
                const content = selectedItem.content as { url?: string };
                if (content.url) {
                    window.open(content.url, '_blank');
                }
            } else {
                setEditingItem(selectedItem);
            }
            return;
        }

        // Delete or Backspace - Move to trash
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItemIds.length > 0) {
            e.preventDefault();
            moveItemsToTrash(selectedItemIds);
            clearSelection();
            return;
        }

        // Escape - Clear selection
        if (e.key === 'Escape') {
            clearSelection();
            return;
        }

        // Cmd/Ctrl + A - Select all (handled elsewhere, but let's support it)
        if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
            // This could select all visible items
            // For now, just prevent default if we have items selected
            if (selectedItemIds.length > 0) {
                e.preventDefault();
            }
        }
    }, [selectedItemIds, items, setPreviewingItem, setEditingItem, setSelectedFolder, moveItemsToTrash, clearSelection]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
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

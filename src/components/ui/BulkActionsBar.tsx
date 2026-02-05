import { useState, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { FolderInput, Trash2, Calendar, X, Check, Pin, Copy, CheckSquare2 } from 'lucide-react';

export function BulkActionsBar() {
    const {
        selectedItemIds,
        items,
        clearSelection,
        selectAll,
        moveItemsToTrash,
        openScheduler,
        copyItems,
        updateItem,
        addNotification,
    } = useAppStore();

    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    const count = selectedItemIds.length;
    const isVisible = count > 1;

    // Get selected items for operations
    const selectedItems = items.filter(item => selectedItemIds.includes(item.id));

    // Check if any selected items are pinned
    const hasUnpinnedItems = selectedItems.some(item => !item.is_pinned);

    // Batch delete - fixed from inefficient forEach pattern
    const handleDelete = useCallback(() => {
        if (!isConfirmingDelete) {
            setIsConfirmingDelete(true);
            // Auto-reset confirmation after 3 seconds
            setTimeout(() => setIsConfirmingDelete(false), 3000);
            return;
        }

        // Validate we have items to delete
        if (selectedItemIds.length === 0) {
            addNotification('warning', 'No Selection', 'No items selected to delete');
            return;
        }

        // Single batch call instead of loop
        moveItemsToTrash(selectedItemIds);
        clearSelection();
        setIsConfirmingDelete(false);
    }, [isConfirmingDelete, selectedItemIds, moveItemsToTrash, clearSelection, addNotification]);

    // Batch schedule - opens scheduler for first item
    const handleSchedule = useCallback(() => {
        if (selectedItemIds.length === 0) {
            addNotification('warning', 'No Selection', 'No items selected to schedule');
            return;
        }
        openScheduler(selectedItemIds[0]);
    }, [selectedItemIds, openScheduler, addNotification]);

    // Batch copy
    const handleCopy = useCallback(() => {
        if (selectedItemIds.length === 0) {
            addNotification('warning', 'No Selection', 'No items selected to copy');
            return;
        }
        copyItems(selectedItemIds);
        addNotification('success', 'Copied', `${selectedItemIds.length} item(s) copied to clipboard`);
    }, [selectedItemIds, copyItems, addNotification]);

    // Batch move (via cut)
    const handleMove = useCallback(() => {
        if (selectedItemIds.length === 0) return;

        // Use cut as the "start move" action
        useAppStore.getState().cutItems(selectedItemIds);
        addNotification('info', 'Ready to Move', 'Navigate to destination folder and Paste (Ctrl+V) or use context menu');
        clearSelection();
    }, [selectedItemIds, addNotification, clearSelection]);

    // Batch pin/unpin
    const handlePin = useCallback(() => {
        if (selectedItemIds.length === 0) return;

        const shouldPin = hasUnpinnedItems;

        selectedItemIds.forEach(id => {
            updateItem(id, { is_pinned: shouldPin });
        });

        addNotification(
            'success',
            shouldPin ? 'Pinned' : 'Unpinned',
            `${selectedItemIds.length} item(s) ${shouldPin ? 'pinned' : 'unpinned'}`
        );
    }, [selectedItemIds, hasUnpinnedItems, updateItem, addNotification]);

    // Cancel and clear selection
    const handleCancel = useCallback(() => {
        setIsConfirmingDelete(false);
        clearSelection();
    }, [clearSelection]);

    // Select all visible items
    const handleSelectAll = useCallback(() => {
        const visibleItemIds = items
            .filter(item => !item.deleted_at && !item.is_archived)
            .map(item => item.id);
        selectAll(visibleItemIds);
        addNotification('info', 'Selected All', `${visibleItemIds.length} items selected`);
    }, [items, selectAll, addNotification]);

    if (!isVisible) return null;

    return (
        <div className={`bulk-actions-bar ${isVisible ? 'visible' : ''}`}>
            <div className="bulk-actions-count">
                <div className="check-icon">
                    <Check size={12} color="#fff" />
                </div>
                <span>{count} items selected</span>
            </div>

            <button className="bulk-action-btn" onClick={handleSelectAll} title="Select all items">
                <CheckSquare2 size={16} />
                <span>All</span>
            </button>

            <button
                className="bulk-action-btn"
                onClick={handlePin}
                title={hasUnpinnedItems ? "Pin all" : "Unpin all"}
            >
                <Pin size={16} />
                <span>{hasUnpinnedItems ? 'Pin' : 'Unpin'}</span>
            </button>

            <button className="bulk-action-btn" onClick={handleSchedule}>
                <Calendar size={16} />
                <span>Schedule</span>
            </button>

            <button className="bulk-action-btn" onClick={handleCopy}>
                <Copy size={16} />
                <span>Copy</span>
            </button>

            <button className="bulk-action-btn" onClick={handleMove}>
                <FolderInput size={16} />
                <span>Move</span>
            </button>

            <button
                className={`bulk-action-btn danger ${isConfirmingDelete ? 'confirming' : ''}`}
                onClick={handleDelete}
                title={isConfirmingDelete ? "Click again to confirm" : "Delete selected items"}
            >
                <Trash2 size={16} />
                <span>{isConfirmingDelete ? 'Confirm?' : 'Delete'}</span>
            </button>

            <button className="bulk-actions-close" onClick={handleCancel}>
                <X size={16} />
            </button>

            <style>{`
                .bulk-action-btn.confirming {
                    background: #FEE2E2 !important;
                    color: #DC2626 !important;
                    animation: pulse 0.5s ease-in-out infinite alternate;
                }
                @keyframes pulse {
                    from { opacity: 0.8; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    );
}

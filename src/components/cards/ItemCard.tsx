import type { Item, LinkContent } from '../../lib/types';
import { useAppStore } from '../../store/useAppStore';
import { useLongPress } from '../../hooks/useLongPress';
import { getCardColorClass, SelectionCheckbox, type CardEventProps } from './CardUtils';
import { NoteCard, FileCard, LinkCard, ImageCard, FolderCard } from './variants';

// Re-export clearSignedUrlCache for consumers that import it from here
export { clearSignedUrlCache } from './CardUtils';

interface ItemCardProps {
    item: Item;
    compact?: boolean;
    hideControls?: boolean;
    variant?: 'masonry' | 'grid';
}

export function ItemCard({ item, compact = false, hideControls = false, variant = 'masonry' }: ItemCardProps) {
    const {
        selectedItemIds,
        selectItem,
        isSelectionMode,
        toggleSelectionMode,
        clipboard,
        setEditingItem,
        setSelectedFolder,
        setPreviewingItem,
        openContextMenu,
    } = useAppStore();

    const isSelected = selectedItemIds.includes(item.id);
    const isCut = clipboard.operation === 'cut' && clipboard.items.some(i => i.id === item.id);
    const colorClass = getCardColorClass(item.bg_color);

    // Common Grid Styles
    const gridStyles: React.CSSProperties = variant === 'grid' ? {
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
    } : {};

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();

        // 1. Selection Logic (Explicit only via Checkbox or Modifier)
        if (isSelectionMode || e.ctrlKey || e.metaKey) {
            selectItem(item.id, true, e.shiftKey);
            return;
        }

        // 2. Navigation Logic
        if (item.type === 'folder') {
            setSelectedFolder(item.id);
        } else if (item.type === 'image' || item.type === 'file') {
            setPreviewingItem(item);
        } else if (item.type === 'link') {
            const content = item.content as LinkContent;
            if (content.url) {
                window.open(content.url, '_blank');
            }
        } else {
            setEditingItem(item);
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isSelectionMode && !hideControls) {
            selectItem(item.id);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        openContextMenu(e.clientX, e.clientY, item.id);
    };

    const handleDragStart = (e: React.DragEvent) => {
        // If not selected, select just this one for the drag (visually)
        // We don't force selection state update to avoid re-render flicker

        const idsToDrag = isSelected && selectedItemIds.length > 0
            ? selectedItemIds
            : [item.id];

        e.dataTransfer.setData('application/json', JSON.stringify(idsToDrag));
        e.dataTransfer.effectAllowed = 'move';

        // Native Ghost is used automatically.
        // We do NOT set setDragImage here to allow the browser to snapshot the card.
    };

    const cardProps: CardEventProps = {
        isSelected,
        isCut,
        onClick: handleClick,
        onDoubleClick: handleDoubleClick,
        onContextMenu: handleContextMenu,
        onDragStart: handleDragStart,
        compact,
        hideControls,
        variant,
        gridStyles
    };

    // Long-press handlers for mobile selection mode
    const longPressHandlers = useLongPress({
        threshold: 400,
        onLongPress: () => {
            if (!hideControls) {
                // Enter selection mode and select this item
                if (!isSelectionMode) {
                    toggleSelectionMode(true);
                }
                selectItem(item.id, true);
                // Haptic feedback on mobile if available
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
            }
        },
    });

    // Wrapper to handle Selection Checkbox, Long-Press & Draggability
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <div
            className={`item-card-wrapper ${isSelectionMode ? 'selection-mode' : ''} ${isSelected ? 'selected' : ''}`}
            style={{ position: 'relative', height: variant === 'grid' ? '100%' : 'auto' }}
            draggable={!hideControls}
            onDragStart={!hideControls ? handleDragStart : undefined}
            {...(!hideControls ? longPressHandlers : {})}
        >
            {!hideControls && (
                <SelectionCheckbox
                    isSelected={isSelected}
                    onClick={(e) => {
                        e.stopPropagation();
                        selectItem(item.id, true);
                    }}
                />
            )}
            {children}
        </div>
    );

    switch (item.type) {
        case 'note':
            return <Wrapper><NoteCard item={item} colorClass={colorClass} {...cardProps} /></Wrapper>;
        case 'file':
            return <Wrapper><FileCard item={item} {...cardProps} /></Wrapper>;
        case 'link':
            return <Wrapper><LinkCard item={item} {...cardProps} /></Wrapper>;
        case 'image':
            return <Wrapper><ImageCard item={item} {...cardProps} /></Wrapper>;
        case 'folder':
            return <Wrapper><FolderCard item={item} {...cardProps} /></Wrapper>;
        default:
            return null;
    }
}

import { memo } from 'react';
import { FolderOpen } from 'lucide-react';
import type { Item, FolderContent } from '../../../lib/types';
import { useAppStore } from '../../../store/useAppStore';
import { QuickActions } from '../QuickActions';
import { getRelativeTime } from '../../../hooks/useKeyboardNavigation';
import {
    PinIndicator,
    SyncStatusIndicator,
    type CardEventProps,
} from '../CardUtils';

interface FolderCardProps extends CardEventProps {
    item: Item;
}

export const FolderCard = memo(function FolderCard({ item, isSelected, isCut, onClick, onDoubleClick, onContextMenu, onDragStart: _onDragStart, hideControls, variant, gridStyles }: FolderCardProps) {
    const content = item.content as FolderContent;
    const allItems = useAppStore((state) => state.items);
    const dynamicItemCount = allItems.filter(i => i.folder_id === item.id && !i.deleted_at).length;

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={`Folder: ${item.title}, ${dynamicItemCount} items${isSelected ? ', selected' : ''}`}
            aria-selected={isSelected}
            className={`card ${isSelected ? 'selected' : ''} ${isCut ? 'cut' : ''}`}
            style={{ backgroundColor: item.bg_color !== '#FFFFFF' ? item.bg_color : '#FFFBEB', ...gridStyles }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(e as any); }}
        >
            {!hideControls && <QuickActions item={item} />}
            <PinIndicator isPinned={item.is_pinned} />
            <SyncStatusIndicator isUnsynced={item.is_unsynced} />

            {/* Compact: inline icon + title + count */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flex: variant === 'grid' ? 1 : undefined,
            }}>
                <div
                    className="folder-icon-animated"
                    style={{
                        width: 36,
                        height: 36,
                        background: '#FEF3C7',
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1.5px solid #FCD34D',
                        flexShrink: 0,
                    }}
                >
                    <FolderOpen size={18} style={{ color: '#D97706' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="card-title" style={{ marginBottom: 0, fontSize: '0.9375rem' }}>{item.title}</h3>
                    <span style={{ fontSize: '0.7rem', color: '#92400E' }}>
                        {dynamicItemCount} item{dynamicItemCount !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {content.description && (
                <p className="card-content" style={{ marginBottom: 0, fontSize: '0.8125rem', color: '#6B7280' }}>{content.description}</p>
            )}

            <div className="card-meta" style={{ marginTop: 'auto' }}>
                <span className="type-indicator folder" title="Folder" />
                <span className="relative-time">{getRelativeTime(item.updated_at)}</span>
            </div>
        </div>
    );
});

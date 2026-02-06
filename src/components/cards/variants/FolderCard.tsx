import { memo, useMemo } from 'react';
import { FolderOpen, FileText, Image, Link2, File } from 'lucide-react';
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

export const FolderCard = memo(function FolderCard({ item, isSelected, isCut, onClick, onDoubleClick, onContextMenu, onDragStart: _onDragStart, hideControls, variant: _variant, gridStyles }: FolderCardProps) {
    const content = item.content as FolderContent;
    const allItems = useAppStore((state) => state.items);

    const { dynamicItemCount, typeCounts } = useMemo(() => {
        const folderItems = allItems.filter(i => i.folder_id === item.id && !i.deleted_at);
        const counts = { note: 0, link: 0, image: 0, file: 0 };
        folderItems.forEach(i => {
            if (i.type in counts) counts[i.type as keyof typeof counts]++;
        });
        return { dynamicItemCount: folderItems.length, typeCounts: counts };
    }, [allItems, item.id]);

    const typeBreakdown = [
        { type: 'note', icon: FileText, count: typeCounts.note, color: '#6B7280' },
        { type: 'link', icon: Link2, count: typeCounts.link, color: '#3B82F6' },
        { type: 'image', icon: Image, count: typeCounts.image, color: '#F59E0B' },
        { type: 'file', icon: File, count: typeCounts.file, color: '#8B5CF6' },
    ].filter(t => t.count > 0);

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={`Folder: ${item.title}, ${dynamicItemCount} items${isSelected ? ', selected' : ''}`}
            aria-selected={isSelected}
            className={`card ${isSelected ? 'selected' : ''} ${isCut ? 'cut' : ''}`}
            style={{ backgroundColor: item.bg_color !== '#FFFFFF' ? item.bg_color : 'var(--card-folder-bg, #FFFBEB)', ...gridStyles }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(e as any); }}
        >
            {!hideControls && <QuickActions item={item} />}
            <PinIndicator isPinned={item.is_pinned} />
            <SyncStatusIndicator isUnsynced={item.is_unsynced} />

            {/* Header: icon + title + count */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
            }}>
                <div className="folder-icon-animated" style={{
                    width: 36,
                    height: 36,
                    background: 'var(--folder-icon-bg, #FEF3C7)',
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1.5px solid var(--folder-icon-border, #FCD34D)',
                    flexShrink: 0,
                }}>
                    <FolderOpen size={18} style={{ color: 'var(--accent, #D97706)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="card-title" style={{ marginBottom: 0, fontSize: '0.9375rem' }}>{item.title}</h3>
                    <span style={{ fontSize: '0.7rem', color: 'var(--folder-count-color, #92400E)' }}>
                        {dynamicItemCount} item{dynamicItemCount !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {/* Item type breakdown pills */}
            {typeBreakdown.length > 0 && (
                <div className="folder-type-breakdown" style={{
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                    marginTop: 8,
                }}>
                    {typeBreakdown.map(t => (
                        <div key={t.type} className="folder-type-pill" style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: 12,
                            background: `${t.color}12`,
                            fontSize: '0.7rem',
                            color: t.color,
                            fontWeight: 500,
                        }}>
                            <t.icon size={10} />
                            {t.count}
                        </div>
                    ))}
                </div>
            )}

            {content.description && (
                <p className="card-content" style={{ marginBottom: 0, marginTop: 6, fontSize: '0.8125rem', color: 'var(--text-secondary, #6B7280)' }}>{content.description}</p>
            )}

            <div className="card-meta" style={{ marginTop: 'auto' }}>
                <span className="type-indicator folder" title="Folder" />
                <span className="relative-time">{getRelativeTime(item.updated_at)}</span>
            </div>
        </div>
    );
});

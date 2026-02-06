import { memo } from 'react';
import type { Item, FileMeta } from '../../../lib/types';
import { QuickActions } from '../QuickActions';
import {
    PinIndicator,
    SyncStatusIndicator,
    TagsDisplay,
    DateTimeIndicator,
    SecureImage,
    formatFileSize,
    type CardEventProps,
} from '../CardUtils';

interface ImageCardProps extends CardEventProps {
    item: Item;
}

export const ImageCard = memo(function ImageCard({ item, isSelected, isCut, onClick, onDoubleClick, onContextMenu, onDragStart: _onDragStart, hideControls, variant, gridStyles }: ImageCardProps) {
    const fileMeta = item.file_meta as FileMeta | null;
    const fileSize = fileMeta ? formatFileSize(fileMeta.size) : '';
    const imagePath = fileMeta?.path;

    const cleanTitle = (() => {
        const title = item.title || 'Untitled Image';
        if (title.match(/^(original|temp|upload|image)-[a-f0-9]{20,}\.[a-z]+$/i)) {
            const ext = title.split('.').pop()?.toUpperCase() || 'IMAGE';
            return `${ext} Image`;
        }
        if (title.length > 30) {
            return title.substring(0, 27) + '...';
        }
        return title;
    })();

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={`Image: ${cleanTitle}${isSelected ? ', selected' : ''}`}
            aria-selected={isSelected}
            className={`card card-image ${isSelected ? 'selected' : ''} ${isCut ? 'cut' : ''}`}
            style={{ backgroundColor: item.bg_color !== '#FFFFFF' ? item.bg_color : undefined, padding: 0, overflow: 'hidden', ...gridStyles }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(e as any); }}
        >
            {!hideControls && <QuickActions item={item} />}
            <PinIndicator isPinned={item.is_pinned} />
            <SyncStatusIndicator isUnsynced={item.is_unsynced} />

            {/* Image fills the card with aspect-ratio */}
            <div
                className="card-image-preview"
                style={{
                    width: '100%',
                    aspectRatio: variant === 'grid' ? '4/3' : '16/9',
                    background: 'rgba(0, 0, 0, 0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    position: 'relative',
                    flexShrink: 0,
                }}
            >
                {imagePath ? (
                    <SecureImage
                        path={imagePath}
                        alt={cleanTitle}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                        }}
                    />
                ) : (
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                    </svg>
                )}
            </div>

            {/* Compact info footer */}
            <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h3 className="card-title" title={cleanTitle} style={{ fontSize: '0.875rem', margin: 0 }}>{cleanTitle}</h3>

                <TagsDisplay tags={item.tags} />
                <DateTimeIndicator item={item} />

                <div className="card-meta" style={{ marginTop: 2, padding: 0, border: 'none' }}>
                    <span className="type-indicator image" title="Image" />
                    {fileSize && (
                        <span style={{ fontSize: '0.7rem', color: '#9CA3AF', marginLeft: 'auto' }}>
                            {fileSize}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
});

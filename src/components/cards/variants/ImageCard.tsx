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
            style={{ backgroundColor: item.bg_color !== '#FFFFFF' ? item.bg_color : undefined, ...gridStyles }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(e as any); }}
        >
            {!hideControls && <QuickActions item={item} />}
            <PinIndicator isPinned={item.is_pinned} />
            <SyncStatusIndicator isUnsynced={item.is_unsynced} />

            <div
                className="card-image-preview"
                style={{
                    height: variant === 'grid' ? 100 : 120,
                    flex: variant === 'grid' ? 1 : undefined,
                    background: 'rgba(255, 255, 255, 0.4)',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                    overflow: 'hidden',
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
                            borderRadius: 8,
                        }}
                    />
                ) : (
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                    </svg>
                )}
            </div>

            <h3 className="card-title" title={cleanTitle}>{cleanTitle}</h3>

            <TagsDisplay tags={item.tags} />
            <DateTimeIndicator item={item} />

            <div className="card-meta" style={{ marginTop: 'auto' }}>
                <span className="type-indicator image" title="Image" />
                {fileSize && (
                    <span style={{ fontSize: '0.75rem', color: '#6B7280', marginLeft: 'auto' }}>
                        {fileSize}
                    </span>
                )}
            </div>
        </div>
    );
});

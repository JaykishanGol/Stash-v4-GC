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

            {/* Image fills the card — gradient scrim for title overlay */}
            <div className="image-card-hero" style={{ position: 'relative', width: '100%', flexShrink: 0 }}>
                <div
                    className="card-image-preview"
                    style={{
                        width: '100%',
                        aspectRatio: variant === 'grid' ? '4/3' : '16/9',
                        background: 'var(--bg-content, #f3f4f6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
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
                            }}
                        />
                    ) : (
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted, #9CA3AF)" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                        </svg>
                    )}
                </div>
                {/* Gradient scrim for title readability */}
                <div className="image-card-scrim" />
                {/* Title overlay on image */}
                <div className="image-card-overlay-title">
                    <span>{cleanTitle}</span>
                    {fileSize && <span className="image-card-size">{fileSize}</span>}
                </div>
            </div>

            {/* Compact footer for tags/date */}
            <div style={{ padding: '6px 12px 8px' }}>
                <TagsDisplay tags={item.tags} />
                <DateTimeIndicator item={item} />
                <div className="card-meta" style={{ marginTop: 2, padding: 0, border: 'none' }}>
                    <span className="type-indicator image" title="Image" />
                </div>
            </div>
        </div>
    );
});

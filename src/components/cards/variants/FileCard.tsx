import { memo, useMemo } from 'react';
import type { Item } from '../../../lib/types';
import { isFileMeta } from '../../../lib/types';
import { QuickActions } from '../QuickActions';
import { getRelativeTime } from '../../../hooks/useKeyboardNavigation';
import {
    PinIndicator,
    SyncStatusIndicator,
    TagsDisplay,
    DateTimeIndicator,
    FileTypeIcon,
    getFileExtension,
    formatFileSize,
    type CardEventProps,
} from '../CardUtils';

interface FileCardProps extends CardEventProps {
    item: Item;
}

export const FileCard = memo(function FileCard({ item, isSelected, isCut, onClick, onDoubleClick, onContextMenu, onDragStart: _onDragStart, hideControls, variant, gridStyles }: FileCardProps) {
    const fileMeta = useMemo(() => {
        if (isFileMeta(item.file_meta)) return item.file_meta;
        return null;
    }, [item.file_meta]);

    const fileSize = fileMeta ? formatFileSize(fileMeta.size) : 'Unknown size';
    const extension = getFileExtension(item.title || '', fileMeta?.mime);

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={`File: ${item.title || 'Untitled File'}${isSelected ? ', selected' : ''}`}
            aria-selected={isSelected}
            className={`card card-default ${isSelected ? 'selected' : ''} ${isCut ? 'cut' : ''}`}
            style={{ backgroundColor: item.bg_color !== '#FFFFFF' ? item.bg_color : undefined, ...gridStyles }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(e as any); }}
        >
            {!hideControls && <QuickActions item={item} />}
            <PinIndicator isPinned={item.is_pinned} />
            <SyncStatusIndicator isUnsynced={item.is_unsynced} />

            <h3 className="card-title" title={item.title || 'Untitled File'}>
                {item.title || 'Untitled File'}
            </h3>

            <div className="file-card-content" style={{ flex: variant === 'grid' ? 1 : undefined, justifyContent: 'center' }}>
                <FileTypeIcon extension={extension} />
                <div className="file-info">
                    <p className="file-meta" style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                        {extension.toUpperCase() || 'FILE'}
                    </p>
                    <p className="file-meta" style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>{fileSize}</p>
                </div>
            </div>

            <TagsDisplay tags={item.tags} />
            <DateTimeIndicator item={item} />

            <div className="card-meta" style={{ marginTop: 'auto' }}>
                <span className="type-indicator file" title="File" />
                <span className="relative-time">{getRelativeTime(item.updated_at)}</span>
            </div>
        </div>
    );
});

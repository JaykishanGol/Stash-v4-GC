import { memo, useMemo } from 'react';
import type { Item, LinkContent } from '../../../lib/types';
import { isLinkContent } from '../../../lib/types';
import { extractDomain, sanitizeString } from '../../../lib/utils';
import { QuickActions } from '../QuickActions';
import {
    PinIndicator,
    SyncStatusIndicator,
    TagsDisplay,
    DateTimeIndicator,
    type CardEventProps,
} from '../CardUtils';

interface LinkCardProps extends CardEventProps {
    item: Item;
}

export const LinkCard = memo(function LinkCard({ item, isSelected, isCut, onClick, onDoubleClick, onContextMenu, onDragStart: _onDragStart, hideControls, variant, gridStyles }: LinkCardProps) {
    const content = useMemo(() => {
        if (isLinkContent(item.content)) return item.content;
        return { url: '' } as LinkContent;
    }, [item.content]);

    const domain = content.url ? extractDomain(content.url) : '';

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={`Link: ${item.title || 'Untitled Link'}${isSelected ? ', selected' : ''}`}
            aria-selected={isSelected}
            className={`card card-blue ${isSelected ? 'selected' : ''} ${isCut ? 'cut' : ''}`}
            style={{ backgroundColor: item.bg_color !== '#FFFFFF' ? item.bg_color : undefined, ...gridStyles }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(e as any); }}
        >
            {!hideControls && <QuickActions item={item} />}
            <PinIndicator isPinned={item.is_pinned} />
            <SyncStatusIndicator isUnsynced={item.is_unsynced} />

            <h3 className="card-title" title={item.title || content.title || domain || 'Untitled Link'}>
                {item.title || content.title || domain || 'Untitled Link'}
            </h3>

            <div style={{ flex: variant === 'grid' ? 1 : undefined, display: 'flex', flexDirection: 'column' }}>
                {content.image && (
                    <div className="card-link-image" style={{ height: variant === 'grid' ? 80 : 120, margin: '8px 0', overflow: 'hidden', borderRadius: 4, flexShrink: 0 }}>
                        <img src={content.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                )}

                {content.description && (
                    <div className="card-link-description" style={{ fontSize: '0.8rem', color: '#6B7280', marginBottom: 8, display: '-webkit-box', WebkitLineClamp: variant === 'grid' ? 2 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {sanitizeString(content.description)}
                    </div>
                )}

                {content.url && (
                    <a href={content.url} target="_blank" rel="noopener noreferrer" className="card-content" style={{ color: '#1D4ED8', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem' }} onClick={(e) => e.stopPropagation()}>{content.url}</a>
                )}
            </div>

            <TagsDisplay tags={item.tags} />
            <DateTimeIndicator item={item} />

            <div className="card-meta" style={{ marginTop: 'auto' }}>
                <span className="type-indicator link" title="Link" />
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {content.favicon && <img src={content.favicon} alt="" style={{ width: 14, height: 14 }} />}
                    {domain && (
                        <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                            {domain}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
});

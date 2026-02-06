import { memo, useMemo } from 'react';
import { ExternalLink, Globe } from 'lucide-react';
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
            className={`card card-link-styled ${isSelected ? 'selected' : ''} ${isCut ? 'cut' : ''}`}
            style={{ backgroundColor: item.bg_color !== '#FFFFFF' ? item.bg_color : undefined, padding: 0, overflow: 'hidden', ...gridStyles }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(e as any); }}
        >
            {!hideControls && <QuickActions item={item} />}
            <PinIndicator isPinned={item.is_pinned} />
            <SyncStatusIndicator isUnsynced={item.is_unsynced} />

            {/* OG Image as card hero when available */}
            {content.image && (
                <div className="link-card-hero" style={{ position: 'relative' }}>
                    <div style={{
                        width: '100%',
                        aspectRatio: '2/1',
                        overflow: 'hidden',
                        background: 'var(--bg-content, #f3f4f6)',
                    }}>
                        <img
                            src={content.image}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            loading="lazy"
                        />
                    </div>
                </div>
            )}

            {/* Content section */}
            <div style={{ padding: '12px 14px 10px', display: 'flex', flexDirection: 'column', gap: 6, flex: variant === 'grid' ? 1 : undefined }}>
                <h3 className="card-title" title={item.title || content.title || domain || 'Untitled Link'} style={{ margin: 0, fontSize: '0.9375rem' }}>
                    {item.title || content.title || domain || 'Untitled Link'}
                </h3>

                {content.description && (
                    <div style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary, #6B7280)',
                        display: '-webkit-box',
                        WebkitLineClamp: variant === 'grid' ? 2 : 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        lineHeight: 1.4,
                    }}>
                        {sanitizeString(content.description)}
                    </div>
                )}

                {/* Domain pill */}
                {domain && (
                    <div className="link-domain-pill">
                        {content.favicon ? (
                            <img src={content.favicon} alt="" style={{ width: 14, height: 14, borderRadius: 2 }} />
                        ) : (
                            <Globe size={12} />
                        )}
                        <span>{domain}</span>
                        <ExternalLink size={10} style={{ opacity: 0.5 }} />
                    </div>
                )}

                <TagsDisplay tags={item.tags} />
                <DateTimeIndicator item={item} />

                <div className="card-meta" style={{ marginTop: 'auto', padding: 0, border: 'none' }}>
                    <span className="type-indicator link" title="Link" />
                </div>
            </div>
        </div>
    );
});

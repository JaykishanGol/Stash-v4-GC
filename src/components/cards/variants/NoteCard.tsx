import { memo, useMemo } from 'react';
import { Check } from 'lucide-react';
import type { Item, NoteContent } from '../../../lib/types';
import { isNoteContent } from '../../../lib/types';
import { sanitizeString } from '../../../lib/utils';
import { useAppStore } from '../../../store/useAppStore';
import { QuickActions } from '../QuickActions';
import { getRelativeTime } from '../../../hooks/useKeyboardNavigation';
import {
    PinIndicator,
    SyncStatusIndicator,
    TagsDisplay,
    DateTimeIndicator,
    type CardEventProps,
} from '../CardUtils';

interface NoteCardProps extends CardEventProps {
    item: Item;
    colorClass: string;
}

export const NoteCard = memo(function NoteCard({ item, colorClass, isSelected, isCut, onClick, onDoubleClick, onContextMenu, onDragStart: _onDragStart, compact, hideControls, variant, gridStyles }: NoteCardProps) {
    const { updateItem } = useAppStore();

    const content = useMemo(() => {
        if (isNoteContent(item.content)) return item.content;
        return { text: '', checklist: [] } as NoteContent;
    }, [item.content]);

    const hasChecklist = content.checklist && content.checklist.length > 0;

    const handleCheckToggle = (e: React.MouseEvent, todoId: string) => {
        e.stopPropagation();
        if (!content.checklist) return;
        const newChecklist = content.checklist.map(t =>
            t.id === todoId ? { ...t, checked: !t.checked } : t
        );
        updateItem(item.id, {
            content: { ...content, checklist: newChecklist },
            updated_at: new Date().toISOString()
        });
    };

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={`${item.title || 'Untitled Note'}${isSelected ? ', selected' : ''}`}
            aria-selected={isSelected}
            className={`card ${colorClass} ${isSelected ? 'selected' : ''} ${isCut ? 'cut' : ''} ${compact ? 'compact' : ''}`}
            style={{ backgroundColor: item.bg_color !== '#FFFFFF' ? item.bg_color : undefined, ...gridStyles }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(e as any); }}
        >
            {!hideControls && <QuickActions item={item} />}
            <PinIndicator isPinned={item.is_pinned} />
            <SyncStatusIndicator isUnsynced={item.is_unsynced} />

            <h3 className="card-title" title={item.title || 'Untitled Note'}>
                {item.title || 'Untitled Note'}
            </h3>

            <div style={{ flex: variant === 'grid' ? 1 : undefined, overflow: 'hidden' }}>
                {hasChecklist ? (
                    <div className="card-checklist">
                        {content.checklist!.slice(0, variant === 'grid' ? 3 : 4).map((checkItem) => (
                            <div
                                key={checkItem.id}
                                className={`card-checklist-item ${checkItem.checked ? 'checked' : ''}`}
                                onClick={(e) => handleCheckToggle(e, checkItem.id)}
                                style={{ cursor: 'pointer' }}
                            >
                                <span className={`card-checklist-checkbox ${checkItem.checked ? 'checked' : ''}`}>
                                    {checkItem.checked && <Check size={10} />}
                                </span>
                                <span className="card-checklist-text">{checkItem.text || 'Untitled'}</span>
                            </div>
                        ))}
                    </div>
                ) : content.text ? (
                    <div
                        className="card-content rich-text-content"
                        style={{
                            display: '-webkit-box',
                            WebkitLineClamp: variant === 'grid' ? 5 : 8,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                        }}
                        dangerouslySetInnerHTML={{ __html: sanitizeString(content.text, { allowHtml: true }) }}
                    />
                ) : (
                    <div className="card-content placeholder" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                        Empty note
                    </div>
                )}
            </div>

            <TagsDisplay tags={item.tags} />
            <DateTimeIndicator item={item} />

            <div className="card-meta" style={{ marginTop: 'auto' }}>
                <span className="type-indicator note" title="Note" />
                {item.priority !== 'none' && (
                    <span
                        className="priority-indicator"
                        style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: item.priority === 'high' ? '#EF4444' : item.priority === 'medium' ? '#F59E0B' : '#10B981'
                        }}
                    />
                )}
                <span className="relative-time">{getRelativeTime(item.updated_at)}</span>
            </div>
        </div>
    );
});

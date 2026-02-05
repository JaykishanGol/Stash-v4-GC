import { useState, useEffect, useMemo } from 'react';
import { supabase, STORAGE_BUCKET } from '../../lib/supabase';
import { Check, FolderOpen, Pin, Calendar, Bell, CloudOff } from 'lucide-react';
import type { Item, NoteContent, LinkContent, FileMeta, FolderContent } from '../../lib/types';
import { isNoteContent, isLinkContent, isFileMeta } from '../../lib/types';
import { formatFileSize, extractDomain, sanitizeString } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import { QuickActions } from './QuickActions';
import { getRelativeTime } from '../../hooks/useKeyboardNavigation';
import { useLongPress } from '../../hooks/useLongPress';

// Date/Time indicator for due dates and reminders
function DateTimeIndicator({ item }: { item: Item }) {
    const now = new Date();
    const scheduledDate = item.scheduled_at ? new Date(item.scheduled_at) : null;
    const reminderDate = scheduledDate && item.remind_before
        ? new Date(scheduledDate.getTime() - item.remind_before * 60 * 1000)
        : null;

    if (!scheduledDate && !reminderDate) return null;

    const formatDateTime = (date: Date): string => {
        const isToday = date.toDateString() === now.toDateString();
        const isTomorrow = date.toDateString() === new Date(now.getTime() + 86400000).toDateString();
        const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

        if (isToday) return `Today, ${timeStr}`;
        if (isTomorrow) return `Tomorrow, ${timeStr}`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${timeStr}`;
    };

    const isOverdue = scheduledDate && scheduledDate < now && !item.is_completed;

    return (
        <div className="date-indicator-row">
            {scheduledDate && (
                <div className={`date-indicator ${isOverdue ? 'overdue' : ''}`}>
                    <Calendar size={12} />
                    <span>{formatDateTime(scheduledDate)}</span>
                </div>
            )}
            {reminderDate && (
                <div className="date-indicator reminder">
                    <Bell size={12} />
                    <span>{formatDateTime(reminderDate)}</span>
                </div>
            )}
        </div>
    );
}

interface ItemCardProps {
    item: Item;
    compact?: boolean;
    hideControls?: boolean;
    variant?: 'masonry' | 'grid';
}

interface CardEventProps {
    isSelected: boolean;
    isCut: boolean;
    onClick: (e: React.MouseEvent) => void;
    onDoubleClick: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onDragStart: (e: React.DragEvent) => void;
    compact?: boolean;
    hideControls?: boolean;
    variant?: 'masonry' | 'grid';
    gridStyles?: React.CSSProperties;
}

function getCardColorClass(bgColor: string): string {
    const colorMap: Record<string, string> = {
        '#FFFFFF': 'card-default',
        '#FFB5A7': 'card-coral',
        '#FDE68A': 'card-yellow',
        '#BFDBFE': 'card-blue',
        '#FBCFE8': 'card-pink',
        '#86EFAC': 'card-green',
        '#DDD6FE': 'card-purple',
        '#99F6E4': 'card-teal',
        '#E0E7FF': 'card-file',
        '#FEF3C7': 'card-image',
        '#FFFBEB': 'card-folder',
    };
    return colorMap[bgColor] || 'card-default';
}

function getFileExtension(filename: string, mime?: string): string {
    if (filename) {
        return filename.split('.').pop()?.toLowerCase() || '';
    }
    if (mime) {
        if (mime.includes('pdf')) return 'pdf';
        if (mime.includes('word') || mime.includes('document')) return 'doc';
        if (mime.includes('spreadsheet') || mime.includes('excel')) return 'xls';
        if (mime.includes('presentation') || mime.includes('powerpoint')) return 'ppt';
    }
    return '';
}

function FileTypeIcon({ extension }: { extension: string }) {
    const iconConfig: Record<string, { color: string; label: string; bg: string }> = {
        pdf: { color: '#DC2626', label: 'PDF', bg: '#FEE2E2' },
        doc: { color: '#2563EB', label: 'DOC', bg: '#DBEAFE' },
        docx: { color: '#2563EB', label: 'DOC', bg: '#DBEAFE' },
        xls: { color: '#16A34A', label: 'XLS', bg: '#DCFCE7' },
        xlsx: { color: '#16A34A', label: 'XLS', bg: '#DCFCE7' },
        ppt: { color: '#EA580C', label: 'PPT', bg: '#FED7AA' },
        pptx: { color: '#EA580C', label: 'PPT', bg: '#FED7AA' },
        zip: { color: '#7C3AED', label: 'ZIP', bg: '#EDE9FE' },
        rar: { color: '#7C3AED', label: 'RAR', bg: '#EDE9FE' },
        txt: { color: '#6B7280', label: 'TXT', bg: '#F3F4F6' },
        csv: { color: '#16A34A', label: 'CSV', bg: '#DCFCE7' },
    };

    const config = iconConfig[extension] || { color: '#6B7280', label: extension.toUpperCase() || 'FILE', bg: '#F3F4F6' };

    return (
        <div style={{
            width: 48,
            height: 48,
            background: config.bg,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            marginBottom: 12,
            border: `1px solid ${config.color}20`,
        }}>
            <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
                <path d="M12 0H2C0.9 0 0 0.9 0 2V22C0 23.1 0.9 24 2 24H18C19.1 24 20 23.1 20 22V8L12 0Z" fill={config.bg} stroke={config.color} strokeWidth="1" />
                <path d="M12 0V8H20" fill={config.bg} stroke={config.color} strokeWidth="1" />
            </svg>
            <span style={{ fontSize: '0.55rem', fontWeight: 700, color: config.color, marginTop: 2 }}>{config.label}</span>
        </div>
    );
}

function PinIndicator({ isPinned }: { isPinned: boolean }) {
    if (!isPinned) return null;
    return (
        <div className="card-pin-indicator">
            <Pin size={12} />
        </div>
    );
}

function SyncStatusIndicator({ isUnsynced }: { isUnsynced?: boolean }) {
    if (!isUnsynced) return null;
    return (
        <div className="card-sync-indicator" title="Pending sync">
            <CloudOff size={12} />
        </div>
    );
}

function TagsDisplay({ tags }: { tags: string[] }) {
    if (!tags || tags.length === 0) return null;
    return (
        <div className="card-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, padding: '0 12px' }}>
            {tags.slice(0, 3).map(tag => (
                <span key={tag} className="tag-chip" style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    borderRadius: 12,
                    color: '#3B82F6',
                    fontWeight: 500
                }}>
                    #{tag}
                </span>
            ))}
            {tags.length > 3 && (
                <span className="tag-chip" style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    background: 'rgba(0,0,0,0.05)',
                    borderRadius: 12,
                    color: 'var(--text-muted)'
                }}>
                    +{tags.length - 3}
                </span>
            )}
        </div>
    );
}

function SecureImage({ path, alt, style }: { path: string; alt: string; style?: React.CSSProperties }) {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        if (!path) return;
        if (path.startsWith('http') || path.startsWith('blob:')) {
            setSrc(path);
            return;
        }

        let isMounted = true;
        supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600, {
            transform: { width: 300, height: 300, resize: 'cover' }
        }).then(({ data }) => {
            if (isMounted && data?.signedUrl) {
                setSrc(data.signedUrl);
            } else {
                const { data: publicData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path, {
                    transform: { width: 300, height: 300, resize: 'cover' }
                });
                if (isMounted) setSrc(publicData.publicUrl);
            }
        });

        return () => { isMounted = false; };
    }, [path]);

    const effectiveSrc = (path && path.startsWith('http')) ? path : src;
    if (!effectiveSrc) return <div style={{ ...style, background: '#f5f5f5' }} />;
    return <img src={effectiveSrc} alt={alt} style={style} />;
}

// Checkbox Component for Batch Selection
function SelectionCheckbox({ isSelected, onClick }: { isSelected: boolean, onClick: (e: React.MouseEvent) => void }) {
    return (
        <div
            className={`selection-checkbox ${isSelected ? 'checked' : ''}`}
            onClick={onClick}
            style={{
                position: 'absolute',
                top: 8,
                left: 8,
                zIndex: 20,
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: '2px solid rgba(0,0,0,0.2)',
                background: isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.8)',
                borderColor: isSelected ? 'var(--primary)' : 'rgba(0,0,0,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'white',
                opacity: isSelected ? 1 : 0,
                transition: 'all 0.2s ease',
            }}
        >
            {isSelected && <Check size={12} strokeWidth={3} />}
        </div>
    );
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

// Note Card Component
interface NoteCardProps extends CardEventProps {
    item: Item;
    colorClass: string;
}

function NoteCard({ item, colorClass, isSelected, isCut, onClick, onDoubleClick, onContextMenu, onDragStart: _onDragStart, compact, hideControls, variant, gridStyles }: NoteCardProps) {
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
        // draggable handled by wrapper
        >
            {!hideControls && <QuickActions item={item} />}
            <PinIndicator isPinned={item.is_pinned} />
            <SyncStatusIndicator isUnsynced={item.is_unsynced} />

            <h3 className="card-title" title={item.title || 'Untitled Note'}>
                {item.title || 'Untitled Note'}
            </h3>

            {/* Flexible Content Area for Grid */}
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
}

// File Card Component
interface FileCardProps extends CardEventProps {
    item: Item;
}

function FileCard({ item, isSelected, isCut, onClick, onDoubleClick, onContextMenu, onDragStart: _onDragStart, hideControls, variant, gridStyles }: FileCardProps) {
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
        // draggable handled by wrapper
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
}

// Link Card Component
interface LinkCardProps extends CardEventProps {
    item: Item;
}

function LinkCard({ item, isSelected, isCut, onClick, onDoubleClick, onContextMenu, onDragStart: _onDragStart, hideControls, variant, gridStyles }: LinkCardProps) {
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
        // draggable handled by wrapper
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
}

// Image Card Component
interface ImageCardProps extends CardEventProps {
    item: Item;
}

function ImageCard({ item, isSelected, isCut, onClick, onDoubleClick, onContextMenu, onDragStart: _onDragStart, hideControls, variant, gridStyles }: ImageCardProps) {
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
        // draggable handled by wrapper
        >
            {!hideControls && <QuickActions item={item} />}
            <PinIndicator isPinned={item.is_pinned} />
            <SyncStatusIndicator isUnsynced={item.is_unsynced} />

            <div
                className="card-image-preview"
                style={{
                    height: variant === 'grid' ? 100 : 120, // Reduced height for grid
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
}

// Folder Card Component
interface FolderCardProps extends CardEventProps {
    item: Item;
}

function FolderCard({ item, isSelected, isCut, onClick, onDoubleClick, onContextMenu, onDragStart: _onDragStart, hideControls, variant, gridStyles }: FolderCardProps) {
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
        // draggable handled by wrapper
        >
            {!hideControls && <QuickActions item={item} />}
            <PinIndicator isPinned={item.is_pinned} />
            <SyncStatusIndicator isUnsynced={item.is_unsynced} />

            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 12,
                flex: variant === 'grid' ? 1 : undefined,
            }}>
                <div
                    className="folder-icon-animated"
                    style={{
                        width: 48,
                        height: 48,
                        background: '#FEF3C7',
                        borderRadius: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid #FCD34D',
                    }}
                >
                    <FolderOpen size={24} style={{ color: '#D97706' }} />
                </div>
                <div>
                    <h3 className="card-title" style={{ marginBottom: 2 }}>{item.title}</h3>
                    <span style={{ fontSize: '0.75rem', color: '#92400E' }}>
                        {dynamicItemCount} item{dynamicItemCount !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {content.description && (
                <p className="card-content" style={{ marginBottom: 0 }}>{content.description}</p>
            )}

            <div className="card-meta" style={{ marginTop: 'auto' }}>
                <span className="type-indicator folder" title="Folder" />
                <span className="relative-time">{getRelativeTime(item.updated_at)}</span>
            </div>
        </div>
    );
}

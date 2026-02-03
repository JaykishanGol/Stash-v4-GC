import { useState, useEffect, useMemo } from 'react';
import { supabase, STORAGE_BUCKET } from '../../lib/supabase';
import { Check, FolderOpen, Pin, Calendar, Bell, AlertTriangle } from 'lucide-react';
import type { Item, NoteContent, LinkContent, FileMeta, FolderContent } from '../../lib/types';
import { isNoteContent, isLinkContent, isFileMeta } from '../../lib/types';
import { formatFileSize, extractDomain, sanitizeString } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import { QuickActions } from './QuickActions';
import { getRelativeTime } from '../../hooks/useKeyboardNavigation';

// Date/Time indicator for due dates and reminders (SIMPLIFIED)
function DateTimeIndicator({ item }: { item: Item }) {
    const now = new Date();

    // Get due date and reminder from simplified fields
    const dueDate = item.due_at ? new Date(item.due_at) : null;
    // Prefer next_trigger_at, fallback to legacy remind_at for display only
    const reminderDate = item.next_trigger_at 
        ? new Date(item.next_trigger_at) 
        : (item.remind_at ? new Date(item.remind_at) : null);

    if (!dueDate && !reminderDate) return null;

    const formatDateTime = (date: Date): string => {
        const isToday = date.toDateString() === now.toDateString();
        const isTomorrow = date.toDateString() === new Date(now.getTime() + 86400000).toDateString();

        const timeStr = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        if (isToday) return `Today, ${timeStr}`;
        if (isTomorrow) return `Tomorrow, ${timeStr}`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        }) + `, ${timeStr}`;
    };

    const isOverdue = dueDate && dueDate < now && !item.is_completed;

    return (
        <div className="date-indicator-row">
            {dueDate && (
                <div className={`date-indicator ${isOverdue ? 'overdue' : ''}`}>
                    <Calendar size={12} />
                    <span>{formatDateTime(dueDate)}</span>
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
    hideControls?: boolean;  // Hide selection indicator and quick actions (for task context)
}

// Map bg_color to CSS class
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



// Get file extension from filename or mime type
function getFileExtension(filename: string, mime?: string): string {
    if (filename) {
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        return ext;
    }
    if (mime) {
        if (mime.includes('pdf')) return 'pdf';
        if (mime.includes('word') || mime.includes('document')) return 'doc';
        if (mime.includes('spreadsheet') || mime.includes('excel')) return 'xls';
        if (mime.includes('presentation') || mime.includes('powerpoint')) return 'ppt';
    }
    return '';
}

// File type icons with brand colors
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

export function ItemCard({ item, compact = false, hideControls = false }: ItemCardProps) {
    const {
        selectedItemIds,
        selectItem,
        clipboard,
        setEditingItem,
        setSelectedFolder,
        setPreviewingItem,
        openContextMenu,
    } = useAppStore();

    const isSelected = selectedItemIds.includes(item.id);
    const isCut = clipboard.operation === 'cut' && clipboard.items.some(i => i.id === item.id);
    const colorClass = getCardColorClass(item.bg_color);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();

        // Ctrl/Cmd+Click for multi-select
        if (e.ctrlKey || e.metaKey) {
            selectItem(item.id, true);
            return;
        }

        // Single-click opens the item (premium behavior)
        if (item.type === 'folder') {
            setSelectedFolder(item.id);
        } else if (item.type === 'image' || item.type === 'file') {
            setPreviewingItem(item);
        } else if (item.type === 'link') {
            // For links, open in new tab
            const content = item.content as LinkContent;
            if (content.url) {
                window.open(content.url, '_blank');
            }
        } else {
            // For notes, open edit modal
            setEditingItem(item);
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Double-click selects the item (for when single-click opens)
        selectItem(item.id);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        openContextMenu(e.clientX, e.clientY, item.id);
    };

    // Handle drag start - store item IDs in dataTransfer
    const handleDragStart = (e: React.DragEvent) => {
        // If the dragged item isn't selected, select it
        if (!isSelected) {
            selectItem(item.id);
        }

        // FIX: Ensure we send at least the current item's ID
        // State updates are async, so selectedItemIds might be stale here
        const idsToDrag = isSelected
            ? selectedItemIds
            : [...selectedItemIds.filter(id => id !== item.id), item.id];

        e.dataTransfer.setData('application/json', JSON.stringify(idsToDrag));
        e.dataTransfer.effectAllowed = 'move';
    };

    switch (item.type) {
        case 'note':
            return (
                <NoteCard
                    item={item}
                    colorClass={colorClass}
                    isSelected={isSelected}
                    isCut={isCut}
                    onClick={handleClick}
                    onDoubleClick={handleDoubleClick}
                    onContextMenu={handleContextMenu}
                    onDragStart={handleDragStart}
                    compact={compact}
                    hideControls={hideControls}
                />
            );
        case 'file':
            return (
                <FileCard
                    item={item}
                    isSelected={isSelected}
                    isCut={isCut}
                    onClick={handleClick}
                    onDoubleClick={handleDoubleClick}
                    onContextMenu={handleContextMenu}

                    onDragStart={handleDragStart}
                    hideControls={hideControls}
                />
            );
        case 'link':
            return (
                <LinkCard
                    item={item}
                    isSelected={isSelected}
                    isCut={isCut}
                    onClick={handleClick}
                    onDoubleClick={handleDoubleClick}
                    onContextMenu={handleContextMenu}

                    onDragStart={handleDragStart}
                    hideControls={hideControls}
                />
            );
        case 'image':
            return (
                <ImageCard
                    item={item}
                    isSelected={isSelected}
                    isCut={isCut}
                    onClick={handleClick}
                    onDoubleClick={handleDoubleClick}
                    onContextMenu={handleContextMenu}

                    onDragStart={handleDragStart}
                    hideControls={hideControls}
                />
            );
        case 'folder':
            return (
                <FolderCard
                    item={item}
                    isSelected={isSelected}
                    isCut={isCut}
                    onClick={handleClick}
                    onDoubleClick={handleDoubleClick}
                    onContextMenu={handleContextMenu}

                    onDragStart={handleDragStart}
                    hideControls={hideControls}
                />
            );
        default:
            return null;
    }
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
}

// Selection indicator component
function SelectionIndicator({ isSelected }: { isSelected: boolean }) {
    return (
        <div className={`card-selection-indicator ${isSelected ? 'selected' : ''}`}>
            {isSelected && <Check size={12} />}
        </div>
    );
}

// Pin indicator component
function PinIndicator({ isPinned }: { isPinned: boolean }) {
    if (!isPinned) return null;
    return (
        <div className="card-pin-indicator">
            <Pin size={12} />
        </div>
    );
}

// Tags display component - reusable across all card types
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

// Note Card Component
interface NoteCardProps extends CardEventProps {
    item: Item;
    colorClass: string;
}

function NoteCard({ item, colorClass, isSelected, isCut, onClick, onDoubleClick, onContextMenu, onDragStart, compact, hideControls }: NoteCardProps) {
    const { updateItem } = useAppStore();

    // Robust content access
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
        updateItem(item.id, { content: { ...content, checklist: newChecklist } });
    };

    return (
        <div
            className={`card ${colorClass} ${isSelected ? 'selected' : ''} ${isCut ? 'cut' : ''} ${compact ? 'compact' : ''}`}
            style={{ backgroundColor: item.bg_color !== '#FFFFFF' ? item.bg_color : undefined }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            draggable
            onDragStart={onDragStart}
        >
            {!hideControls && <QuickActions item={item} />}
            {!hideControls && <SelectionIndicator isSelected={isSelected} />}
            <PinIndicator isPinned={item.is_pinned} />

            <h3 className="card-title" title={item.title || 'Untitled Note'}>
                {item.title || 'Untitled Note'}
            </h3>

            {hasChecklist ? (
                <div className="card-checklist">
                    {content.checklist!.slice(0, 4).map((checkItem) => (
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
                    {content.checklist!.length > 4 && (
                        <div className="card-checklist-more">
                            +{content.checklist!.length - 4} more
                        </div>
                    )}
                </div>
            ) : content.text ? (
                <div
                    className="card-content rich-text-content"
                    style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 8,
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

            <TagsDisplay tags={item.tags} />
            <DateTimeIndicator item={item} />

            <div className="card-meta">
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

function FileCard({ item, isSelected, isCut, onClick, onDoubleClick, onContextMenu, onDragStart, hideControls }: FileCardProps) {
    const fileMeta = useMemo(() => {
        if (isFileMeta(item.file_meta)) return item.file_meta;
        return null;
    }, [item.file_meta]);

    const fileSize = fileMeta ? formatFileSize(fileMeta.size) : 'Unknown size';
    const extension = getFileExtension(item.title || '', fileMeta?.mime);

    return (
        <div
            className={`card card-default ${isSelected ? 'selected' : ''} ${isCut ? 'cut' : ''}`}
            style={{ backgroundColor: item.bg_color !== '#FFFFFF' ? item.bg_color : undefined }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            draggable
            onDragStart={onDragStart}
        >
            {!hideControls && <QuickActions item={item} />}
            {!hideControls && <SelectionIndicator isSelected={isSelected} />}
            <PinIndicator isPinned={item.is_pinned} />

            <h3 className="card-title" title={item.title || 'Untitled File'}>
                {item.title || 'Untitled File'}
            </h3>

            <div className="file-card-content">
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

            <div className="card-meta">
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

function LinkCard({ item, isSelected, isCut, onClick, onDoubleClick, onContextMenu, onDragStart, hideControls }: LinkCardProps) {
    const content = useMemo(() => {
        if (isLinkContent(item.content)) return item.content;
        return { url: '' } as LinkContent;
    }, [item.content]);

    const domain = content.url ? extractDomain(content.url) : '';

    return (
        <div
            className={`card card-blue ${isSelected ? 'selected' : ''} ${isCut ? 'cut' : ''}`}
            style={{ backgroundColor: item.bg_color !== '#FFFFFF' ? item.bg_color : undefined }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            draggable
            onDragStart={onDragStart}
        >
            {!hideControls && <QuickActions item={item} />}
            {!hideControls && <SelectionIndicator isSelected={isSelected} />}
            <PinIndicator isPinned={item.is_pinned} />

            <h3 className="card-title" title={item.title || content.title || domain || 'Untitled Link'}>
                {item.title || content.title || domain || 'Untitled Link'}
            </h3>

            {content.image && (
                <div className="card-link-image" style={{ height: 120, margin: '8px 0', overflow: 'hidden', borderRadius: 4 }}>
                    <img src={content.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
            )}

            {content.description && (
                <div className="card-link-description" style={{ fontSize: '0.8rem', color: '#6B7280', marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {sanitizeString(content.description)}
                </div>
            )}

            {content.url ? (
                <a
                    href={content.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card-content"
                    style={{
                        color: '#1D4ED8',
                        textDecoration: 'underline',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.85rem'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {content.url}
                </a>
            ) : (
                <div className="card-content error" style={{ color: '#EF4444', fontSize: '0.85rem' }}>
                    <AlertTriangle size={12} style={{ display: 'inline', marginRight: 4 }} />
                    Missing URL
                </div>
            )}

            <TagsDisplay tags={item.tags} />
            <DateTimeIndicator item={item} />

            <div className="card-meta">
                <span className="type-indicator link" title="Link" />
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {content.favicon && <img src={content.favicon} alt="" style={{ width: 14, height: 14 }} />}
                    {domain && (
                        <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                            {domain}
                        </span>
                    )}
                </div>
                <span className="relative-time" style={{ marginLeft: 8 }}>{getRelativeTime(item.updated_at)}</span>
            </div>
        </div>
    );
}

// Image Card Component
interface ImageCardProps extends CardEventProps {
    item: Item;
}

function SecureImage({ path, alt, style }: { path: string; alt: string; style?: React.CSSProperties }) {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        if (!path) return;
        // Don't try to sign public URLs or local blob URLs
        if (path.startsWith('http') || path.startsWith('blob:')) {
            setSrc(path);
            return;
        }

        let isMounted = true;

        // Fetch signed URL
        supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600)
            .then(({ data }) => {
                if (isMounted && data?.signedUrl) {
                    setSrc(data.signedUrl);
                } else {
                    // Fallback
                    const { data: publicData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
                    if (isMounted) setSrc(publicData.publicUrl);
                }
            });

        return () => { isMounted = false; };
    }, [path]);

    // FIX: Render logic handles the case where path is already http
    const effectiveSrc = (path && path.startsWith('http')) ? path : src;

    if (!effectiveSrc) return <div style={{ ...style, background: '#f5f5f5' }} />;
    return <img src={effectiveSrc} alt={alt} style={style} />;
}

function ImageCard({ item, isSelected, isCut, onClick, onDoubleClick, onContextMenu, onDragStart, hideControls }: ImageCardProps) {
    const fileMeta = item.file_meta as FileMeta | null;
    const fileSize = fileMeta ? formatFileSize(fileMeta.size) : '';
    const imagePath = fileMeta?.path;

    // Clean up title - remove hash prefixes and show readable name
    const cleanTitle = (() => {
        const title = item.title || 'Untitled Image';
        // If title looks like a hash filename (e.g., "original-abc123def456.webp"), show just extension
        if (title.match(/^(original|temp|upload|image)-[a-f0-9]{20,}\.[a-z]+$/i)) {
            const ext = title.split('.').pop()?.toUpperCase() || 'IMAGE';
            return `${ext} Image`;
        }
        // If title is too long, truncate
        if (title.length > 30) {
            return title.substring(0, 27) + '...';
        }
        return title;
    })();

    return (
        <div
            className={`card card-image ${isSelected ? 'selected' : ''} ${isCut ? 'cut' : ''}`}
            style={{ backgroundColor: item.bg_color !== '#FFFFFF' ? item.bg_color : undefined }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}

            draggable
            onDragStart={onDragStart}
        >
            {!hideControls && <QuickActions item={item} />}
            {!hideControls && <SelectionIndicator isSelected={isSelected} />}
            <PinIndicator isPinned={item.is_pinned} />

            <div
                className="card-image-preview"
                style={{
                    height: 120,
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

            <div className="card-meta">
                <span className="type-indicator image" title="Image" />
                {fileSize && (
                    <span style={{ fontSize: '0.75rem', color: '#6B7280', marginLeft: 'auto' }}>
                        {fileSize}
                    </span>
                )}
                <span className="relative-time">{getRelativeTime(item.updated_at)}</span>
            </div>
        </div>
    );
}

// Folder Card Component
interface FolderCardProps extends CardEventProps {
    item: Item;
}

function FolderCard({ item, isSelected, isCut, onClick, onDoubleClick, onContextMenu, onDragStart, hideControls }: FolderCardProps) {
    const content = item.content as FolderContent;
    // Get dynamic item count from store - count items that have this folder as parent
    const allItems = useAppStore((state) => state.items);
    const dynamicItemCount = allItems.filter(i => i.folder_id === item.id && !i.deleted_at).length;

    return (
        <div
            className={`card ${isSelected ? 'selected' : ''} ${isCut ? 'cut' : ''}`}
            style={{ backgroundColor: item.bg_color !== '#FFFFFF' ? item.bg_color : '#FFFBEB' }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}

            draggable
            onDragStart={onDragStart}
        >
            {!hideControls && <QuickActions item={item} />}
            {!hideControls && <SelectionIndicator isSelected={isSelected} />}
            <PinIndicator isPinned={item.is_pinned} />

            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 12,
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

            <div className="card-meta">
                <span className="type-indicator folder" title="Folder" />
                <span className="relative-time">{getRelativeTime(item.updated_at)}</span>
            </div>
        </div>
    );
}
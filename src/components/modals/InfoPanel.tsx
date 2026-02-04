import { useState } from 'react';
import {
    X,
    Calendar,
    Clock,
    Folder,
    Flag,
    Palette,
    StickyNote,
    Link2,
    FileText,
    Image,
    FolderClosed,
    Pin,
    Trash2
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { NoteContent, LinkContent, FileMeta, FolderContent, CardColor, PriorityLevel } from '../../lib/types';
import { CARD_COLORS } from '../../lib/types';
import { formatFileSize, formatDate, formatTime } from '../../lib/utils';

const TYPE_ICONS = {
    note: StickyNote,
    link: Link2,
    file: FileText,
    image: Image,
    folder: FolderClosed,
};

const TYPE_COLORS = {
    note: { bg: '#FFFBEB', color: '#D97706', border: '#FCD34D' },
    link: { bg: '#FFF7ED', color: '#EA580C', border: '#FDBA74' },
    file: { bg: '#F5F3FF', color: '#7C3AED', border: '#C4B5FD' },
    image: { bg: '#EFF6FF', color: '#2563EB', border: '#93C5FD' },
    folder: { bg: '#FFFBEB', color: '#D97706', border: '#FCD34D' },
};

export function InfoPanel() {
    const { infoPanelItem, closeInfoPanel, updateItem, deleteItem, toggleItemPin } = useAppStore();
    const [title, setTitle] = useState(infoPanelItem?.title || '');
    const [isEditing, setIsEditing] = useState(false);
    const [lastItemId, setLastItemId] = useState<string | null>(null);

    // Sync title when the ITEM CHANGES (Render-time update)
    const currentId = infoPanelItem?.id ?? null;
    if (currentId !== lastItemId) {
        setLastItemId(currentId);
        if (infoPanelItem) {
            setTitle(infoPanelItem.title);
            setIsEditing(false);
        }
    }

    if (!infoPanelItem) return null;

    const item = infoPanelItem;
    const TypeIcon = TYPE_ICONS[item.type];
    const typeStyle = TYPE_COLORS[item.type];

    const handleTitleSave = () => {
        if (title.trim() && title !== item.title) {
            updateItem(item.id, { title: title.trim() });
        }
        setIsEditing(false);
    };

    const handlePriorityChange = (priority: PriorityLevel) => {
        updateItem(item.id, { priority });
    };

    const handleColorChange = (color: CardColor) => {
        updateItem(item.id, { bg_color: CARD_COLORS[color] });
    };

    const handleDelete = () => {
        deleteItem(item.id);
        closeInfoPanel();
    };

    const handleTogglePin = () => {
        toggleItemPin(item.id);
    };

    // Get content-specific info
    const getContentDetails = () => {
        switch (item.type) {
            case 'note': {
                const content = item.content as NoteContent;
                const hasChecklist = content.checklist && content.checklist.length > 0;
                const completed = content.checklist?.filter(i => i.checked).length || 0;
                const total = content.checklist?.length || 0;
                return hasChecklist
                    ? `Checklist: ${completed}/${total} completed`
                    : content.text
                        ? `${content.text.length} characters`
                        : 'Empty note';
            }
            case 'link': {
                const content = item.content as LinkContent;
                return content.url || 'No URL';
            }
            case 'file':
            case 'image': {
                const meta = item.file_meta as FileMeta | null;
                return meta ? formatFileSize(meta.size) : 'No file info';
            }
            case 'folder': {
                const content = item.content as FolderContent;
                return `${content.itemCount || 0} items`;
            }
            default:
                return '';
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div className="info-panel-backdrop" onClick={closeInfoPanel} />

            {/* Panel */}
            <div className="info-panel">
                {/* Header */}
                <div className="info-panel-header">
                    <h2 className="info-panel-title">Info</h2>
                    <button className="info-panel-close" onClick={closeInfoPanel}>
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="info-panel-content">
                    {/* Type Badge */}
                    <div className="info-section">
                        <div
                            className="info-type-badge"
                            style={{
                                background: typeStyle.bg,
                                color: typeStyle.color,
                                border: `2px solid ${typeStyle.border}`,
                            }}
                        >
                            <TypeIcon size={20} />
                            <span>{item.type.charAt(0).toUpperCase() + item.type.slice(1)}</span>
                        </div>
                    </div>

                    {/* Title */}
                    <div className="info-section">
                        <label className="info-label">Name</label>
                        {isEditing ? (
                            <input
                                key={item.id}
                                type="text"
                                className="info-input"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                onBlur={handleTitleSave}
                                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                autoFocus
                            />
                        ) : (
                            <div
                                className="info-value editable"
                                onClick={() => setIsEditing(true)}
                            >
                                {item.title}
                            </div>
                        )}
                    </div>

                    {/* Content Details */}
                    <div className="info-section">
                        <label className="info-label">Details</label>
                        <div className="info-value">{getContentDetails()}</div>
                    </div>

                    {/* Link URL (for links) */}
                    {item.type === 'link' && (
                        <div className="info-section">
                            <label className="info-label">URL</label>
                            <a
                                href={(item.content as LinkContent).url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="info-link"
                            >
                                {(item.content as LinkContent).url}
                            </a>
                        </div>
                    )}

                    {/* Priority */}
                    <div className="info-section">
                        <label className="info-label">
                            <Flag size={14} />
                            Priority
                        </label>
                        <div className="info-priority-options">
                            {(['none', 'low', 'medium', 'high'] as PriorityLevel[]).map((p) => (
                                <button
                                    key={p}
                                    className={`info-priority-btn ${item.priority === p ? 'active' : ''}`}
                                    data-priority={p}
                                    onClick={() => handlePriorityChange(p)}
                                >
                                    {p.charAt(0).toUpperCase() + p.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Color */}
                    <div className="info-section">
                        <label className="info-label">
                            <Palette size={14} />
                            Color
                        </label>
                        <div className="info-color-options">
                            {(Object.keys(CARD_COLORS) as CardColor[]).map((color) => (
                                <button
                                    key={color}
                                    className={`info-color-btn ${item.bg_color === CARD_COLORS[color] ? 'active' : ''}`}
                                    style={{ backgroundColor: CARD_COLORS[color] }}
                                    onClick={() => handleColorChange(color)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="info-section">
                        <label className="info-label">
                            <Calendar size={14} />
                            Created
                        </label>
                        <div className="info-value">
                            {formatDate(item.created_at)} at {formatTime(item.created_at)}
                        </div>
                    </div>

                    <div className="info-section">
                        <label className="info-label">
                            <Clock size={14} />
                            Modified
                        </label>
                        <div className="info-value">
                            {formatDate(item.updated_at)} at {formatTime(item.updated_at)}
                        </div>
                    </div>

                    {/* Due Date (if set) */}
                    {item.scheduled_at && (
                        <div className="info-section">
                            <label className="info-label">
                                <Calendar size={14} />
                                Scheduled
                            </label>
                            <div className="info-value">
                                {formatDate(item.scheduled_at)} at {formatTime(item.scheduled_at)}
                            </div>
                        </div>
                    )}

                    {/* Location */}
                    <div className="info-section">
                        <label className="info-label">
                            <Folder size={14} />
                            Location
                        </label>
                        <div className="info-value">
                            {item.folder_id ? 'In folder' : 'Root'}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="info-panel-footer">
                    <button
                        className={`info-action-btn ${item.is_pinned ? 'active' : ''}`}
                        onClick={handleTogglePin}
                    >
                        <Pin size={16} />
                        {item.is_pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button className="info-action-btn danger" onClick={handleDelete}>
                        <Trash2 size={16} />
                        Move to Trash
                    </button>
                </div>
            </div>
        </>
    );
}

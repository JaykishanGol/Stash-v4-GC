import { useState, useEffect, useMemo, useRef } from 'react';
import {
    X,
    StickyNote,
    Link2,
    FileText,
    Image,
    FolderPlus,
    Plus,
    Calendar,
    Loader2,
    ListChecks,
    Check
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { Item, ChecklistItem, CardColor, NoteContent } from '../../lib/types';
import { CARD_COLORS, getColorKey } from '../../lib/types';
import { generateId, isValidUrl, htmlToPlainText } from '../../lib/utils';
import { RichTextEditor } from '../editor/RichTextEditor';
import { ChecklistEditor } from '../editor/ChecklistEditor';
import { fetchLinkMetadata, type LinkMetadata } from '../../lib/fetchLinkMetadata';
import { SchedulerContent } from './SchedulerModal';
import { uploadFilesAsItems } from '../../lib/uploadUtils';

type TabType = 'note' | 'link' | 'file' | 'image' | 'folder';

const PRIORITY_COLORS = { high: '#EF4444', medium: '#F59E0B', low: '#10B981', none: '#9CA3AF' };

const TABS: { type: TabType; icon: React.ReactNode; label: string }[] = [
    { type: 'note', icon: <StickyNote size={18} />, label: 'Note' },
    { type: 'link', icon: <Link2 size={18} />, label: 'Link' },
    { type: 'file', icon: <FileText size={18} />, label: 'File' },
    { type: 'image', icon: <Image size={18} />, label: 'Image' },
    { type: 'folder', icon: <FolderPlus size={18} />, label: 'Folder' },
];

export function QuickAddModal() {
    const {
        isQuickAddOpen,
        closeQuickAdd,
        quickAddType,
        setQuickAddType,
        addItem,
        editingItem,
        updateItem,
        user,
        addUpload,
        updateUploadProgress,
        completeUpload,
        selectedFolderId,
        openScheduler
    } = useAppStore();

    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
    const [isChecklistMode, setIsChecklistMode] = useState(false);

    const [url, setUrl] = useState('');
    const [selectedColor, setSelectedColor] = useState<CardColor>('yellow');
    const [priority, setPriority] = useState<'none' | 'low' | 'medium' | 'high'>('none');
    const [dueDate, setDueDate] = useState('');
    const [reminderDate, setReminderDate] = useState('');
    const [, setShowDatePicker] = useState(false);
    const [, setShowReminderPicker] = useState(false);
    const [folderDescription, setFolderDescription] = useState('');

    // Local Scheduler State
    const [isLocalSchedulerOpen, setIsLocalSchedulerOpen] = useState(false);
    const [schedulerUpdates, setSchedulerUpdates] = useState<Partial<Item>>({});

    // Link metadata state
    const [linkMetadata, setLinkMetadata] = useState<LinkMetadata | null>(null);
    const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Reset form when modal opens/closes or type changes
    useEffect(() => {
        if (isQuickAddOpen) {
            if (editingItem) {
                // Populate form with existing item data
                setTitle(editingItem.title);
                setSelectedColor(getColorKey(editingItem.bg_color));
                setPriority(editingItem.priority);
                if (editingItem.scheduled_at) {
                    setDueDate(editingItem.scheduled_at.split('T')[0]);
                }
                if (editingItem.type === 'note') {
                    const noteContent = editingItem.content as NoteContent;

                    // Determine mode based on content
                    if (noteContent.checklist && Array.isArray(noteContent.checklist) && noteContent.checklist.length > 0) {
                        setIsChecklistMode(true);
                        setChecklist(noteContent.checklist);
                        setContent(''); // Clear text content to avoid sync issues
                    } else {
                        setIsChecklistMode(false);
                        setContent(noteContent.text || '');
                        setChecklist([]);
                    }
                } else if (editingItem.type === 'link') {
                    const linkContent = editingItem.content as { url?: string };
                    setUrl(linkContent.url || '');
                } else if (editingItem.type === 'folder') {
                    const folderContent = editingItem.content as { description?: string };
                    setFolderDescription(folderContent.description || '');
                }
            } else {
                // Reset for new item
                setTitle('');
                setContent('');
                setChecklist([]);
                setIsChecklistMode(false);
                setUrl('');
                setSelectedColor('yellow');
                setPriority('none');
                setDueDate('');
                setReminderDate('');
                setFolderDescription('');
                setSchedulerUpdates({});
                setIsLocalSchedulerOpen(false);
            }
        }
    }, [isQuickAddOpen, quickAddType, editingItem]);

    // Auto-focus textarea
    useEffect(() => {
        if (isQuickAddOpen && textareaRef.current) {
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    }, [isQuickAddOpen, quickAddType]);

    // Auto-fetch link metadata when URL changes
    useEffect(() => {
        if (quickAddType !== 'link' || !url || !isValidUrl(url)) {
            setLinkMetadata(null);
            return;
        }

        const timeoutId = setTimeout(async () => {
            setIsLoadingMetadata(true);
            try {
                const metadata = await fetchLinkMetadata(url);
                if (metadata) {
                    setLinkMetadata(metadata);
                    // Auto-fill title if empty
                    if (!title && metadata.title) {
                        setTitle(metadata.title);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch metadata:', error);
            } finally {
                setIsLoadingMetadata(false);
            }
        }, 500); // Debounce 500ms

        return () => clearTimeout(timeoutId);
    }, [url, quickAddType, title]);

    const handleClose = () => {
        closeQuickAdd();
        setTitle('');
        setContent('');
        setChecklist([]);
        setIsChecklistMode(false);
        setUrl('');
        setShowDatePicker(false);
        setShowReminderPicker(false);
        setFolderDescription('');
        setLinkMetadata(null);
        setIsLoadingMetadata(false);
    };

    // Toggle logic: Text <-> Checklist
    const toggleChecklistMode = () => {
        if (isChecklistMode) {
            // Converting List -> Text
            // Better HTML conversion
            const htmlContent = checklist.map(item => `<p>${item.text}</p>`).join('');

            setContent(htmlContent);
            setChecklist([]);
            setIsChecklistMode(false);
        } else {
            // Converting Text -> List
            const plainText = htmlToPlainText(content);
            const lines = plainText.split('\n').filter(line => line.trim() !== '');

            const newChecklist = lines.length > 0
                ? lines.map(line => ({ id: generateId(), text: line, checked: false }))
                : [{ id: generateId(), text: '', checked: false }];

            setChecklist(newChecklist);
            setContent('');
            setIsChecklistMode(true);
        }
    };

    const handleSubmit = () => {
        if (editingItem) {
            // Update existing item
            const updates: Partial<Item> = {
                title: title || 'Untitled',
                bg_color: CARD_COLORS[selectedColor],
                priority,
                scheduled_at: dueDate ? new Date(dueDate).toISOString() : null,
            };

            if (quickAddType === 'note') {
                if (isChecklistMode) {
                    updates.content = { checklist };
                } else {
                    updates.content = { text: content };
                }
            } else if (quickAddType === 'link') {
                updates.content = {
                    url,
                    title: title || (linkMetadata?.title || 'Link'),
                    description: linkMetadata?.description,
                    imageUrl: linkMetadata?.image,
                    favicon: linkMetadata?.favicon,
                    siteName: linkMetadata?.siteName
                };
            } else if (quickAddType === 'folder') {
                updates.content = { description: folderDescription };
            }

            updateItem(editingItem.id, { ...updates, ...schedulerUpdates });
        } else {
            // Create new item
            const newItem: Item = {
                id: generateId(),
                user_id: user?.id || 'demo',
                folder_id: selectedFolderId || null,
                type: quickAddType,
                title: title || 'Untitled',
                content: {},
                file_meta: null,
                priority,
                tags: [],
                scheduled_at: dueDate ? new Date(dueDate).toISOString() : null,
                remind_before: reminderDate ? 60 : null, // Default 60 min if reminder set
                recurring_config: null,
                bg_color: CARD_COLORS[selectedColor],
                is_pinned: false,
                is_archived: false,
                is_completed: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                deleted_at: null,

                // Apply scheduler updates
                ...schedulerUpdates
            };

            // Set content based on type
            if (quickAddType === 'note') {
                if (isChecklistMode) {
                    newItem.content = { checklist };
                } else {
                    newItem.content = { text: content };
                }
            } else if (quickAddType === 'link') {
                newItem.content = {
                    url,
                    title: title || (linkMetadata?.title || 'Link'),
                    description: linkMetadata?.description,
                    imageUrl: linkMetadata?.image,
                    favicon: linkMetadata?.favicon,
                    siteName: linkMetadata?.siteName
                };
            } else if (quickAddType === 'folder') {
                newItem.content = { description: folderDescription, itemCount: 0 };
                newItem.bg_color = '#FFFBEB'; // Default folder color
            }

            addItem(newItem);
        }

        handleClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (
            quickAddType === 'note' &&
            (e.metaKey || e.ctrlKey) &&
            e.shiftKey &&
            e.key.toLowerCase() === 'k'
        ) {
            e.preventDefault();
            toggleChecklistMode();
            return;
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            handleSubmit();
        }
        if (e.key === 'Escape') {
            handleClose();
        }
    };

    const noteHasText = useMemo(() => htmlToPlainText(content).trim().length > 0, [content]);
    const checklistHasText = useMemo(
        () => checklist.some((item) => item.text.trim().length > 0),
        [checklist]
    );
    const showNoteEditorHint = quickAddType === 'note' && !noteHasText && !checklistHasText;

    if (!isQuickAddOpen) return null;

    return (
        <div className="modal-overlay active" onClick={handleClose} onKeyDown={handleKeyDown}>
            {/* Local Scheduler Overlay */}
            {isLocalSchedulerOpen && (
                <div className="modal-overlay active" style={{ zIndex: 1100 }} onClick={() => setIsLocalSchedulerOpen(false)}>
                    <div onClick={e => e.stopPropagation()}>
                        <SchedulerContent
                            item={{
                                id: 'draft',
                                title: title || 'New Item',
                                scheduled_at: dueDate ? new Date(dueDate).toISOString() : null,
                                ...schedulerUpdates
                            }}
                            isTaskType={false}
                            onClose={() => setIsLocalSchedulerOpen(false)}
                            onSave={(updates) => {
                                setSchedulerUpdates(prev => ({ ...prev, ...updates }));
                                // Also sync back basic fields to UI if updated
                                const nextScheduledAt =
                                    typeof updates.scheduled_at === 'string' ? updates.scheduled_at : null;
                                if (nextScheduledAt) {
                                    setDueDate(nextScheduledAt.split('T')[0]);
                                }
                                setIsLocalSchedulerOpen(false);
                            }}
                        />
                    </div>
                </div>
            )}

            <div
                className="modal modal-sidebar-layout"
                role="dialog"
                aria-modal="true"
                aria-label={editingItem ? 'Edit item' : 'Add new item'}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close Button (Desktop Only) */}
                <button className="modal-close-floating desktop-only" onClick={handleClose} aria-label="Close">
                    <X size={20} />
                </button>

                {/* Left Sidebar - Type Tabs (Desktop Only) */}
                <div className="modal-sidebar desktop-only">
                    <div className="sidebar-tabs">
                        {TABS.map((tab) => (
                            <button
                                key={tab.type}
                                className={`sidebar-tab ${quickAddType === tab.type ? 'active' : ''}`}
                                onClick={() => setQuickAddType(tab.type)}
                            >
                                {tab.icon}
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Content Area */}
                <div className="modal-content-area">
                    {/* Header */}
                    <div className="content-header">
                        {/* Mobile Cancel Button */}
                        <button className="mobile-only icon-btn" onClick={handleClose} style={{ marginRight: 16 }} aria-label="Cancel">
                            <X size={24} />
                        </button>

                        <h2 className="content-title">
                            {editingItem ? 'Edit' : 'New'} {quickAddType.charAt(0).toUpperCase() + quickAddType.slice(1)}
                        </h2>

                        {/* Mobile Save Button */}
                        <button className="mobile-only icon-btn save-btn" onClick={handleSubmit} style={{ color: 'var(--accent)', fontWeight: 'bold' }} aria-label="Save">
                            <Check size={28} />
                        </button>
                    </div>

                    {/* Mobile Type Selector (Horizontal Icons) */}
                    <div className="mobile-only mobile-type-selector">
                        {TABS.map((tab) => (
                            <button
                                key={tab.type}
                                className={`mobile-type-tab ${quickAddType === tab.type ? 'active' : ''}`}
                                onClick={() => setQuickAddType(tab.type)}
                            >
                                {tab.icon}
                            </button>
                        ))}
                    </div>

                    {/* Body */}
                    <div className="content-body">
                        {/* Title Input */}
                        <div className="note-title-input">
                            <input
                                type="text"
                                className="title-input"
                                placeholder={quickAddType === 'folder' ? 'Folder name...' : 'Title...'}
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>

                        {/* Note Type Content */}
                        {quickAddType === 'note' && (
                            <div className="input-wrapper rich-text-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                {showNoteEditorHint && (
                                    <p className="note-editor-hint">
                                        Use toolbar or <kbd>Cmd/Ctrl+Shift+K</kbd> for checklist.
                                    </p>
                                )}
                                {isChecklistMode ? (
                                    <>
                                        <div className="checklist-mode-row">
                                            <span className="checklist-mode-pill">Checklist</span>
                                            <button
                                                type="button"
                                                className="checklist-switch-btn"
                                                onClick={toggleChecklistMode}
                                                title="Switch to rich text (Ctrl/Cmd+Shift+K)"
                                                aria-label="Switch to rich text mode"
                                            >
                                                <ListChecks size={16} />
                                                <span>Rich text</span>
                                            </button>
                                        </div>
                                        <ChecklistEditor
                                            items={checklist}
                                            onChange={setChecklist}
                                            autoFocus={true}
                                        />
                                    </>
                                ) : (
                                    <RichTextEditor
                                        content={content}
                                        onChange={setContent}
                                        placeholder="Write your note..."
                                        autoFocus={true}
                                        showChecklistModeToggle={true}
                                        onToggleChecklistMode={toggleChecklistMode}
                                        isChecklistMode={isChecklistMode}
                                    />
                                )}
                            </div>
                        )
                        }

                        {/* Link Type Content */}
                        {
                            quickAddType === 'link' && (
                                <div className="input-wrapper" style={{ marginBottom: 12 }}>
                                    <input
                                        type="url"
                                        className="quick-add-input"
                                        style={{ minHeight: 'auto', padding: '12px 16px' }}
                                        placeholder="Paste URL here..."
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                    />
                                    {url && isValidUrl(url) && (
                                        <div className="url-preview" style={{ marginTop: 12 }}>
                                            {isLoadingMetadata ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, color: 'var(--text-muted)' }}>
                                                    <Loader2 size={16} className="animate-spin" />
                                                    <span>Fetching metadata...</span>
                                                </div>
                                            ) : (
                                                <div className="url-preview-card" style={{
                                                    border: '1px solid var(--border-light)',
                                                    borderRadius: 8,
                                                    overflow: 'hidden',
                                                    background: 'var(--bg-secondary)'
                                                }}>
                                                    {linkMetadata?.image && (
                                                        <div style={{ height: 120, overflow: 'hidden' }}>
                                                            <img src={linkMetadata.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        </div>
                                                    )}
                                                    <div style={{ padding: 12 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                            {linkMetadata?.favicon && <img src={linkMetadata.favicon} alt="" style={{ width: 16, height: 16 }} />}
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{linkMetadata?.siteName || 'Link'}</span>
                                                        </div>
                                                        <div className="url-preview-title" style={{ fontWeight: 600, marginBottom: 4 }}>
                                                            {title || linkMetadata?.title || 'Link'}
                                                        </div>
                                                        <div className="url-preview-url" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                                                            {url}
                                                        </div>
                                                        {linkMetadata?.description && (
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                                {linkMetadata.description}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        }

                        {/* File/Image Type Content */}
                        {
                            (quickAddType === 'file' || quickAddType === 'image') && (
                                <div
                                    className="upload-zone"
                                    style={{ marginBottom: 12 }}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept={quickAddType === 'image' ? 'image/*' : '*'}
                                        multiple
                                        style={{ display: 'none' }}
                                        onChange={async (e) => {
                                            const files = e.target.files;
                                            if (files && files.length > 0) {
                                                handleClose();
                                                uploadFilesAsItems(files, {
                                                    userId: user?.id || 'demo',
                                                    folderId: selectedFolderId || null,
                                                    addUpload, updateUploadProgress, completeUpload, addItem,
                                                });
                                            }
                                        }}
                                    />
                                    <div className="upload-icon">
                                        {quickAddType === 'image' ? <Image size={24} /> : <FileText size={24} />}
                                    </div>
                                    <p className="upload-text">
                                        Drop {quickAddType === 'image' ? 'images' : 'files'} or <span className="upload-highlight">click to browse</span>
                                    </p>
                                    <p className="upload-hint">Select multiple files at once</p>
                                </div>
                            )
                        }

                        {/* Folder Type Content - Simplified for mobile */}
                        {
                            quickAddType === 'folder' && (
                                <div className="input-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
                                    {/* Upload options */}
                                    <div style={{ display: 'flex', gap: 12 }}>
                                        {/* Upload Folder Zone */}
                                        <div
                                            className="upload-zone"
                                            style={{ marginTop: 0, flex: 1 }}
                                            onClick={() => {
                                                const input = document.createElement('input');
                                                input.type = 'file';
                                                input.setAttribute('webkitdirectory', '');
                                                input.setAttribute('directory', '');
                                                input.onchange = async (e) => {
                                                    const files = (e.target as HTMLInputElement).files;
                                                    if (files && files.length > 0) {
                                                        handleClose();

                                                        // 1. Create Root Folder
                                                        const rootFolderName = files[0].webkitRelativePath.split('/')[0] || 'New Folder';
                                                        const folderId = generateId();

                                                        const newFolderItem: Item = {
                                                            id: folderId,
                                                            user_id: user?.id || 'demo',
                                                            folder_id: selectedFolderId || null,
                                                            type: 'folder',
                                                            title: rootFolderName,
                                                            content: {
                                                                itemCount: files.length,
                                                                description: folderDescription
                                                            },
                                                            file_meta: null,
                                                            priority: 'none',
                                                            tags: [],
                                                            scheduled_at: null,
                                                            remind_before: null,
                                                            recurring_config: null,
                                                            bg_color: '#FFFBEB',
                                                            is_pinned: false,
                                                            is_archived: false,
                                                            is_completed: false,
                                                            created_at: new Date().toISOString(),
                                                            updated_at: new Date().toISOString(),
                                                            deleted_at: null,
                                                        };

                                                        addItem(newFolderItem);

                                                        // 2. Upload Files into this Folder
                                                        uploadFilesAsItems(files, {
                                                            userId: user?.id || 'demo',
                                                            folderId,
                                                            addUpload, updateUploadProgress, completeUpload, addItem,
                                                        });
                                                    }
                                                };
                                                input.click();
                                            }}
                                        >
                                            <div className="upload-icon">
                                                <FolderPlus size={24} />
                                            </div>
                                            <p className="upload-text">
                                                Upload <span className="upload-highlight">Folder</span>
                                            </p>
                                        </div>

                                        {/* Upload Files Zone */}
                                        <div
                                            className="upload-zone"
                                            style={{ marginTop: 0, flex: 1 }}
                                            onClick={() => {
                                                const input = document.createElement('input');
                                                input.type = 'file';
                                                input.multiple = true;
                                                input.onchange = async (e) => {
                                                    const files = (e.target as HTMLInputElement).files;
                                                    if (files && files.length > 0) {
                                                        handleClose();
                                                        uploadFilesAsItems(files, {
                                                            userId: user?.id || 'demo',
                                                            folderId: selectedFolderId || null,
                                                            addUpload, updateUploadProgress, completeUpload, addItem,
                                                        });
                                                    }
                                                };
                                                input.click();
                                            }}
                                        >
                                            <div className="upload-icon">
                                                <FileText size={24} />
                                            </div>
                                            <p className="upload-text">
                                                Upload <span className="upload-highlight">Files</span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )
                        }

                    </div>

                    {/* Options Panel */}
                    <div className="options-panel">
                        {/* Color Picker */}
                        <div className="color-picker-section">
                            <span className="color-picker-label">Color</span>
                            <div className="color-picker-options">
                                {(Object.keys(CARD_COLORS) as CardColor[]).map((color) => (
                                    <button
                                        key={color}
                                        className={`color-option ${selectedColor === color ? 'active' : ''}`}
                                        data-color={color}
                                        style={{ backgroundColor: CARD_COLORS[color] }}
                                        onClick={() => setSelectedColor(color)}
                                        title={color.charAt(0).toUpperCase() + color.slice(1)}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Priority & Schedule Row - Now shown for ALL types including folder */}
                        <div className="mobile-options-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, paddingTop: 4 }}>
                            <div className="priority-section" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span className="priority-label" style={{ marginRight: 0 }}>Priority</span>
                                <div className="priority-options" style={{ display: 'flex', gap: 8 }}>
                                    {(['high', 'medium', 'low', 'none'] as const).map((p) => (
                                        <button
                                            key={p}
                                            className={`priority-circle ${priority === p ? 'active' : ''}`}
                                            onClick={() => setPriority(p)}
                                            title={p.charAt(0).toUpperCase() + p.slice(1)}
                                            style={{
                                                width: 28,
                                                height: 28,
                                                borderRadius: '50%',
                                                backgroundColor: PRIORITY_COLORS[p],
                                                border: '2px solid transparent',
                                                cursor: 'pointer',
                                                boxShadow: priority === p ? `0 0 0 2px white, 0 0 0 4px ${PRIORITY_COLORS[p]}` : 'none',
                                                transition: 'all 0.15s ease',
                                                opacity: priority === p ? 1 : 0.3
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Vertical Divider */}
                            <div style={{ width: 1, height: 24, background: 'var(--border-light)', margin: '0 8px' }} />

                            {/* Schedule Button (Pill) */}
                            <div className="quick-options">
                                <button
                                    className="quick-option-btn"
                                    onClick={() => {
                                        if (editingItem) {
                                            closeQuickAdd();
                                            openScheduler(editingItem.id);
                                        } else {
                                            setIsLocalSchedulerOpen(true);
                                        }
                                    }}
                                    title="Schedule"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        height: 28, /* Match circle size */
                                        borderRadius: 14,
                                        background: (dueDate || reminderDate) ? 'var(--accent-light)' : '#F3F4F6',
                                        color: (dueDate || reminderDate) ? 'var(--accent)' : 'var(--text-secondary)',
                                        border: '1px solid transparent',
                                        padding: '0 12px',
                                        gap: 6,
                                        fontSize: '0.8rem',
                                        fontWeight: 500
                                    }}
                                >
                                    <Calendar size={14} />
                                    <span>Schedule</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="content-footer">
                        <span className="modal-hint">
                            <kbd>⌘</kbd> + <kbd>Enter</kbd> to save
                        </span>
                        <button className="btn-add" onClick={handleSubmit}>
                            <Plus size={18} />
                            {editingItem ? 'Save' : quickAddType === 'folder' ? 'Create Folder' : 'Add'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

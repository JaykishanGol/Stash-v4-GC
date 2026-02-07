import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Trash2,
    Pin,
    FolderInput,
    Palette,
    ExternalLink,
    FolderPlus,
    Copy,
    Scissors,
    Clipboard,
    Download,
    Eye,
    FolderOpen,
    ChevronRight,
    Star,
    Info,
    StickyNote,
    Link2,
    RefreshCw,
    ListTodo,
    Plus,
    Calendar,
    Archive,
    X
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { CARD_COLORS, FOLDERS_ROOT_ID } from '../../lib/types';
import type { Item } from '../../lib/types';
import { generateId } from '../../lib/utils';

// Color palette for inline picker
const COLORS = [
    { name: 'yellow', value: CARD_COLORS.yellow },
    { name: 'coral', value: CARD_COLORS.coral },
    { name: 'blue', value: CARD_COLORS.blue },
    { name: 'pink', value: CARD_COLORS.pink },
    { name: 'green', value: CARD_COLORS.green },
    { name: 'purple', value: CARD_COLORS.purple },
    { name: 'teal', value: CARD_COLORS.teal },
    { name: 'default', value: CARD_COLORS.default },
];

// Priority options
const PRIORITIES = [
    { value: 'none', color: '#9CA3AF', label: 'None' },
    { value: 'low', color: '#10B981', label: 'Low' },
    { value: 'medium', color: '#F59E0B', label: 'Medium' },
    { value: 'high', color: '#EF4444', label: 'High' },
];

export function ContextMenu() {
    const {
        contextMenu,
        closeContextMenu,
        moveItemsToTrash,
        moveItems,
        updateItem,
        items,
        addItem,
        openQuickAdd,
        clipboard,
        setClipboard,
        setPreviewingItem,
        setEditingItem,
        openInfoPanel,
        selectedFolderId,
        selectedListId,
        activeView,
        user,
        calculateStats,
        selectedItemIds,
        tasks,
        addItemsToTask,
        addTask,
        openScheduler,
        lists,
        setEditingList,
        setDeletingList,
        removeItemsFromList
    } = useAppStore();

    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                closeContextMenu();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeContextMenu();
        };

        if (contextMenu.isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [contextMenu.isOpen, closeContextMenu]);

    if (!contextMenu.isOpen) return null;

    // Suppress context menu in multi-select mode (2+ items selected)
    // Use bulk actions bar instead (industry standard: Apple Files, Google Drive, etc.)
    if (selectedItemIds.length > 1) {
        closeContextMenu();
        return null;
    }

    // Handle List Context Menu
    if (contextMenu.type === 'list') {
        const list = lists.find(l => l.id === contextMenu.itemId);
        if (!list) return null;

        const handleEditList = () => {
            setEditingList(list);
            closeContextMenu();
        };

        const handleDeleteList = () => {
            setDeletingList(list);
            closeContextMenu();
        };

        const style: React.CSSProperties = {
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 9999,
        };

        return createPortal(
            <div ref={menuRef} className="ctx-menu" role="menu" style={style}>
                <div className="ctx-header">
                    <span className="ctx-title">{list.name}</span>
                    <span className="ctx-type">LIST</span>
                </div>
                <div className="ctx-divider" />
                <button className="ctx-item" onClick={handleEditList}>
                    <Palette size={16} />
                    <span>Edit List</span>
                </button>
                <div className="ctx-divider" />
                <button className="ctx-item ctx-danger" onClick={handleDeleteList}>
                    <Trash2 size={16} />
                    <span>Delete List</span>
                </button>
            </div>,
            document.body
        );
    }

    const item = contextMenu.itemId ? items.find(i => i.id === contextMenu.itemId) : null;
    const task = !item && contextMenu.itemId ? tasks.find(t => t.id === contextMenu.itemId) : null;
    const hasClipboard = clipboard.items.length > 0;

    // Get available folders
    const availableFolders = items.filter(i =>
        i.type === 'folder' &&
        !i.deleted_at &&
        i.id !== item?.id
    );

    // ============ ACTION HANDLERS ============

    const handleNewNote = () => {
        closeContextMenu();
        openQuickAdd('note');
    };

    const handleNewLink = () => {
        closeContextMenu();
        openQuickAdd('link');
    };

    const handleNewFolder = () => {
        // Create folder directly without modal
        const newFolder: Item = {
            id: generateId(),
            user_id: user?.id || 'demo',
            folder_id: selectedFolderId || null,
            type: 'folder' as const,
            title: 'New Folder',
            content: { description: '', itemCount: 0 },
            file_meta: null,
            priority: 'none' as const,
            tags: [],
            scheduled_at: null,
            remind_before: null,
            recurring_config: null,
            bg_color: '#FFFBEB',
            is_pinned: false,
            is_completed: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: null,
            is_archived: false,
        };
        addItem(newFolder);
        calculateStats();
        closeContextMenu();
    };

    const handlePaste = () => {
        if (!hasClipboard) return;
        // Determine target folder based on context:
        // - If in folders view without a selected folder, use FOLDERS_ROOT_ID
        // - If a folder is selected, use that
        // - Otherwise, keep in current section (null)
        let targetFolderId: string | null = null;
        if (selectedFolderId) {
            targetFolderId = selectedFolderId;
        } else if (activeView === 'folders') {
            targetFolderId = FOLDERS_ROOT_ID;
        }

        clipboard.items.forEach(clipItem => {
            if (clipboard.operation === 'cut') {
                updateItem(clipItem.id, { folder_id: targetFolderId });
            } else {
                const newItem = {
                    ...clipItem,
                    id: generateId(),
                    title: `${clipItem.title} (copy)`,
                    folder_id: targetFolderId,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                addItem(newItem);
            }
        });

        if (clipboard.operation === 'cut') {
            setClipboard({ items: [], operation: null });
        }
        closeContextMenu();
    };

    const handleRefresh = () => {
        calculateStats();
        closeContextMenu();
    };

    // Item-specific handlers
    const handleOpen = () => {
        if (task) {
            useAppStore.getState().setActiveView('tasks');
            closeContextMenu();
            return;
        }
        if (!item) return;
        if (item.type === 'image' || item.type === 'file') {
            setPreviewingItem(item);
        } else if (item.type === 'note') {
            setEditingItem(item);
        } else if (item.type === 'link') {
            const url = (item.content as any)?.url;
            if (url && /^https?:\/\//i.test(url)) {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        } else if (item.type === 'folder') {
            useAppStore.getState().setSelectedFolder(item.id);
        }
        closeContextMenu();
    };

    const handleDownload = async () => {
        if (!item || !item.file_meta) return;
        const { downloadFile } = await import('../../lib/supabase');
        const blob = await downloadFile(item.file_meta.path);
        if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = item.title || 'download';
            a.click();
            URL.revokeObjectURL(url);
        }
        closeContextMenu();
    };

    const handleCut = () => {
        if (!item) return;
        // If item is part of multi-selection, cut all selected items
        const itemsToClip = selectedItemIds.includes(item.id) && selectedItemIds.length > 1
            ? items.filter(i => selectedItemIds.includes(i.id))
            : [item];
        setClipboard({ items: itemsToClip, operation: 'cut' });
        closeContextMenu();
    };

    const handleCopy = () => {
        if (!item) return;
        // If item is part of multi-selection, copy all selected items
        const itemsToClip = selectedItemIds.includes(item.id) && selectedItemIds.length > 1
            ? items.filter(i => selectedItemIds.includes(i.id))
            : [item];
        setClipboard({ items: itemsToClip, operation: 'copy' });
        closeContextMenu();
    };

    const handleMoveToFolder = (folderId: string | null) => {
        if (!item) return;

        const itemsToMove = selectedItemIds.includes(item.id) && selectedItemIds.length > 1
            ? selectedItemIds
            : [item.id];

        moveItems(itemsToMove, folderId);
        closeContextMenu();
    };
    const handlePin = () => {
        if (!item) return;
        updateItem(item.id, { is_pinned: !item.is_pinned });
        closeContextMenu();
    };

    const handleColorChange = (color: string) => {
        if (task) {
            useAppStore.getState().updateTask(task.id, { color });
            return;
        }
        if (!item) return;
        updateItem(item.id, { bg_color: color });
        // Don't close - allow multiple color picks
    };

    const handlePriorityChange = (priority: 'none' | 'low' | 'medium' | 'high') => {
        if (task) {
            useAppStore.getState().updateTask(task.id, { priority });
            return;
        }
        if (!item) return;
        updateItem(item.id, { priority });
        // Don't close - allow comparing priorities
    };

    const handleShowInfo = () => {
        if (!item) return;
        openInfoPanel(item);
        closeContextMenu();
    };

    const handleDelete = () => {
        if (task) {
            useAppStore.getState().deleteTask(task.id);
            closeContextMenu();
            return;
        }
        if (!item) return;
        moveItemsToTrash([item.id]);
        closeContextMenu();
    };

    const handleSchedule = () => {
        const id = task?.id || item?.id;
        if (!id) return;
        openScheduler(id);
        closeContextMenu();
    };

    // ============ POSITIONING ============
    const menuWidth = 280;
    const menuHeight = (item || task) ? 520 : 200;

    // Viewport bounds
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

    // Calculate position
    let top = contextMenu.y;
    let left = contextMenu.x;

    // Flip if overflowing right/bottom
    if (left + menuWidth > vw) {
        left = vw - menuWidth - 10;
    }
    if (top + menuHeight > vh) {
        top = vh - menuHeight - 10;
    }

    const style: React.CSSProperties = {
        position: 'fixed',
        top,
        left,
        zIndex: 9999,
    };

    // ============ RENDER ============
    return createPortal(
        <div ref={menuRef} className="ctx-menu" role="menu" style={style}>
            {item || task ? (
                // ============ ITEM/TASK CONTEXT MENU ============
                <>
                    {/* Header */}
                    <div className="ctx-header">
                        <span className="ctx-title">{(item || task)!.title}</span>
                        <span className="ctx-type">{item ? item.type.toUpperCase() : 'TASK'}</span>
                    </div>

                    <div className="ctx-divider" />

                    {/* Open */}
                    <button className="ctx-item" onClick={handleOpen}>
                        {item?.type === 'link' ? <ExternalLink size={16} /> : <Eye size={16} />}
                        <span>{item?.type === 'link' ? 'Open Link' : item?.type === 'folder' ? 'Open Folder' : task ? 'Go to Tasks' : 'Open'}</span>
                    </button>

                    {item && (item.type === 'file' || item.type === 'image') && (
                        <button className="ctx-item" onClick={handleDownload}>
                            <Download size={16} />
                            <span>Download</span>
                        </button>
                    )}



                    <button className="ctx-item" onClick={handleSchedule}>
                        <Calendar size={16} />
                        <span>Schedule</span>
                    </button>

                    <div className="ctx-divider" />

                    {/* Organize Section */}
                    {item && <div className="ctx-section">ORGANIZE</div>}

                    {item && (
                        <>
                            <button className="ctx-item" onClick={handleCut}>
                                <Scissors size={16} />
                                <span>Cut</span>
                                <span className="ctx-shortcut">Ctrl+X</span>
                            </button>

                            <button className="ctx-item" onClick={handleCopy}>
                                <Copy size={16} />
                                <span>Copy</span>
                                <span className="ctx-shortcut">Ctrl+C</span>
                            </button>

                            {/* Move to - with submenu */}
                            <div className="ctx-submenu-wrapper">
                                <button className="ctx-item ctx-has-submenu">
                                    <FolderInput size={16} />
                                    <span>Move to</span>
                                    <span className="ctx-current">{item.folder_id === FOLDERS_ROOT_ID ? 'Folders' : item.folder_id ? availableFolders.find(f => f.id === item.folder_id)?.title || 'Folder' : 'Root'}</span>
                                    <ChevronRight size={14} className="ctx-arrow" />
                                </button>
                                <div className="ctx-submenu" style={{ [(vw - contextMenu.x) < 500 ? 'right' : 'left']: '100%' }}>
                                    <div className="ctx-submenu-header">Move to</div>
                                    <button
                                        className={`ctx-submenu-item ${!item.folder_id ? 'active' : ''}`}
                                        onClick={() => handleMoveToFolder(null)}
                                    >
                                        <FolderOpen size={14} />
                                        <span>Keep in Section</span>
                                    </button>
                                    <button
                                        className={`ctx-submenu-item ${item.folder_id === FOLDERS_ROOT_ID ? 'active' : ''}`}
                                        onClick={() => handleMoveToFolder(FOLDERS_ROOT_ID)}
                                    >
                                        <FolderOpen size={14} style={{ color: '#F59E0B' }} />
                                        <span>Folders Section</span>
                                    </button>
                                    {availableFolders.length > 0 && <div className="ctx-submenu-divider" />}
                                    {availableFolders.map(folder => (
                                        <button
                                            key={folder.id}
                                            className={`ctx-submenu-item ${item.folder_id === folder.id ? 'active' : ''}`}
                                            onClick={() => handleMoveToFolder(folder.id)}
                                        >
                                            <FolderOpen size={14} style={{ color: folder.bg_color }} />
                                            <span>{folder.title}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Add to Task - with submenu */}
                            <div className="ctx-submenu-wrapper">
                                <button className="ctx-item ctx-has-submenu">
                                    <ListTodo size={16} />
                                    <span>Add to Task</span>
                                    <ChevronRight size={14} className="ctx-arrow" />
                                </button>
                                <div className="ctx-submenu" style={{ [(vw - contextMenu.x) < 500 ? 'right' : 'left']: '100%' }}>
                                    <div className="ctx-submenu-header">Add to Task</div>
                                    <button
                                        className="ctx-submenu-item ctx-new-task"
                                        onClick={() => {
                                            const itemsToAdd = selectedItemIds.includes(item.id) && selectedItemIds.length > 1
                                                ? selectedItemIds
                                                : [item.id];
                                            const taskName = prompt('Enter task name:');
                                            if (taskName && taskName.trim()) {
                                                addTask({
                                                    user_id: user?.id || 'demo',
                                                    title: taskName.trim(),
                                                    description: null,
                                                    color: '#FDE68A',
                                                    priority: 'none',
                                                    scheduled_at: null,
                                                    remind_before: null,
                                                    recurring_config: null,
                                                    item_ids: itemsToAdd,
                                                    item_completion: itemsToAdd.reduce((acc, id) => ({ ...acc, [id]: false }), {}),
                                                    is_completed: false,
                                                });
                                                closeContextMenu();
                                            }
                                        }}
                                    >
                                        <Plus size={14} />
                                        <span>New Task...</span>
                                    </button>
                                    {tasks.filter(t => !t.is_completed).length > 0 && <div className="ctx-submenu-divider" />}
                                    {tasks.filter(t => !t.is_completed).map(task => (
                                        <button
                                            key={task.id}
                                            className="ctx-submenu-item"
                                            onClick={() => {
                                                const itemsToAdd = selectedItemIds.includes(item.id) && selectedItemIds.length > 1
                                                    ? selectedItemIds
                                                    : [item.id];
                                                addItemsToTask(task.id, itemsToAdd);
                                                closeContextMenu();
                                            }}
                                        >
                                            <div style={{ width: 10, height: 10, borderRadius: 3, background: task.color || '#F59E0B', flexShrink: 0 }} />
                                            <span>{task.title}</span>
                                            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#9CA3AF' }}>{(task.item_ids || []).length}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button className="ctx-item" onClick={handleNewFolder}>
                                <FolderPlus size={16} />
                                <span>New Folder</span>
                            </button>

                            {/* Remove from List - only shown when viewing a list */}
                            {selectedListId && (
                                <button
                                    className="ctx-item"
                                    onClick={() => {
                                        const itemsToRemove = selectedItemIds.includes(item.id) && selectedItemIds.length > 1
                                            ? selectedItemIds
                                            : [item.id];
                                        removeItemsFromList(selectedListId, itemsToRemove);
                                        closeContextMenu();
                                    }}
                                >
                                    <X size={16} />
                                    <span>Remove from List</span>
                                </button>
                            )}

                            <div className="ctx-divider" />
                        </>
                    )}

                    {/* Appearance Section */}
                    <div className="ctx-section">APPEARANCE</div>

                    {item && (
                        <button className="ctx-item" onClick={handlePin}>
                            <Pin size={16} style={item.is_pinned ? { color: '#F59E0B' } : undefined} />
                            <span>{item.is_pinned ? 'Unpin' : 'Pin to top'}</span>
                        </button>
                    )}

                    {/* Inline Color Picker */}
                    <div className="ctx-item ctx-picker-row">
                        <Palette size={16} />
                        <span>Color</span>
                        <div className="ctx-color-dots">
                            {COLORS.map(c => (
                                <button
                                    key={c.name}
                                    className={`ctx-color-dot ${(item?.bg_color || task?.color) === c.value ? 'active' : ''}`}
                                    style={{ background: c.value }}
                                    onClick={(e) => { e.stopPropagation(); handleColorChange(c.value); }}
                                    title={c.name}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Inline Priority Picker */}
                    <div className="ctx-item ctx-picker-row">
                        <Star size={16} />
                        <span>Priority</span>
                        <div className="ctx-priority-dots">
                            {PRIORITIES.map(p => (
                                <button
                                    key={p.value}
                                    className={`ctx-priority-dot ${(item || task)!.priority === p.value ? 'active' : ''}`}
                                    style={{ background: p.color }}
                                    onClick={(e) => { e.stopPropagation(); handlePriorityChange(p.value as any); }}
                                    title={p.label}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="ctx-divider" />

                    {/* Actions Section */}
                    <div className="ctx-section">ACTIONS</div>

                    {item && (
                        <button className="ctx-item" onClick={handleShowInfo}>
                            <Info size={16} />
                            <span>Details</span>
                        </button>
                    )}

                    {item && (
                        <button className="ctx-item" onClick={() => {
                            if (!item) return;
                            const { archiveItem, unarchiveItem } = useAppStore.getState();
                            if (item.is_archived) unarchiveItem(item.id);
                            else archiveItem(item.id);
                            closeContextMenu();
                        }}>
                            <Archive size={16} />
                            <span>{item.is_archived ? 'Unarchive' : 'Archive'}</span>
                        </button>
                    )}

                    <div className="ctx-divider" />

                    {/* Delete */}                        <button className="ctx-item ctx-danger" onClick={handleDelete}>
                        <Trash2 size={16} />
                        <span>{item ? 'Move to Trash' : 'Delete Task'}</span>
                    </button>
                </>
            ) : (                // ============ EMPTY SPACE CONTEXT MENU ============
                <>
                    <button className="ctx-item" onClick={handleNewNote}>
                        <StickyNote size={16} />
                        <span>New Note</span>
                    </button>

                    <button className="ctx-item" onClick={handleNewLink}>
                        <Link2 size={16} />
                        <span>New Link</span>
                    </button>

                    <button className="ctx-item" onClick={handleNewFolder}>
                        <FolderPlus size={16} />
                        <span>New Folder</span>
                    </button>

                    {hasClipboard && (
                        <>
                            <div className="ctx-divider" />
                            <button className="ctx-item" onClick={handlePaste}>
                                <Clipboard size={16} />
                                <span>Paste ({clipboard.items.length} item{clipboard.items.length > 1 ? 's' : ''})</span>
                            </button>
                        </>
                    )}

                    <div className="ctx-divider" />

                    <button className="ctx-item" onClick={handleRefresh}>
                        <RefreshCw size={16} />
                        <span>Refresh</span>
                    </button>
                </>
            )}

            <style>{`
                .ctx-menu {
                    background: #ffffff;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.1);
                    min-width: 260px;
                    max-width: 300px;
                    padding: 6px;
                    animation: ctxFadeIn 0.12s ease-out;
                }
                @keyframes ctxFadeIn {
                    from { opacity: 0; transform: scale(0.96) translateY(-4px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                .ctx-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 12px;
                    gap: 12px;
                }
                .ctx-title {
                    font-weight: 600;
                    font-size: 0.875rem;
                    color: #1f2937;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    max-width: 180px;
                }
                .ctx-type {
                    font-size: 0.65rem;
                    font-weight: 600;
                    color: #6b7280;
                    background: #f3f4f6;
                    padding: 2px 6px;
                    border-radius: 4px;
                    flex-shrink: 0;
                }
                .ctx-divider {
                    height: 1px;
                    background: #e5e7eb;
                    margin: 4px 0;
                }
                .ctx-section {
                    font-size: 0.65rem;
                    font-weight: 600;
                    color: #9ca3af;
                    padding: 8px 12px 4px;
                    letter-spacing: 0.5px;
                }
                .ctx-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    width: 100%;
                    padding: 9px 12px;
                    border: none;
                    background: transparent;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 0.875rem;
                    color: #374151;
                    transition: background 0.1s;
                    text-align: left;
                }
                .ctx-item:hover {
                    background: #f3f4f6;
                }
                .ctx-item svg {
                    color: #6b7280;
                    flex-shrink: 0;
                }
                .ctx-item:hover svg {
                    color: #374151;
                }
                .ctx-shortcut {
                    margin-left: auto;
                    font-size: 0.7rem;
                    color: #9ca3af;
                    background: #f3f4f6;
                    padding: 2px 6px;
                    border-radius: 4px;
                }
                .ctx-current {
                    margin-left: auto;
                    font-size: 0.75rem;
                    color: #6b7280;
                }
                .ctx-arrow {
                    color: #9ca3af;
                    margin-left: 4px;
                }
                .ctx-danger {
                    color: #dc2626;
                }
                .ctx-danger:hover {
                    background: #fef2f2;
                }
                .ctx-danger svg {
                    color: #dc2626;
                }

                /* Picker rows */
                .ctx-picker-row {
                    flex-wrap: wrap;
                }
                .ctx-color-dots, .ctx-priority-dots {
                    display: flex;
                    gap: 6px;
                    margin-left: auto;
                }
                .ctx-color-dot, .ctx-priority-dot {
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    border: 2px solid rgba(0, 0, 0, 0.1);
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15), inset 0 1px 2px rgba(255, 255, 255, 0.3);
                    cursor: pointer;
                    transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
                }
                .ctx-color-dot:hover, .ctx-priority-dot:hover {
                    transform: scale(1.15);
                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2), inset 0 1px 2px rgba(255, 255, 255, 0.3);
                }
                .ctx-color-dot.active, .ctx-priority-dot.active {
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
                }

                /* Submenu */
                .ctx-submenu-wrapper {
                    position: relative;
                }
                .ctx-submenu-wrapper:hover .ctx-submenu {
                    display: block;
                }
                .ctx-has-submenu {
                    position: relative;
                }
                .ctx-submenu {
                    display: none;
                    position: absolute;
                    top: 0;
                    background: #ffffff;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
                    min-width: 180px;
                    padding: 6px;
                    margin-left: 4px;
                    z-index: 10000;
                }
                .ctx-submenu-header {
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: #9ca3af;
                    padding: 6px 10px;
                    border-bottom: 1px solid #e5e7eb;
                    margin-bottom: 4px;
                }
                .ctx-submenu-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    width: 100%;
                    padding: 8px 10px;
                    border: none;
                    background: transparent;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.8rem;
                    color: #374151;
                    text-align: left;
                    transition: background 0.1s;
                }
                .ctx-submenu-item:hover {
                    background: #f3f4f6;
                }
                .ctx-submenu-item.active {
                    background: rgba(59, 130, 246, 0.1);
                    color: #3b82f6;
                }
                .ctx-submenu-divider {
                    height: 1px;
                    background: #e5e7eb;
                    margin: 4px 0;
                }

                /* Mobile Bottom Sheet Styles */
                @media (max-width: 600px) {
                    .ctx-menu {
                        position: fixed !important;
                        left: 0 !important;
                        right: 0 !important;
                        bottom: 0 !important;
                        top: auto !important;
                        max-width: 100%;
                        min-width: 100%;
                        border-radius: 20px 20px 0 0;
                        padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
                        max-height: 70vh;
                        overflow-y: auto;
                        animation: ctxSlideUp 0.25s ease-out;
                    }
                    @keyframes ctxSlideUp {
                        from { transform: translateY(100%); }
                        to { transform: translateY(0); }
                    }
                    .ctx-item {
                        padding: 14px 16px;
                        font-size: 1rem;
                    }
                    .ctx-color-dot, .ctx-priority-dot {
                        width: 28px;
                        height: 28px;
                    }
                    .ctx-submenu-wrapper .ctx-submenu {
                        position: static;
                        margin: 8px 0;
                        box-shadow: none;
                        border: 1px solid #e5e7eb;
                    }
                    .ctx-submenu-wrapper:hover .ctx-submenu {
                        display: block;
                    }
                }
            `}</style>
        </div>,
        document.body
    );
}

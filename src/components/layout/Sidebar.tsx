import { useState, useCallback } from 'react';
import {
    Search,
    Home,
    CalendarDays,
    AlertTriangle,
    CheckCircle2,
    Calendar,
    Flag,
    StickyNote,
    Link2,
    FileText,
    Image,
    FolderClosed,
    Settings,
    LogIn,
    Menu,
    Trash2,
    Plus,
    X,
    ListTodo,
    Archive,
    User
} from 'lucide-react';
import { useLocation } from 'wouter';
import { useAppStore } from '../../store/useAppStore';
import type { ActiveView, PriorityLevel } from '../../lib/types';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { SettingsModal } from '../modals/SettingsModal';

// Priority colors
const PRIORITY_COLORS: Record<PriorityLevel, string> = {
    high: 'var(--highlight)', // Was #EF4444
    medium: 'var(--accent)',   // Was #F59E0B
    low: '#10B981',            // Needs a variable, but keeping hex if no var exists yet. Let's use var(--card-green) or define a new one. 
    none: 'var(--text-muted)', // Was #9CA3AF
};

interface NavItemProps {
    icon?: React.ReactNode;
    label: string;
    count?: number;
    isActive?: boolean;
    isHighlight?: boolean;
    onClick?: () => void;
    dot?: string;
    iconColor?: string;
    onDrop?: (e: React.DragEvent) => void;
    isDragTarget?: boolean;
    onContextMenu?: (e: React.MouseEvent) => void;
    className?: string;
}

function NavItem({ icon, label, count, isActive, isHighlight, onClick, dot, iconColor, onDrop, isDragTarget, onContextMenu, className = '' }: NavItemProps) {
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        if (isDragTarget) {
            e.preventDefault();
            setIsDragOver(true);
        }
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (onDrop) {
            onDrop(e);
        }
    };

    return (
        <li
            className={`nav-item ${isActive ? 'active' : ''} ${isDragOver ? 'drag-over' : ''} ${className}`}
            onClick={onClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onContextMenu={onContextMenu}
        >
            {dot ? (
                <span className="type-dot" style={{ backgroundColor: dot }} />
            ) : (
                <span className="nav-icon" style={iconColor ? { color: iconColor } : undefined}>{icon}</span>
            )}
            <span>{label}</span>
            {count !== undefined && (
                <span className={`nav-badge ${isHighlight ? 'highlight' : ''}`}>{count}</span>
            )}
        </li>
    );
}

interface FolderItemProps {
    type: string;
    icon: React.ReactNode;
    name: string;
    count: number;
    onClick?: () => void;
}

function FolderItem({ type, icon, name, count, onClick }: FolderItemProps) {
    return (
        <div className="folder-item" data-type={type} onClick={onClick}>
            <div className="folder-icon">{icon}</div>
            <span className="folder-name">{name}</span>
            <span className="folder-count">{count}</span>
        </div>
    );
}

// List Modal Component (Create / Edit)
interface ListModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (name: string, color: string) => void;
    initialData?: { name: string; color: string };
    title?: string;
    submitLabel?: string;
}

const LIST_COLORS = [
    '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
    '#8B5CF6', '#EC4899', '#14B8A6', '#6366F1'
];

function ListModal({ isOpen, onClose, onSubmit, initialData, title = 'New List', submitLabel = 'Create List' }: ListModalProps) {
    // We use a key to reset state when initialData changes or modal re-opens
    return (
        <ListModalContent
            key={isOpen ? 'open' : 'closed'} // Reset when opening
            isOpen={isOpen}
            onClose={onClose}
            onSubmit={onSubmit}
            initialData={initialData}
            title={title}
            submitLabel={submitLabel}
        />
    );
}

function ListModalContent({ isOpen, onClose, onSubmit, initialData, title, submitLabel }: ListModalProps) {
    const [name, setName] = useState(initialData?.name || '');
    const [color, setColor] = useState(initialData?.color || LIST_COLORS[0]);

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (name.trim()) {
            onSubmit(name.trim(), color);
            // Don't clear here, let parent handle closing/resetting
        }
    };

    return (
        <div className="modal-overlay active" onClick={onClose}>
            <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">{title}</h2>
                    <button className="modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    <div style={{ marginBottom: 16 }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#6B7280',
                            marginBottom: 8,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            List Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter list name..."
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                fontSize: '0.9375rem',
                                border: '2px solid #E5E7EB',
                                borderRadius: 10,
                                outline: 'none',
                                fontFamily: 'inherit',
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#F59E0B'}
                            onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                            autoFocus
                        />
                    </div>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#6B7280',
                            marginBottom: 8,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            Color
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {LIST_COLORS.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => setColor(c)}
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 10,
                                        backgroundColor: c,
                                        border: color === c ? '3px solid #1F2937' : '3px solid transparent',
                                        cursor: 'pointer',
                                        transition: 'transform 0.15s',
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                />
                            ))}
                        </div>
                    </div>
                </div>
                <div className="modal-footer">
                    <button
                        onClick={onClose}
                        className="btn btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="btn btn-primary"
                    >
                        {submitLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

interface NewFolderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (name: string) => void;
}

function NewFolderModal({ isOpen, onClose, onSubmit }: NewFolderModalProps) {
    const [name, setName] = useState('');

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (name.trim()) {
            onSubmit(name.trim());
            setName('');
            onClose();
        }
    };

    return (
        <div className="modal-overlay active" onClick={onClose}>
            <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">New Folder</h2>
                    <button className="modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    <div style={{ marginBottom: 16 }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#6B7280',
                            marginBottom: 8,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            Folder Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter folder name..."
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                fontSize: '0.9375rem',
                                border: '2px solid #E5E7EB',
                                borderRadius: 10,
                                outline: 'none',
                                fontFamily: 'inherit',
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#F59E0B'}
                            onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                            autoFocus
                        />
                    </div>
                </div>
                <div className="modal-footer">
                    <button
                        onClick={onClose}
                        className="btn btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="btn btn-primary"
                    >
                        Create Folder
                    </button>
                </div>
            </div>
        </div>
    );
}

export function Sidebar() {
    const [, setLocation] = useLocation();
    const {
        isSidebarOpen,
        toggleSidebar,
        activeView,
        smartFolderCounts,
        todayStats,
        items,
        selectedItemIds,
        updateItem,
        searchQuery,
        setSearchQuery,
        filters,
        lists,
        createList,
        updateList,
        addItemsToList,
        selectedListId,
        user,
        openAuthModal,
        trashedItems,
        addFolder,
        tasks,
        editingList,
        setEditingList,
        deletingList,
        setDeletingList,
        deleteList,
        toggleSettingsModal,
    } = useAppStore();

    const [isNewListModalOpen, setIsNewListModalOpen] = useState(false);
    const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);

    const handleCreateFolder = (name: string) => {
        addFolder({
            id: crypto.randomUUID(),
            user_id: user?.id || 'demo',
            parent_id: null,
            name: name.trim(),
            color: '#9CA3AF',
            is_pinned: false,
            path_tokens: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
    };
    // Lists are now managed in global store

    // Count items by priority
    const priorityCounts = {
        high: items.filter(i => i.priority === 'high' && !i.deleted_at).length + tasks.filter(t => t.priority === 'high' && !t.is_completed).length,
        medium: items.filter(i => i.priority === 'medium' && !i.deleted_at).length + tasks.filter(t => t.priority === 'medium' && !t.is_completed).length,
        low: items.filter(i => i.priority === 'low' && !i.deleted_at).length + tasks.filter(t => t.priority === 'low' && !t.is_completed).length,
    };

    // Helper to close sidebar on mobile
    const closeSidebarOnMobile = () => {
        if (window.innerWidth < 768) {
            useAppStore.setState({ isSidebarOpen: false });
        }
    };

    const handleViewClick = (view: ActiveView) => {
        closeSidebarOnMobile();
        if (view === 'home') setLocation('/');
        else setLocation(`/${view}`);
    };

    // Handle clicking on priority in sidebar - navigates to specific priority view
    const handlePriorityClick = (priority: PriorityLevel) => {
        closeSidebarOnMobile();
        // Toggle if already on this priority? (URL logic makes toggle harder, standard link behavior is better)
        setLocation(`/priority/${priority}`);
    };

    // Handle clicking on smart folder - navigates to that type view
    const handleSmartFolderClick = (view: ActiveView) => {
        closeSidebarOnMobile();
        setLocation(`/type/${view}`);
    };

    const handleListClick = (listId: string) => {
        closeSidebarOnMobile();
        setLocation(`/list/${listId}`);
    };

    // Handle dropping items onto priority
    const handlePriorityDrop = useCallback((e: React.DragEvent, priority: PriorityLevel) => {
        try {
            const data = e.dataTransfer.getData('application/json');
            const itemIds: string[] = data ? JSON.parse(data) : selectedItemIds;
            itemIds.forEach(id => {
                updateItem(id, { priority });
            });
        } catch {
            // Fallback to selectedItemIds
            selectedItemIds.forEach(id => {
                updateItem(id, { priority });
            });
        }
    }, [selectedItemIds, updateItem]);

    // Handle dropping items onto a list
    const handleListDrop = useCallback((e: React.DragEvent, listId: string) => {
        try {
            const data = e.dataTransfer.getData('application/json');
            const itemIds: string[] = data ? JSON.parse(data) : selectedItemIds;
            addItemsToList(listId, itemIds);
        } catch {
            // Fallback to selectedItemIds
            addItemsToList(listId, selectedItemIds);
        }
    }, [selectedItemIds, addItemsToList]);

    return (
        <>
            {isSidebarOpen && <div className="sidebar-overlay" onClick={toggleSidebar} />}
            <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
                {/* Header */}
                <div className="sidebar-header">
                    <span className="logo">Menu</span>
                    <button className="menu-toggle" onClick={toggleSidebar}>
                        <Menu size={20} />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="sidebar-content">
                    {/* Search */}
                    <div className="search-box">
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery ? (
                            <button
                                className="search-clear-btn"
                                onClick={() => setSearchQuery('')}
                                style={{
                                    position: 'absolute',
                                    right: 10,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: 18,
                                    height: 18,
                                    borderRadius: '50%',
                                    background: '#9CA3AF',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    fontSize: 10,
                                }}
                            >
                                ✕
                            </button>
                        ) : (
                            <span style={{
                                position: 'absolute',
                                right: 10,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                color: 'var(--text-muted)',
                                background: 'var(--bg-app)',
                                padding: '2px 6px',
                                borderRadius: 4,
                                border: '1px solid var(--border-light)',
                                pointerEvents: 'none',
                            }}>
                                ⌘K
                            </span>
                        )}
                    </div>

                    {/* Views Section */}
                    <nav className="nav-section">
                        <h3 className="nav-section-title">Views</h3>
                        <ul className="nav-list">
                            <NavItem
                                icon={<Home size={20} />}
                                label="Home"
                                isActive={activeView === 'home'}
                                onClick={() => handleViewClick('home')}
                            />
                            <NavItem
                                icon={<CalendarDays size={20} />}
                                label="Scheduled"
                                count={items.filter(i => i.scheduled_at && !i.deleted_at && !i.is_completed).length}
                                isActive={activeView === 'scheduled'}
                                onClick={() => handleViewClick('scheduled')}
                            />
                            <NavItem
                                icon={<AlertTriangle size={20} />}
                                label="Overdue"
                                count={todayStats.overdue}
                                isHighlight={todayStats.overdue > 0}
                                isActive={activeView === 'overdue'}
                                onClick={() => handleViewClick('overdue')}
                            />
                            <NavItem
                                icon={<CheckCircle2 size={20} />}
                                label="Completed"
                                count={items.filter(i => i.is_completed && !i.deleted_at).length}
                                isActive={activeView === 'completed'}
                                onClick={() => handleViewClick('completed')}
                            />
                            <NavItem
                                icon={<Archive size={18} />}
                                label="Archive"
                                isActive={activeView === 'archive'}
                                onClick={() => handleViewClick('archive')}
                            />
                            <NavItem
                                icon={<Calendar size={20} />}
                                label="Calendar"
                                isActive={activeView === 'calendar'}
                                onClick={() => handleViewClick('calendar')}
                            />
                            <NavItem
                                icon={<ListTodo size={20} />}
                                label="Tasks"
                                isActive={activeView === 'tasks'}
                                count={tasks.filter(t => !t.is_completed).length}
                                onClick={() => handleViewClick('tasks')}
                            />


                            <NavItem
                                icon={<Trash2 size={18} />}
                                label="Trash"
                                isActive={activeView === 'trash'}
                                onClick={() => handleViewClick('trash')}
                                count={trashedItems.length}
                                isDragTarget={true}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const data = e.dataTransfer.getData('application/json');
                                    if (data) {
                                        if (data) {
                                            // const itemIds = JSON.parse(data);
                                            // moveItemsToTrash(itemIds); 
                                        }
                                    }
                                }}
                            />
                        </ul>
                    </nav>

                    {/* Priority Section - with color coding and drag targets */}
                    <nav className="nav-section">
                        <h3 className="nav-section-title">Priority</h3>
                        <ul className="nav-list">
                            <NavItem
                                icon={<Flag size={20} />}
                                iconColor={PRIORITY_COLORS.high}
                                label="High Priority"
                                count={priorityCounts.high}
                                isActive={filters.priority === 'high'}
                                onClick={() => handlePriorityClick('high')}
                                isDragTarget
                                onDrop={(e) => handlePriorityDrop(e, 'high')}
                            />
                            <NavItem
                                icon={<Flag size={20} />}
                                iconColor={PRIORITY_COLORS.medium}
                                label="Medium Priority"
                                count={priorityCounts.medium}
                                isActive={filters.priority === 'medium'}
                                onClick={() => handlePriorityClick('medium')}
                            />
                            <NavItem
                                icon={<Flag size={20} />}
                                iconColor={PRIORITY_COLORS.low}
                                label="Low Priority"
                                count={priorityCounts.low}
                                isActive={filters.priority === 'low'}
                                onClick={() => handlePriorityClick('low')}
                            />
                        </ul>
                    </nav>

                    {/* Lists Section - with drag targets and New List modal */}
                    <nav className="nav-section">
                        <h3 className="nav-section-title">Lists</h3>
                        <ul className="nav-list">
                            {lists.map((list) => {
                                // Count only non-deleted items in the list
                                const listCount = list.items.filter(itemId => {
                                    const item = items.find(i => i.id === itemId);
                                    return item && !item.deleted_at;
                                }).length;

                                return (
                                    <div key={list.id} className="nav-item-wrapper group">
                                        <NavItem
                                            dot={list.color}
                                            label={list.name}
                                            count={listCount}
                                            isDragTarget
                                            isActive={selectedListId === list.id}
                                            onClick={() => handleListClick(list.id)}
                                            onDrop={(e) => handleListDrop(e, list.id)}
                                        />
                                        <div className="nav-item-actions">
                                            <button
                                                className="nav-action-btn edit"
                                                onClick={(e) => { e.stopPropagation(); setEditingList(list); }}
                                                title="Edit List"
                                            >
                                                <Settings size={14} />
                                            </button>
                                            <button
                                                className="nav-action-btn delete"
                                                onClick={(e) => { e.stopPropagation(); setDeletingList(list); }}
                                                title="Delete List"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            <NavItem
                                icon={<Plus size={16} />}
                                label="Add New List"
                                onClick={() => setIsNewListModalOpen(true)}
                                className="add-item"
                            />
                        </ul>
                    </nav>

                    {/* Smart Folders Section */}
                    <nav className="nav-section">
                        <h3 className="nav-section-title">Smart Folders</h3>
                        <FolderItem
                            type="note"
                            icon={<StickyNote size={18} />}
                            name="Notes"
                            count={smartFolderCounts.notes}
                            onClick={() => handleSmartFolderClick('notes')}
                        />
                        <FolderItem
                            type="link"
                            icon={<Link2 size={18} />}
                            name="Links"
                            count={smartFolderCounts.links}
                            onClick={() => handleSmartFolderClick('links')}
                        />
                        <FolderItem
                            type="file"
                            icon={<FileText size={18} />}
                            name="Files"
                            count={smartFolderCounts.files}
                            onClick={() => handleSmartFolderClick('files')}
                        />
                        <FolderItem
                            type="image"
                            icon={<Image size={18} />}
                            name="Images"
                            count={smartFolderCounts.images}
                            onClick={() => handleSmartFolderClick('images')}
                        />
                        <FolderItem
                            type="folder"
                            icon={<FolderClosed size={18} />}
                            name="Folders"
                            count={smartFolderCounts.folders}
                            onClick={() => handleSmartFolderClick('folders')}
                        />
                    </nav>
                </div>

                {/* Footer - User Profile */}
                <div className="sidebar-footer">
                    {user && user.email !== 'demo@local' ? (
                        <div className="user-card">
                            <div className="user-avatar-placeholder">
                                {user.email?.[0].toUpperCase()}
                            </div>
                            <div className="user-details">
                                <span className="user-email" title={user.email}>{user.email}</span>
                                <span className="user-plan">Pro Plan</span>
                            </div>
                            <button className="icon-action-btn" title="Settings" onClick={toggleSettingsModal}>
                                <Settings size={18} />
                            </button>
                        </div>
                    ) : (
                        <div className="guest-card">
                            <div className="guest-header">
                                <div className="user-avatar-placeholder guest">
                                    <User size={16} />
                                </div>
                                <div className="user-details">
                                    <span className="user-email">Guest User</span>
                                    <span className="user-plan">Local Data Only</span>
                                </div>
                                <button className="icon-action-btn" title="Settings" onClick={toggleSettingsModal}>
                                    <Settings size={18} />
                                </button>
                            </div>
                            <button className="signin-btn-full" onClick={openAuthModal}>
                                <LogIn size={16} />
                                <span>Sign In to Sync</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* List Modal (Create / Edit) */}
                <ListModal
                    isOpen={isNewListModalOpen || !!editingList}
                    onClose={() => {
                        setIsNewListModalOpen(false);
                        setEditingList(null);
                    }}
                    onSubmit={(name, color) => {
                        if (editingList) {
                            updateList(editingList.id, { name, color });
                            setEditingList(null);
                        } else {
                            createList(name, color);
                            setIsNewListModalOpen(false);
                        }
                    }}
                    initialData={editingList ? { name: editingList.name, color: editingList.color } : undefined}
                    title={editingList ? 'Edit List' : 'New List'}
                    submitLabel={editingList ? 'Save Changes' : 'Create List'}
                />

                {/* New Folder Modal */}
                <NewFolderModal
                    isOpen={isNewFolderModalOpen}
                    onClose={() => setIsNewFolderModalOpen(false)}
                    onSubmit={handleCreateFolder}
                />

                {/* Delete List Confirmation */}
                <ConfirmationModal
                    isOpen={!!deletingList}
                    onClose={() => setDeletingList(null)}
                    onConfirm={() => {
                        if (deletingList) {
                            deleteList(deletingList.id);
                            setDeletingList(null);
                        }
                    }}
                    title="Delete List"
                    message={`Are you sure you want to delete "${deletingList?.name}"? This action cannot be undone.`}
                    confirmLabel="Delete"
                    isDanger
                />

                <SettingsModal />

                <style>{`
                    .sidebar-overlay {
                        display: none;
                        position: fixed;
                        inset: 0;
                        background: rgba(0, 0, 0, 0.4);
                        backdrop-filter: blur(2px);
                        z-index: 90;
                        transition: opacity 0.3s;
                    }
                    @media (max-width: 768px) {
                        .sidebar-overlay {
                            display: block;
                        }
                    }

                    .nav-item-wrapper {
                        position: relative;
                        display: flex;
                        align-items: center;
                    }
                    .nav-item-wrapper .nav-item {
                        flex: 1;
                    }
                    .nav-item-actions {
                        position: absolute;
                        right: 8px;
                        display: none;
                        gap: 4px;
                        align-items: center;
                        height: 100%;
                    }
                    .nav-item-wrapper:hover .nav-item-actions {
                        display: flex;
                    }
                    .nav-item-wrapper:hover .nav-badge {
                        display: none;
                    }
                    .nav-action-btn {
                        background: transparent;
                        border: none;
                        color: var(--text-muted);
                        cursor: pointer;
                        padding: 4px;
                        border-radius: 4px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.15s;
                    }
                    .nav-action-btn:hover {
                        background: var(--bg-hover);
                        color: var(--text-primary);
                    }
                    .nav-action-btn.delete:hover {
                        color: #EF4444;
                        background: #FEE2E2;
                    }

                    /* User Profile Styles */
                    .user-card, .guest-card {
                        background: #F9FAFB;
                        border-radius: 12px;
                        padding: 12px;
                        border: 1px solid var(--border-light);
                    }
                    .user-card {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }
                    .user-avatar-placeholder {
                        width: 36px;
                        height: 36px;
                        border-radius: 50%;
                        background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
                        color: white;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: 600;
                        font-size: 0.9rem;
                        flex-shrink: 0;
                    }
                    .user-avatar-placeholder.guest {
                        background: #E5E7EB;
                        color: #6B7280;
                    }
                    .user-details {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        min-width: 0;
                    }
                    .user-email {
                        font-size: 0.85rem;
                        font-weight: 600;
                        color: var(--text-primary);
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    .user-plan {
                        font-size: 0.7rem;
                        color: var(--text-secondary);
                    }
                    .icon-action-btn {
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border: none;
                        background: transparent;
                        color: var(--text-secondary);
                        border-radius: 6px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .icon-action-btn:hover {
                        background: rgba(0,0,0,0.05);
                        color: var(--text-primary);
                    }

                    .guest-header {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        margin-bottom: 12px;
                    }
                    .signin-btn-full {
                        width: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        padding: 8px;
                        background: var(--primary);
                        color: white;
                        border: none;
                        border-radius: 8px;
                        font-size: 0.85rem;
                        font-weight: 600;
                        cursor: pointer;
                        transition: opacity 0.2s;
                    }
                    .signin-btn-full:hover {
                        opacity: 0.9;
                    }
                `}</style>
            </aside>
        </>
    );
}
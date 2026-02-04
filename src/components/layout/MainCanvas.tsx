import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useLocation } from 'wouter';
import {
    Plus,
    StickyNote,
    FileText,
    Image,
    Link2,
    FolderClosed,
    RotateCcw,
    LayoutGrid,
    List as ListIcon,
    Bell,
    CalendarDays,
    Calendar,
    ListTodo,
    Loader2
} from 'lucide-react';
import Masonry from 'react-masonry-css';



import { useAppStore } from '../../store/useAppStore';
import { ItemCard } from '../cards/ItemCard';
import { QuickActions } from '../cards/QuickActions';
import { NotificationCenter } from '../ui/NotificationCenter';
import { CommandPalette } from '../modals/CommandPalette';
import { FilePreviewModal } from '../modals/FilePreviewModal';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import { ContextMenu } from '../ui/ContextMenu';

// Lazy Load Heavy Views
const CalendarLayout = lazy(() => import('../calendar/CalendarLayout').then(m => ({ default: m.CalendarLayout })));
const TasksView = lazy(() => import('../views/TasksView').then(m => ({ default: m.TasksView })));
const TaskDetailView = lazy(() => import('../views/TaskDetailView').then(m => ({ default: m.TaskDetailView })));

// Loading Component
const ViewLoader = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9CA3AF' }}>
        <Loader2 size={24} className="animate-spin" />
    </div>
);

// Quick Access Card Component
interface QuickAccessCardProps {
    type: string;
    icon: React.ReactNode;
    count: number;
    label: string;
    onClick?: () => void;
}

function QuickAccessCard({ type, icon, count, label, onClick }: QuickAccessCardProps) {
    return (
        <div className="qa-card" data-type={type} onClick={onClick}>
            <div className="qa-icon">{icon}</div>
            <div className="qa-info">
                <span className="qa-count">{count}</span>
                <span className="qa-label">{label}</span>
            </div>
        </div >
    );
}

interface SchedulerItemsViewProps {
    items: any[];
    tasks: any[];
    viewType: 'scheduled' | 'overdue';
}

function SchedulerItemsView({ items, tasks, viewType: _viewType }: SchedulerItemsViewProps) {
    const { setEditingItem, setSelectedTask, items: allItems } = useAppStore();

    const now = new Date();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(tomorrow); dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    const endOfWeek = new Date(today); endOfWeek.setDate(endOfWeek.getDate() + 7);

    // Combine items and tasks, tagging each with type
    const allScheduledItems = [
        ...items.map(i => ({ ...i, _type: 'item' as const })),
        ...tasks.filter(t => t.scheduled_at && !t.is_completed).map(t => ({ ...t, _type: 'task' as const }))
    ];

    // Group items into categories
    const groups = {
        overdue: [] as any[],
        today: [] as any[],
        tomorrow: [] as any[],
        thisWeek: [] as any[],
        later: [] as any[]
    };

    allScheduledItems.forEach((item: any) => {
        const d = item.scheduled_at ? new Date(item.scheduled_at) : null;
        if (!d) {
            groups.later.push(item);
            return;
        }

        if (d < now && !item.is_completed) {
            groups.overdue.push(item);
        } else if (d >= today && d < tomorrow) {
            groups.today.push(item);
        } else if (d >= tomorrow && d < dayAfterTomorrow) {
            groups.tomorrow.push(item);
        } else if (d >= dayAfterTomorrow && d < endOfWeek) {
            groups.thisWeek.push(item);
        } else {
            groups.later.push(item);
        }
    });

    // Get folder path for item
    const getFolderPath = (folderId: string | null) => {
        if (!folderId) return 'Root';
        const folder = allItems.find(i => i.id === folderId);
        return folder ? folder.title : 'Root';
    };

    // Handle item click - open preview/edit
    const handleClick = (item: any) => {
        if (item._type === 'task') {
            setSelectedTask(item.id);
        } else {
            setEditingItem(item);
        }
    };



    // Render a rich agenda card
    const renderAgendaCard = (item: any) => {
        const d = item.scheduled_at ? new Date(item.scheduled_at) : null;
        const timeStr = d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
        const isOverdue = d && d < now && !item.is_completed;
        const isTask = item._type === 'task';
        const folderPath = getFolderPath(item.folder_id);
        const reminderTime = d && item.remind_before
            ? new Date(d.getTime() - item.remind_before * 60 * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            : null;

        return (
            <div
                key={item.id}
                className={`agenda-card ${isOverdue ? 'overdue' : ''} ${isTask ? 'is-task' : ''}`}
                onClick={() => handleClick(item)}
            >
                {/* Time Column */}
                <div className="agenda-card-time">
                    <span className="time-text">{timeStr}</span>
                </div>

                {/* Dot Indicator */}
                <div className={`agenda-card-dot ${isOverdue ? 'overdue' : ''}`} />

                {/* Content */}
                <div className="agenda-card-content">
                    <div className="agenda-card-title">
                        {isTask && <ListTodo size={14} className="task-icon" />}
                        {item.title}
                    </div>
                    <div className="agenda-card-meta">
                        <span className="agenda-folder">{folderPath}</span>
                    </div>
                    <div className="agenda-card-details">
                        {reminderTime && (
                            <span className="agenda-reminder">
                                <Bell size={12} /> Reminds: {reminderTime}
                            </span>
                        )}
                        <span className="agenda-deadline">
                            <Calendar size={12} /> Deadline: {timeStr}
                        </span>
                    </div>

                    {/* Quick Actions (visible on hover) - uses same component as ItemCard */}
                    <QuickActions item={item} />
                </div>

                {/* Status Badge */}
                {isOverdue && <span className="agenda-status-badge overdue">OVERDUE</span>}
            </div>
        );
    };

    // Render section with vertical line
    const renderSection = (label: string, itemsList: any[]) => {
        if (itemsList.length === 0) return null;
        return (
            <div className="agenda-section">
                <div className="agenda-section-header">
                    <span className="agenda-section-title">{label}</span>
                </div>
                <div className="agenda-section-items">
                    {itemsList.map(item => renderAgendaCard(item))}
                </div>
            </div>
        );
    };

    // Stats
    const overdueCount = groups.overdue.length;
    const todayCount = groups.today.length;
    const upcomingCount = groups.tomorrow.length + groups.thisWeek.length + groups.later.length;

    if (allScheduledItems.length === 0) {
        return (
            <div className="agenda-empty">
                <CalendarDays size={48} strokeWidth={1} />
                <h3>All Clear</h3>
                <p>No scheduled items. Add a due date to your items to see them here.</p>
            </div>
        );
    }

    return (
        <div className="agenda-container">
            {/* Header */}
            <div className="agenda-header">
                <div className="agenda-header-left">
                    <h1 className="agenda-title">Agenda</h1>
                    <p className="agenda-subtitle">Your schedule at a glance</p>
                </div>
                <div className="agenda-header-stats">
                    <div className="stat overdue">
                        <span className="stat-value">{overdueCount}</span>
                        <span className="stat-label">OVERDUE</span>
                    </div>
                    <div className="stat today">
                        <span className="stat-value">{todayCount}</span>
                        <span className="stat-label">TODAY</span>
                    </div>
                    <div className="stat upcoming">
                        <span className="stat-value">{upcomingCount}</span>
                        <span className="stat-label">UPCOMING</span>
                    </div>
                </div>
            </div>

            {/* Sections */}
            <div className="agenda-sections">
                {renderSection('Today', [...groups.overdue, ...groups.today])}
                {renderSection('Tomorrow', groups.tomorrow)}
                {renderSection('This Week', groups.thisWeek)}
                {renderSection('Later', groups.later)}
            </div>
        </div>
    );
}


export function MainCanvas() {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [, setLocation] = useLocation();
    const scrollTimeout = useRef<any>(null);

    const {
        smartFolderCounts,
        todayStats,
        openQuickAdd,
        activeView,
        viewMode,
        setViewMode,
        getFilteredItems,
        getFilteredTasks,
        clearSelection,
        trashedItems,
        restoreItem,
        searchQuery,
        filters,
        items,
        selectedFolderId,
        setSelectedFolder,
        openContextMenu,
        selectedTaskId
    } = useAppStore();

    // Update time every minute
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 60000);
        return () => clearInterval(timer);
    }, []);

    // Global Poller for Reminders (Every 30s)
    useEffect(() => {
        const STORAGE_KEY = 'notifiedReminderIds';
        const stored = sessionStorage.getItem(STORAGE_KEY);
        const notifiedIds = new Set<string>(stored ? JSON.parse(stored) : []);

        const persistNotifiedIds = () => {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...notifiedIds]));
        };

        const checkReminders = () => {
            const now = new Date();
            const { items, tasks, addNotification, acknowledgeReminder } = useAppStore.getState();

            // Check Items
            items.forEach(item => {
                if (item.deleted_at) return;
                if (item.scheduled_at) {
                    const scheduledTime = new Date(item.scheduled_at);
                    const triggerTime = item.remind_before
                        ? new Date(scheduledTime.getTime() - item.remind_before * 60 * 1000)
                        : scheduledTime;

                    if (triggerTime <= now && !notifiedIds.has(item.id)) {
                        notifiedIds.add(item.id);
                        persistNotifiedIds();
                        addNotification('info', `Reminder: ${item.title}`, 'Click to view details');
                        acknowledgeReminder(item.id, 'item');
                    }
                }
            });

            // Check Tasks
            tasks.forEach(task => {
                if (task.is_completed) return;
                if (task.scheduled_at) {
                    const scheduledTime = new Date(task.scheduled_at);
                    const triggerTime = task.remind_before
                        ? new Date(scheduledTime.getTime() - task.remind_before * 60 * 1000)
                        : scheduledTime;

                    if (triggerTime <= now && !notifiedIds.has(task.id)) {
                        notifiedIds.add(task.id);
                        persistNotifiedIds();
                        addNotification('info', `Task Due: ${task.title}`, 'Click to view details');
                        acknowledgeReminder(task.id, 'task');
                    }
                }
            });
        };

        checkReminders();
        const timer = setInterval(checkReminders, 30000);
        return () => clearInterval(timer);
    }, []);

    const timeString = currentTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    const dateString = currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // Scroll Handler
    const handleScroll = () => {
        if (window.innerWidth > 768) return;
        const store = useAppStore.getState();
        if (store.isHeaderVisible) store.setHeaderVisible(false);
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
        scrollTimeout.current = setTimeout(() => {
            useAppStore.getState().setHeaderVisible(true);
        }, 200);
    };

    useEffect(() => {
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Filter Logic
    const filteredItems = getFilteredItems();
    const filteredTasks = getFilteredTasks();
    const displayItemsRaw = [...filteredItems, ...filteredTasks];
    displayItemsRaw.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    const displayItems = activeView === 'home' ? displayItemsRaw.slice(0, 6) : displayItemsRaw;

    const hasFilters = searchQuery || filters.type !== null || filters.priority !== null;
    const isTrashView = activeView === 'trash';

    const handleCanvasClick = () => { clearSelection(); };
    const handleCanvasContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, null);
    };

    const getViewTitle = () => {
        const titles: Record<string, string> = {
            today: 'Today',
            upcoming: 'Due',
            overdue: 'Overdue',
            reminders: 'Reminders',
            completed: 'Completed',
            calendar: 'Calendar',
            all: 'All Items',
            trash: 'Trash',
            notes: 'Notes',
            links: 'Links',
            files: 'Files',
            images: 'Images',
            folders: 'Folders',
            tasks: 'Tasks',
            'high-priority': 'High Priority',
            'medium-priority': 'Medium Priority',
            'low-priority': 'Low Priority',
        };
        return titles[activeView] || 'Today';
    };

    if (selectedTaskId) {
        return (
            <main className="main-content" onClick={handleCanvasClick}>
                <Suspense fallback={<ViewLoader />}>
                    <TaskDetailView />
                </Suspense>
                <FilePreviewModal />
                <CommandPalette />
            </main>
        );
    }

    if (activeView === 'tasks') {
        return (
            <main className="main-content" onClick={handleCanvasClick}>
                <Suspense fallback={<ViewLoader />}>
                    <TasksView />
                </Suspense>
                <FilePreviewModal />
                <CommandPalette />
                <ContextMenu />
            </main>
        );
    }

    if (activeView === 'calendar') {
        return (
            <main className="main-content calendar-mode" onClick={handleCanvasClick}>
                <Suspense fallback={<ViewLoader />}>
                    <CalendarLayout />
                </Suspense>
                <FilePreviewModal />
                <CommandPalette />
            </main>
        );
    }

    return (
        <main
            className="main-content"
            onClick={handleCanvasClick}
            onContextMenu={handleCanvasContextMenu}
            onScroll={handleScroll}
            style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
        >
            <header className="today-header" style={{ flexShrink: 0 }}>
                <div className="today-date">
                    <div className="date-row">
                        {selectedFolderId ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <Breadcrumbs />
                                <h1 className="page-title" style={{ cursor: 'pointer' }} onClick={() => setSelectedFolder(items.find(i => i.id === selectedFolderId)?.folder_id || null)}>
                                    {items.find(i => i.id === selectedFolderId)?.title || 'Unknown Folder'}
                                </h1>
                            </div>
                        ) : (
                            <>
                                <h1 className="page-title">{getViewTitle()}</h1>
                                <span className="today-time">{timeString}</span>
                            </>
                        )}
                    </div>
                    {!selectedFolderId && <p className="today-subtitle">{dateString}</p>}
                </div>

                <div className="header-actions">
                    <button className="action-pill-btn" id="btn-due">
                        <span className="status-text">
                            <span>{todayStats.dueToday}</span>
                            Due
                        </span>
                    </button>
                    <button className="action-pill-btn" id="btn-reminder">
                        <span className="status-text">
                            <span>{todayStats.reminders}</span>
                            Reminders
                        </span>
                    </button>
                    <button className="action-pill-btn add-btn desktop-only" onClick={() => openQuickAdd('note')}>
                        <Plus size={18} />
                        Add
                    </button>
                    <div className="desktop-only">
                        <NotificationCenter />
                    </div>
                    <CommandPalette />
                    <FilePreviewModal />
                </div>
            </header>

            <div className="today-layout" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="today-main" style={{ display: 'flex', flexDirection: 'column' }}>
                    {activeView === 'home' && (
                        <div className="dashboard-row" style={{ flexShrink: 0, marginBottom: 16 }}>
                            <div className="quick-access-compact">
                                <h3 className="compact-section-title">Quick Access</h3>
                                <div className="quick-access-grid">
                                    <QuickAccessCard type="note" icon={<StickyNote size={22} />} count={smartFolderCounts.notes} label="Notes" onClick={() => setLocation('/type/notes')} />
                                    <QuickAccessCard type="file" icon={<FileText size={22} />} count={smartFolderCounts.files} label="Files" onClick={() => setLocation('/type/files')} />
                                    <QuickAccessCard type="image" icon={<Image size={22} />} count={smartFolderCounts.images} label="Images" onClick={() => setLocation('/type/images')} />
                                    <QuickAccessCard type="link" icon={<Link2 size={22} />} count={smartFolderCounts.links} label="Links" onClick={() => setLocation('/type/links')} />
                                    <QuickAccessCard type="folder" icon={<FolderClosed size={22} />} count={smartFolderCounts.folders} label="Folders" onClick={() => setLocation('/type/folders')} />
                                    <QuickAccessCard type="task" icon={<ListTodo size={22} />} count={todayStats.tasks} label="Tasks" onClick={() => setLocation('/tasks')} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, flexShrink: 0 }}>
                        <h3 className="section-title" style={{ margin: 0 }}>
                            {isTrashView ? 'Trash' : (hasFilters ? 'Search Results' : (activeView === 'home' ? 'Recent Items' : getViewTitle()))}
                            <span style={{ fontSize: '0.75rem', color: '#6B7280', marginLeft: 8 }}>({displayItems.length})</span>
                        </h3>
                        <div style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                            <button onClick={() => setViewMode('grid')} style={{ display: 'flex', padding: 6, borderRadius: 6, background: viewMode === 'grid' ? '#F3F4F6' : 'transparent', border: 'none', cursor: 'pointer' }}>
                                <LayoutGrid size={18} color={viewMode === 'grid' ? '#1f2937' : '#9CA3AF'} />
                            </button>
                            <button onClick={() => setViewMode('list')} style={{ display: 'flex', padding: 6, borderRadius: 6, background: viewMode === 'list' ? '#F3F4F6' : 'transparent', border: 'none', cursor: 'pointer' }}>
                                <ListIcon size={18} color={viewMode === 'list' ? '#1f2937' : '#9CA3AF'} />
                            </button>
                        </div>
                    </div>

                    <div style={{ flexGrow: 1, width: '100%' }}>
                        {isTrashView ? (
                            <div className="items-list-container standard-list">
                                {trashedItems.map((item) => (
                                    <div key={item.id} className="trash-item-wrapper" style={{ position: 'relative' }}>
                                        <ItemCard item={item} />
                                        <button className="restore-btn" onClick={(e) => { e.stopPropagation(); restoreItem(item.id); }}>
                                            <RotateCcw size={12} /> Restore
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (activeView === 'scheduled' || activeView === 'overdue') ? (
                            <div>
                                <SchedulerItemsView items={displayItems} tasks={filteredTasks} viewType={activeView as 'scheduled' | 'overdue'} />
                            </div>
                        ) : displayItems.length === 0 ? (
                            <div className="empty-state" style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>
                                <p>No items found</p>
                            </div>
                        ) : (
                            <div className="masonry-container" style={{ padding: '8px 0' }}>
                                <Masonry
                                    breakpointCols={{
                                        default: 4,
                                        1400: 3,
                                        1100: 2,
                                        700: 1
                                    }}
                                    className="masonry-grid"
                                    columnClassName="masonry-grid-column"
                                >
                                    {filteredItems.map((item) => (
                                        <ItemCard key={item.id} item={item} />
                                    ))}
                                </Masonry>
                            </div>
                        )}
                    </div>

                </div>
            </div>
            <ContextMenu />
        </main>
    );
}
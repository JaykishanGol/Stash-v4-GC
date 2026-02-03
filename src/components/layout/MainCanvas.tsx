import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useLocation } from 'wouter';
import {
    Plus,
    Clock,
    StickyNote,
    FileText,
    Image,
    Link2,
    FolderClosed,
    Trash2,
    RotateCcw,
    LayoutGrid,
    List as ListIcon, // Renamed to avoid collision with react-window List
    Bell,
    Calendar,
    Repeat,
    ListTodo,
    Loader2
} from 'lucide-react';
import Masonry from 'react-masonry-css';
import { List } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';

import { useAppStore } from '../../store/useAppStore';
import { ItemCard } from '../cards/ItemCard';
import { TaskCard } from '../cards/TaskCard';
import { QuickActions } from '../cards/QuickActions';
import { NotificationCenter } from '../ui/NotificationCenter';
import { CommandPalette } from '../modals/CommandPalette';
import { FilePreviewModal } from '../modals/FilePreviewModal';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import { ContextMenu } from '../ui/ContextMenu';

import { formatDate } from '../../lib/utils';

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

const VirtualList = List as any;

// Virtualized Row Component
const Row = ({ index, style, data }: any) => {
    const { items, isTrashView, restoreItem } = data;
    const item = items[index];

    if (isTrashView) {
        return (
            <div style={style}>
                <div className="trash-item-wrapper" style={{ position: 'relative', height: '100%', paddingBottom: 8 }}>
                    <ItemCard item={item} />
                    <button
                        className="restore-btn"
                        onClick={(e) => { e.stopPropagation(); restoreItem(item.id); }}
                        style={{
                            position: 'absolute',
                            bottom: 18, // Adjusted for padding
                            right: 10,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '6px 10px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#059669',
                            background: '#D1FAE5',
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                        }}
                    >
                        <RotateCcw size={12} />
                        Restore
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={style}>
            <div style={{ height: '100%', paddingBottom: 8 }}>
                {item.item_ids ? (
                    <TaskCard task={item} />
                ) : (
                    <ItemCard item={item} />
                )}
            </div>
        </div>
    );
};

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
    viewType: 'upcoming' | 'overdue' | 'reminders';
}

function SchedulerItemsView({ items, viewType }: SchedulerItemsViewProps) {
    const { items: allItems } = useAppStore();

    // Stats Calculation
    const stats = {
        overdue: 0,
        today: 0,
        upcoming: 0
    };

    const now = new Date();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    items.forEach((item: any) => {
        const d = item.due_at ? new Date(item.due_at) : null;
        if (d) {
            if (d < now) stats.overdue++;
            else if (d >= today && d < tomorrow) stats.today++;
            else stats.upcoming++;
        }
    });

    const getBreadcrumbs = (folderId: string | null) => {
        if (!folderId) return 'Root';
        const path: string[] = [];
        let currentId: string | null = folderId;
        while (currentId) {
            // eslint-disable-next-line no-loop-func
            const folder = allItems.find(i => i.id === currentId);
            if (folder) {
                path.unshift(folder.title);
                currentId = folder.folder_id || null;
            } else {
                break;
            }
        }
        return path.join(' / ') || 'Root';
    };

    const getUrgencyInfo = (item: any) => {
        const d = item.due_at ? new Date(item.due_at) : null;
        if (!d) return null;
        if (d < now) return { text: 'Overdue', status: 'overdue' };
        if (d >= today && d < tomorrow) return { text: 'Today', status: 'today' };
        return { text: 'Upcoming', status: 'upcoming' };
    };

    // Grouping
    const groupedItems: Record<string, any[]> = {};
    items.forEach((item: any) => {
        let dateKey = '';
        const d = viewType === 'reminders' ? (item.next_trigger_at || item.remind_at) : item.due_at;
        dateKey = d ? new Date(d).toDateString() : 'No Date';
        if (!groupedItems[dateKey]) groupedItems[dateKey] = [];
        groupedItems[dateKey].push(item);
    });

    const sortedDateKeys = Object.keys(groupedItems).sort((a, b) => {
        if (a === 'No Date') return 1;
        if (b === 'No Date') return -1;
        const dateA = new Date(a).getTime();
        const dateB = new Date(b).getTime();
        return viewType === 'overdue' ? dateB - dateA : dateA - dateB;
    });

    const formatDateHeader = (dateStr: string) => {
        if (dateStr === 'No Date') return dateStr;
        const date = new Date(dateStr);
        if (date.toDateString() === today.toDateString()) return 'Today';
        if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
        // Format: "Jan 25"
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const getTimeDetails = (item: any) => {
        const details: { icon: 'repeat' | 'bell' | 'calendar', text: string }[] = [];

        // 1. Recurrence
        if (item.reminder_type === 'recurring' && item.recurring_config) {
            const { frequency, interval, byWeekDays } = item.recurring_config;
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            let text = '';
            if (interval > 1) text += `Every ${interval} `;
            switch (frequency) {
                case 'daily': text += interval > 1 ? 'days' : 'Daily'; break;
                case 'weekly':
                    text += interval > 1 ? 'weeks' : 'Weekly';
                    if (byWeekDays && byWeekDays.length > 0) text += ' on ' + byWeekDays.map((d: number) => days[d]).join(', ');
                    break;
                case 'monthly': text += interval > 1 ? 'months' : 'Monthly'; break;
                case 'yearly': text += interval > 1 ? 'years' : 'Yearly'; break;
            }
            details.push({ icon: 'repeat', text });
        }

        // 2. Reminder
        const remindDate = item.next_trigger_at ? new Date(item.next_trigger_at) : (item.remind_at ? new Date(item.remind_at) : null);
        if (remindDate) {
            const timeStr = remindDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            // If reminder is on a different day than the group, show date too
            details.push({ icon: 'bell', text: `Reminds: ${timeStr}` });
        }

        // 3. Due Date (Explicit)
        if (item.due_at) {
            const d = new Date(item.due_at);
            const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            // Only add if it's different from the reminder or we want to be explicit
            details.push({ icon: 'calendar', text: `Deadline: ${timeStr}` });
        }

        return details;
    };

    if (items.length === 0) {
        return (
            <div className="agenda-empty">
                <h3>All Clear</h3>
                <p>No items found in this view.</p>
            </div>
        );
    }

    return (
        <div className="scheduler-agenda-container">
            {/* Stat Bar Header */}
            <div className="agenda-header">
                <div className="agenda-title-row">
                    <div>
                        <h1 className="agenda-title">
                            {viewType === 'overdue' ? 'Attention' : viewType === 'reminders' ? 'Reminders' : 'Agenda'}
                        </h1>
                        <p className="agenda-subtitle">Your schedule at a glance</p>
                    </div>

                    <div className="agenda-stat-bar">
                        <div className="stat-item stat-overdue">
                            <span className="stat-value">{stats.overdue}</span>
                            <span className="stat-label">Overdue</span>
                        </div>
                        <div className="stat-item stat-today">
                            <span className="stat-value">{stats.today}</span>
                            <span className="stat-label">Today</span>
                        </div>
                        <div className="stat-item stat-upcoming">
                            <span className="stat-value">{stats.upcoming}</span>
                            <span className="stat-label">Upcoming</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Wrapper (Timeline + Groups) */}
            <div className="agenda-content-wrapper">
                <div className="scheduler-timeline-line" />

                {/* Groups */}
                {sortedDateKeys.map(dateKey => (
                    <div key={dateKey} className="agenda-group">
                        <div className="agenda-group-header">
                            <div className="agenda-group-label">
                                {formatDateHeader(dateKey)}
                            </div>
                        </div>

                        {groupedItems[dateKey].map(item => {
                            const urgency = getUrgencyInfo(item);
                            const dateObj = (item.due_at || item.remind_at) ? new Date(item.due_at || item.remind_at) : null;
                            const timeStr = dateObj ? dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
                            const path = getBreadcrumbs(item.folder_id);
                            const timeDetails = getTimeDetails(item);

                            return (
                                <div key={item.id} className={`agenda-card ${urgency?.status || ''}`}>
                                    <div className="agenda-card-time">
                                        {timeStr || '--:--'}
                                    </div>
                                    <div className="agenda-card-body card">
                                        <div className="agenda-card-header">
                                            <div className="agenda-card-title">{item.title}</div>
                                            {urgency && urgency.status !== 'upcoming' && (
                                                <div className={`agenda-status-text ${urgency.status}`}>
                                                    {urgency.text}
                                                </div>
                                            )}
                                        </div>

                                        <div className="agenda-card-breadcrumbs">
                                            {path}
                                        </div>

                                        {/* ALL Time Details */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                                            {timeDetails.map((detail, idx) => (
                                                <div key={idx} className="agenda-meta-row" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#4B5563', fontWeight: 500 }}>
                                                    {detail.icon === 'repeat' && <Repeat size={12} color="#6366F1" />}
                                                    {detail.icon === 'bell' && <Bell size={12} color="#F59E0B" />}
                                                    {detail.icon === 'calendar' && <Calendar size={12} color="#10B981" />}
                                                    <span>{detail.text}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <QuickActions item={item} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
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
        // setActiveView, // Removed, handled by RouteSyncer
        activeView,
        viewMode,
        setViewMode,
        getFilteredItems,
        getFilteredTasks, 
        clearSelection,
        trashedItems,
        restoreItem,
        emptyTrash,
        searchQuery,
        filters,
        items,
        selectedFolderId,
        setSelectedFolder, 
        openContextMenu, 
        selectedTaskId,
        selectedListId 
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
        // Load persisted notified IDs from sessionStorage to survive refreshes
        const STORAGE_KEY = 'notifiedReminderIds';
        const stored = sessionStorage.getItem(STORAGE_KEY);
        const notifiedIds = new Set<string>(stored ? JSON.parse(stored) : []);



        const persistNotifiedIds = () => {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...notifiedIds]));
        };

        const checkReminders = () => {
            const now = new Date();
            // Get latest state including acknowledge action
            const { items, tasks, addNotification, acknowledgeReminder } = useAppStore.getState();

            console.log('[Reminder Poller] Checking reminders at:', now.toISOString());

            // Check Items
            items.forEach(item => {
                // Skip deleted items
                if (item.deleted_at) return;

                if (item.next_trigger_at) {
                    const triggerTime = new Date(item.next_trigger_at);

                    // Fire if past due and not already notified this session
                    if (triggerTime <= now && !notifiedIds.has(item.id)) {
                        console.log(`[Reminder Poller] 🔔 FIRING notification for "${item.title}"`);
                        notifiedIds.add(item.id);
                        persistNotifiedIds();
                        addNotification('info', `Reminder: ${item.title}`, 'Click to view details');
                        // Acknowledge to prevent server push
                        acknowledgeReminder(item.id, 'item');
                    }
                }
            });

            // Check Tasks (similar logic)
            tasks.forEach(task => {
                // Skip completed tasks (no deleted_at for tasks, but check is_completed)
                if (task.is_completed) return;

                if (task.next_trigger_at) {
                    const triggerTime = new Date(task.next_trigger_at);

                    if (triggerTime <= now && !notifiedIds.has(task.id)) {
                        console.log(`[Reminder Poller] 🔔 FIRING notification for task "${task.title}"`);
                        notifiedIds.add(task.id);
                        persistNotifiedIds();
                        addNotification('info', `Task Due: ${task.title}`, 'Click to view details');
                        // Acknowledge to prevent server push
                        acknowledgeReminder(task.id, 'task');
                    }
                }
            });
        };

        // Run immediately on mount
        checkReminders();

        const timer = setInterval(checkReminders, 30000); // 30s
        return () => clearInterval(timer);
    }, []);

    const timeString = currentTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    const dateString = formatDate(currentTime);

    // Scroll Handler for Mobile (Hide while scrolling, Show on stop)
    // Wrapped in useCallback to be stable for event listeners
    const handleScroll = () => {
        if (window.innerWidth > 768) return;

        // Hide immediately when scrolling starts/continues
        // Access store directly to avoid closure staleness if using event listener
        const store = useAppStore.getState();
        if (store.isHeaderVisible) {
            store.setHeaderVisible(false);
        }

        // Clear existing timeout
        if (scrollTimeout.current) {
            clearTimeout(scrollTimeout.current);
        }

        // Set timeout to show elements after scrolling stops
        scrollTimeout.current = setTimeout(() => {
            useAppStore.getState().setHeaderVisible(true);
        }, 200);
    };

    // Attach scroll listener to window for robust mobile detection
    useEffect(() => {
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Get filtered items (limit to 6 for recent view)
    console.log('[DEBUG] MainCanvas render - store.selectedListId:', selectedListId);

    // MIXING ITEMS AND TASKS
    const filteredItems = getFilteredItems();
    const filteredTasks = getFilteredTasks();
    const displayItemsRaw = [...filteredItems, ...filteredTasks];

    // Sort mixed items by update time (or create time if needed, or by due date for scheduled views)
    // For Today/Upcoming/Overdue, we might want due_at sorting.
    // For now, consistent updated_at sorting is safe.
    displayItemsRaw.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    // Slice for Recent Items view
    const displayItems = activeView === 'today' ? displayItemsRaw.slice(0, 6) : displayItemsRaw;

    // Check if we have active filters/search
    const hasFilters = searchQuery || filters.type !== null || filters.priority !== null;

    // Check if viewing trash
    const isTrashView = activeView === 'trash';

    // Handle click on canvas to clear selection
    const handleCanvasClick = () => {
        clearSelection();
    };

    // Handle right-click on canvas to open context menu
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
        >
            {/* Today Header */}
            <header className="today-header">
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
                    {/* Header Actions - Unified for all views */}
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

                    {/* Desktop Notification - Hidden on Mobile */}
                    <div className="desktop-only">
                        <NotificationCenter />
                    </div>

                    <CommandPalette />

                    <FilePreviewModal />
                </div>
            </header>

            {/* Today Layout */}
            <div className="today-layout">
                {/* Main Content Area */}
                <div className="today-main">
                    {/* Quick Access Row - Only on Dashboard */}
                    {activeView === 'today' && (
                        <div className="dashboard-row">
                            <div className="quick-access-compact">
                                <h3 className="compact-section-title">Quick Access</h3>
                                <div className="quick-access-grid">
                                    <QuickAccessCard
                                        type="note"
                                        icon={<StickyNote size={22} />}
                                        count={smartFolderCounts.notes}
                                        label="Notes"
                                        onClick={() => setLocation('/type/notes')}
                                    />
                                    <QuickAccessCard
                                        type="file"
                                        icon={<FileText size={22} />}
                                        count={smartFolderCounts.files}
                                        label="Files"
                                        onClick={() => setLocation('/type/files')}
                                    />
                                    <QuickAccessCard
                                        type="image"
                                        icon={<Image size={22} />}
                                        count={smartFolderCounts.images}
                                        label="Images"
                                        onClick={() => setLocation('/type/images')}
                                    />
                                    <QuickAccessCard
                                        type="link"
                                        icon={<Link2 size={22} />}
                                        count={smartFolderCounts.links}
                                        label="Links"
                                        onClick={() => setLocation('/type/links')}
                                    />
                                    <QuickAccessCard
                                        type="folder"
                                        icon={<FolderClosed size={22} />}
                                        count={smartFolderCounts.folders}
                                        label="Folders"
                                        onClick={() => setLocation('/type/folders')}
                                    />
                                    <QuickAccessCard
                                        type="task"
                                        icon={<ListTodo size={22} />}
                                        count={todayStats.tasks}
                                        label="Tasks"
                                        onClick={() => setLocation('/tasks')}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Items Section */}
                    <section className="today-section">

                        <h3 className="section-title">
                            {isTrashView ? (
                                <>
                                    <span className="section-icon"><Trash2 size={18} /></span>
                                    Trash
                                    {trashedItems.length > 0 && (
                                        <span style={{ marginLeft: 'auto' }}>
                                            <button
                                                className="empty-trash-btn"
                                                onClick={(e) => { e.stopPropagation(); emptyTrash(); }}
                                                style={{
                                                    padding: '6px 12px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    color: '#DC2626',
                                                    background: '#FEF2F2',
                                                    border: '1px solid #FECACA',
                                                    borderRadius: 6,
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Empty Trash
                                            </button>
                                        </span>
                                    )}
                                </>
                            ) : (
                                <>
                                    <span className="section-icon"><Clock size={18} /></span>
                                    {hasFilters ? 'Search Results' : (activeView === 'today' ? 'Recent Items' : getViewTitle())}
                                    {hasFilters && <span style={{ fontSize: '0.75rem', color: '#6B7280', marginLeft: 8 }}>({displayItems.length} items)</span>}
                                </>
                            )}
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                                <button onClick={() => setViewMode('grid')} style={{ display: 'flex', padding: 6, borderRadius: 6, background: viewMode === 'grid' ? '#F3F4F6' : 'transparent', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
                                    <LayoutGrid size={18} color={viewMode === 'grid' ? '#1f2937' : '#9CA3AF'} />
                                </button>
                                <button onClick={() => setViewMode('list')} style={{ display: 'flex', padding: 6, borderRadius: 6, background: viewMode === 'list' ? '#F3F4F6' : 'transparent', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
                                    <ListIcon size={18} color={viewMode === 'list' ? '#1f2937' : '#9CA3AF'} />
                                </button>
                            </div>
                        </h3>

                        <div className={viewMode === 'list' ? 'items-list' : ''}>
                            {isTrashView ? (
                                trashedItems.length > 0 ? (
                                    trashedItems.map((item) => (
                                        <div key={item.id} className="trash-item-wrapper" style={{ position: 'relative' }}>
                                            <ItemCard item={item} />
                                            <button
                                                className="restore-btn"
                                                onClick={(e) => { e.stopPropagation(); restoreItem(item.id); }}
                                                style={{
                                                    position: 'absolute',
                                                    bottom: 10,
                                                    right: 10,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 4,
                                                    padding: '6px 10px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    color: '#059669',
                                                    background: '#D1FAE5',
                                                    border: 'none',
                                                    borderRadius: 6,
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <RotateCcw size={12} />
                                                Restore
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#6B7280' }}>
                                        <Trash2 size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                                        <p>Trash is empty</p>
                                    </div>
                                )
                            ) : (
                                <>
                                    {/* Use SchedulerItemsView for date-grouped display */}
                                    {(activeView === 'upcoming' || activeView === 'overdue' || activeView === 'reminders') ? (
                                        <SchedulerItemsView
                                            items={displayItems}
                                            viewType={activeView as 'upcoming' | 'overdue' | 'reminders'}
                                        />
                                    ) : (
                                        <>
                                            {/* Masonry Grid or Virtualized List View */}
                                            {viewMode === 'grid' ? (
                                                <Masonry
                                                    breakpointCols={{
                                                        default: 4,
                                                        1400: 3,
                                                        1100: 2,
                                                        700: 1
                                                    }}
                                                    className="my-masonry-grid"
                                                    columnClassName="my-masonry-grid_column"
                                                >
                                                    {/* Add Card (only on Today view) */}
                                                    {activeView === 'today' && (
                                                        <div className="card card-add" onClick={() => openQuickAdd('note')}>
                                                            <button className="add-card-btn">
                                                                <Plus size={32} className="add-card-icon" />
                                                            </button>
                                                        </div>
                                                    )}

                                                    {displayItems.map((item: any) => (
                                                        <div key={item.id} className="masonry-item">
                                                            {item.item_ids ? (
                                                                <TaskCard task={item} />
                                                            ) : (
                                                                <ItemCard item={item} />
                                                            )}
                                                        </div>
                                                    ))}
                                                </Masonry>
                                            ) : (
                                                <div className="items-list" style={{ height: 'calc(100vh - 200px)', minHeight: 500 }}>
                                                    {/* Virtualized List */}
                                                    {/* @ts-ignore */}
                                                    <AutoSizer>
                                                        {({ height, width }: { height: number; width: number }) => (
                                                            /* @ts-ignore */
                                                            <VirtualList
                                                                height={height}
                                                                itemCount={displayItems.length}
                                                                itemSize={180} // Increased height for cards
                                                                width={width}
                                                                itemData={{ items: displayItems, isTrashView, restoreItem }}
                                                                children={Row as any}
                                                            />
                                                        )}
                                                    </AutoSizer>

                                                    {/* Add Card (Floating/Fixed for list view) */}
                                                    {activeView === 'today' && (
                                                        <button 
                                                            className="fab-btn-circle desktop-only"
                                                            onClick={() => openQuickAdd('note')}
                                                            style={{
                                                                position: 'fixed',
                                                                bottom: 32,
                                                                right: 32,
                                                                zIndex: 50,
                                                                width: 56,
                                                                height: 56
                                                            }}
                                                        >
                                                            <Plus size={24} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {displayItems.length === 0 && !isTrashView && (
                                                <div className="empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#6B7280' }}>
                                                    <p>No items found</p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </section>
                </div>
            </div>
            <ContextMenu />
        </main>
    );
}
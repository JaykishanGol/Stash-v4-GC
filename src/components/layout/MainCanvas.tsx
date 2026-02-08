import { useState, useEffect, useRef, lazy, Suspense, useMemo } from 'react';
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
    ListTodo,
    Loader2,
    Trash2
} from 'lucide-react';
import Masonry from 'react-masonry-css';
import { useAppStore } from '../../store/useAppStore';
import { ItemCard } from '../cards/ItemCard';
import { NotificationCenter } from '../ui/NotificationCenter';
import { CommandPalette } from '../modals/CommandPalette';
import { FilePreviewModal } from '../modals/FilePreviewModal';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import { ContextMenu } from '../ui/ContextMenu';
import { SchedulerItemsView } from '../views/SchedulerItemsView';

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
        clearSelection,
        trashedItems,
        restoreItem,
        searchQuery,
        filters,
        items,
        selectedFolderId,
        setSelectedFolder,
        openContextMenu,
        selectedTaskId,
        emptyTrash // ADDED
    } = useAppStore();

    // Call filter functions outside selector to avoid infinite loop
    // (they return new array refs, which Zustand's shallow compare treats as changes)
    const getFilteredItems = useAppStore(s => s.getFilteredItems);
    const getFilteredTasks = useAppStore(s => s.getFilteredTasks);
    const filteredItems = getFilteredItems();
    const filteredTasks = getFilteredTasks();

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

            // Evict old entries to prevent unbounded growth
            if (notifiedIds.size > 500) {
                const arr = [...notifiedIds];
                arr.splice(0, arr.length - 200);
                notifiedIds.clear();
                arr.forEach(id => notifiedIds.add(id));
                persistNotifiedIds();
            }

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

    // Memoize the display list to avoid expensive recalculations on every scroll
    const displayItemsRaw = useMemo(() => {
        // Only include tasks in views that actually render them (Agenda views)
        const showTasks = ['scheduled', 'overdue'].includes(activeView);

        if (showTasks) {
            const combined = [...filteredItems, ...filteredTasks];
            // Sort by date for agenda
            return combined.sort((a, b) => {
                const dateA = new Date((a as any).scheduled_at || 0).getTime();
                const dateB = new Date((b as any).scheduled_at || 0).getTime();
                return dateA - dateB;
            });
        }

        // For standard grid views (Home, All, Notes, etc), show ONLY Items
        // Tasks are not compatible with ItemCard
        return filteredItems;
    }, [activeView, filteredItems, filteredTasks]);

    const displayItems = activeView === 'home' ? displayItemsRaw.slice(0, 6) : displayItemsRaw;

    const hasFilters = searchQuery || filters.type !== null || filters.priority !== null;
    const isTrashView = activeView === 'trash';
    const isAgendaView = activeView === 'scheduled' || activeView === 'overdue';

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
            id="main-content"
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
                    {activeView === 'trash' && trashedItems.length > 0 && (
                        <button
                            className="action-pill-btn danger"
                            onClick={() => {
                                if (confirm('Are you sure you want to permanently delete all items in Trash?')) {
                                    emptyTrash();
                                }
                            }}
                            style={{ marginRight: 8, borderColor: '#FECACA', color: '#DC2626', background: '#FEF2F2' }}
                        >
                            <Trash2 size={16} />
                            Empty Trash
                        </button>
                    )}
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

            <div className={`today-layout ${isAgendaView ? 'agenda-mode' : ''}`} style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
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
                        <div className="view-mode-toggle" style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                            <button onClick={() => setViewMode('grid')} className={viewMode === 'grid' ? 'active' : ''} aria-label="Grid view" style={{ display: 'flex', padding: 6, borderRadius: 6, background: viewMode === 'grid' ? '#F3F4F6' : 'transparent', border: 'none', cursor: 'pointer' }}>
                                <LayoutGrid size={18} color={viewMode === 'grid' ? '#1f2937' : '#9CA3AF'} />
                            </button>
                            <button onClick={() => setViewMode('list')} className={viewMode === 'list' ? 'active' : ''} style={{ display: 'flex', padding: 6, borderRadius: 6, background: viewMode === 'list' ? '#F3F4F6' : 'transparent', border: 'none', cursor: 'pointer' }}>
                                <ListIcon size={18} color={viewMode === 'list' ? '#1f2937' : '#9CA3AF'} />
                            </button>
                        </div>
                    </div>

                    <div style={{ flexGrow: 1, width: '100%' }}>
                        {isTrashView ? (
                            viewMode === 'grid' ? (
                                <div className="masonry-container" style={{ padding: '8px 0' }}>
                                    <Masonry
                                        breakpointCols={{ default: 4, 1400: 3, 1100: 2, 700: 1 }}
                                        className="masonry-grid"
                                        columnClassName="masonry-grid-column"
                                    >
                                        {trashedItems.map((item) => (
                                            <div key={item.id} className="trash-item-wrapper" style={{ position: 'relative', marginBottom: 20 }}>
                                                <ItemCard item={item} variant="masonry" />
                                                <button className="restore-btn" onClick={(e) => { e.stopPropagation(); restoreItem(item.id); }} style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, background: 'white', padding: '4px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                                                    <RotateCcw size={12} /> Restore
                                                </button>
                                            </div>
                                        ))}
                                    </Masonry>
                                </div>
                            ) : (
                                <div className="items-list">
                                    {trashedItems.map((item) => (
                                        <div key={item.id} className="trash-item-wrapper" style={{ position: 'relative' }}>
                                            <ItemCard item={item} variant="grid" />
                                            <button className="restore-btn" onClick={(e) => { e.stopPropagation(); restoreItem(item.id); }} style={{ marginLeft: 'auto', background: 'white', padding: '4px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                                                <RotateCcw size={12} /> Restore
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )
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

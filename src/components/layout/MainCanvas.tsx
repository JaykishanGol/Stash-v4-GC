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
    Bell,
    CalendarDays,
    ListTodo,
    Loader2,
    Trash2
} from 'lucide-react';
import Masonry from 'react-masonry-css';
import { useAppStore } from '../../store/useAppStore';
import { useFilteredItems } from '../../hooks/useFilteredItems'; // NEW HOOK
import { ItemCard } from '../cards/ItemCard';
import { supabase, STORAGE_BUCKET } from '../../lib/supabase';
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

// Shared cache to avoid thumbnail flicker
const scheduleUrlCache = new Map<string, { url: string; expiry: number }>();

function ScheduleImage({ path, alt }: { path: string; alt: string }) {
    const [src, setSrc] = useState<string | null>(() => {
        if (!path) return null;
        if (path.startsWith('http') || path.startsWith('blob:')) return path;
        const cached = scheduleUrlCache.get(path);
        if (cached && cached.expiry > Date.now()) return cached.url;
        return null;
    });

    useEffect(() => {
        if (!path) return;
        if (path.startsWith('http') || path.startsWith('blob:')) {
            setSrc(path);
            return;
        }

        const cached = scheduleUrlCache.get(path);
        if (cached && cached.expiry > Date.now()) {
            setSrc(cached.url);
            return;
        }

        let isMounted = true;
        supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600, {
            transform: { width: 400, height: 400, resize: 'cover' }
        }).then(({ data }) => {
            if (!isMounted) return;
            if (data?.signedUrl) {
                scheduleUrlCache.set(path, { url: data.signedUrl, expiry: Date.now() + 50 * 60 * 1000 });
                setSrc(data.signedUrl);
                return;
            }

            const { data: publicData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path, {
                transform: { width: 400, height: 400, resize: 'cover' }
            });
            scheduleUrlCache.set(path, { url: publicData.publicUrl, expiry: Date.now() + 50 * 60 * 1000 });
            setSrc(publicData.publicUrl);
        });

        return () => { isMounted = false; };
    }, [path]);

    if (!src) return <div className="schedule-media-fallback" />;
    return <img src={src} alt={alt} className="schedule-media-image" loading="lazy" decoding="async" />;
}

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
    const { setSelectedTask, setEditingItem } = useAppStore();

    const now = new Date();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(tomorrow); dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    const endOfWeek = new Date(today); endOfWeek.setDate(endOfWeek.getDate() + 7);

    // Group items into categories
    const groups = {
        overdue: [] as any[],
        today: [] as any[],
        tomorrow: [] as any[],
        thisWeek: [] as any[],
        later: [] as any[]
    };

    // Process items
    items.forEach((item: any) => {
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

    // Process tasks with schedules
    tasks.filter(t => t.scheduled_at && !t.is_completed).forEach((task: any) => {
        const d = new Date(task.scheduled_at);
        const taskItem = { ...task, _isTask: true };

        if (d < now) {
            groups.overdue.push(taskItem);
        } else if (d >= today && d < tomorrow) {
            groups.today.push(taskItem);
        } else if (d >= tomorrow && d < dayAfterTomorrow) {
            groups.tomorrow.push(taskItem);
        } else if (d >= dayAfterTomorrow && d < endOfWeek) {
            groups.thisWeek.push(taskItem);
        } else {
            groups.later.push(taskItem);
        }
    });

    // Stats
    const overdueCount = groups.overdue.length;
    const todayCount = groups.today.length;
    const upcomingCount = groups.tomorrow.length + groups.thisWeek.length + groups.later.length;
    const totalCount = overdueCount + todayCount + upcomingCount;

    const formatScheduleDate = (dateStr: string | null) => {
        if (!dateStr) return 'No date';
        const d = new Date(dateStr);
        return d.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const renderMedia = (item: any) => {
        if (item._isTask) {
            return (
                <div className="schedule-media-icon task">
                    <ListTodo size={18} />
                </div>
            );
        }

        const content = item.content as any;
        const filePath = item.file_meta?.path as string | undefined;

        if (item.type === 'image' && filePath) {
            return <ScheduleImage path={filePath} alt={item.title || 'Image'} />;
        }

        if (item.type === 'file' && filePath) {
            return (
                <div className="schedule-media-icon file">
                    <FileText size={18} />
                </div>
            );
        }

        if (item.type === 'link' && content?.image) {
            return <img src={content.image} alt="" className="schedule-media-image" loading="lazy" decoding="async" />;
        }

        if (item.type === 'folder') {
            return (
                <div className="schedule-media-icon folder">
                    <FolderClosed size={18} />
                </div>
            );
        }

        if (item.type === 'link') {
            return (
                <div className="schedule-media-icon link">
                    <Link2 size={18} />
                </div>
            );
        }

        if (item.type === 'image') {
            return (
                <div className="schedule-media-icon image">
                    <Image size={18} />
                </div>
            );
        }

        return (
            <div className="schedule-media-icon note">
                <StickyNote size={18} />
            </div>
        );
    };

    const renderScheduleCard = (item: any) => {
        const isOverdue = item.scheduled_at ? new Date(item.scheduled_at) < now && !item.is_completed : false;
        const isTask = item._isTask;
        const reminder = item.remind_before ? `${item.remind_before} min before` : null;
        const typeLabel = isTask ? 'Task' : (item.type || 'item');

        const handleClick = () => {
            if (isTask) {
                setSelectedTask(item.id);
            } else {
                setEditingItem(item);
            }
        };

        return (
            <div
                key={item.id}
                className={`schedule-card ${isOverdue ? 'overdue' : ''} ${isTask ? 'task' : ''}`}
                onClick={handleClick}
            >
                <div className="schedule-card-media">
                    {renderMedia(item)}
                </div>
                <div className="schedule-card-content">
                    <div className="schedule-card-top">
                        <span className={`schedule-card-type ${isTask ? 'task' : item.type}`}>
                            {typeLabel}
                        </span>
                        {isOverdue && <span className="schedule-card-badge">Overdue</span>}
                    </div>
                    <h4 className="schedule-card-title">{item.title || 'Untitled'}</h4>
                    <div className="schedule-card-meta">
                        <span className="schedule-meta-item schedule-date">
                            <CalendarDays size={12} />
                            {formatScheduleDate(item.scheduled_at)}
                        </span>
                        {reminder && (
                            <span className="schedule-meta-item reminder schedule-reminder">
                                <Bell size={12} />
                                {reminder}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderSection = (title: string, sectionItems: any[], colorClass: string) => {
        if (sectionItems.length === 0) return null;
        return (
            <div className={`schedule-section ${colorClass}`}>
                <div className="schedule-section-header">
                    <h3 className="schedule-section-title">{title}</h3>
                    <span className="schedule-section-count">{sectionItems.length}</span>
                </div>
                <div className="schedule-section-cards">
                    {sectionItems.map(item => renderScheduleCard(item))}
                </div>
            </div>
        );
    };

    if (totalCount === 0) {
        return (
            <div className="schedule-empty">
                <CalendarDays size={48} strokeWidth={1.5} />
                <h3>No Scheduled Items</h3>
                <p>Add due dates to your items to see them here</p>
            </div>
        );
    }

    return (
        <div className="schedule-rich-view">
            {/* Stats Header */}
            <div className="schedule-stats-bar">
                <div className="schedule-stat overdue">
                    <span className="stat-num">{overdueCount}</span>
                    <span className="stat-txt">Overdue</span>
                </div>
                <div className="schedule-stat today">
                    <span className="stat-num">{todayCount}</span>
                    <span className="stat-txt">Today</span>
                </div>
                <div className="schedule-stat upcoming">
                    <span className="stat-num">{upcomingCount}</span>
                    <span className="stat-txt">Upcoming</span>
                </div>
            </div>

            {/* Sections */}
            {renderSection('Overdue', groups.overdue, 'overdue')}
            {renderSection('Today', groups.today, 'today')}
            {renderSection('Tomorrow', groups.tomorrow, 'tomorrow')}
            {renderSection('This Week', groups.thisWeek, 'this-week')}
            {renderSection('Later', groups.later, 'later')}

            <style>{`
                .schedule-rich-view {
                    padding: 0;
                    width: 100%;
                    margin: 0;
                }
                .schedule-stats-bar {
                    display: flex;
                    gap: 16px;
                    margin: 0 0 14px;
                    padding: 16px 18px;
                    background: var(--bg-sidebar, #FAF5F0);
                    border-radius: 16px;
                    justify-content: center;
                    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
                }
                .schedule-stat {
                    text-align: center;
                    padding: 12px 24px;
                    border-radius: 12px;
                    background: white;
                    min-width: 100px;
                }
                .schedule-stat .stat-num {
                    font-size: 2rem;
                    font-weight: 700;
                    display: block;
                    line-height: 1;
                }
                .schedule-stat .stat-txt {
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    opacity: 0.7;
                }
                .schedule-stat.overdue .stat-num { color: #EF4444; }
                .schedule-stat.overdue .stat-txt { color: #EF4444; }
                .schedule-stat.today .stat-num { color: #F59E0B; }
                .schedule-stat.today .stat-txt { color: #F59E0B; }
                .schedule-stat.upcoming .stat-num { color: #3B82F6; }
                .schedule-stat.upcoming .stat-txt { color: #3B82F6; }

                .schedule-section {
                    margin-bottom: 32px;
                }
                .schedule-section-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin: 0 2px 10px;
                }
                .schedule-section-title {
                    font-size: 1.25rem;
                    font-weight: 700;
                    margin: 0;
                    color: var(--text-primary);
                }
                .schedule-section.overdue .schedule-section-title { color: #EF4444; }
                .schedule-section.today .schedule-section-title { color: #F59E0B; }
                .schedule-section.tomorrow .schedule-section-title { color: #10B981; }
                .schedule-section.this-week .schedule-section-title { color: #8B5CF6; }
                
                .schedule-section-count {
                    font-size: 0.8rem;
                    font-weight: 600;
                    background: var(--bg-secondary, #F3F4F6);
                    padding: 4px 10px;
                    border-radius: 999px;
                    color: var(--text-muted);
                }

                .schedule-section-cards {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    padding: 0;
                }

                .schedule-card {
                    display: grid;
                    grid-template-columns: 100px 1fr;
                    column-gap: 14px;
                    background: white;
                    border: 1px solid rgba(0, 0, 0, 0.06);
                    border-radius: 16px;
                    padding: 14px;
                    cursor: pointer;
                    transition: transform 0.15s ease, box-shadow 0.15s ease;
                    width: 100%;
                    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
                }
                .schedule-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
                }
                .schedule-card.overdue {
                    border-color: rgba(239, 68, 68, 0.35);
                    background: #FFF5F5;
                }
                .schedule-card.task {
                    border-color: rgba(99, 102, 241, 0.35);
                }

                .schedule-card-media {
                    border-radius: 10px;
                    overflow: hidden;
                    background: #F3F4F6;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    aspect-ratio: 1;
                    min-height: 80px;
                    max-height: 100px;
                }
                .schedule-media-image {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    display: block;
                }
                .schedule-media-fallback {
                    width: 100%;
                    height: 100%;
                    background: #F3F4F6;
                }
                .schedule-media-icon {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #4B5563;
                    background: #F3F4F6;
                }
                .schedule-media-icon.task { background: rgba(99, 102, 241, 0.12); color: #6366F1; }
                .schedule-media-icon.folder { background: rgba(245, 158, 11, 0.12); color: #F59E0B; }
                .schedule-media-icon.link { background: rgba(59, 130, 246, 0.12); color: #3B82F6; }
                .schedule-media-icon.image { background: rgba(16, 185, 129, 0.12); color: #10B981; }
                .schedule-media-icon.file { background: rgba(100, 116, 139, 0.12); color: #64748B; }

                .schedule-card-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    min-width: 0;
                    gap: 6px;
                }
                .schedule-card-top {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 2px;
                }
                .schedule-card-type {
                    font-size: 0.65rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-muted);
                }
                .schedule-card-type.task { color: #6366F1; }
                .schedule-card-badge {
                    font-size: 0.65rem;
                    font-weight: 700;
                    color: #EF4444;
                    background: rgba(239, 68, 68, 0.12);
                    padding: 2px 8px;
                    border-radius: 999px;
                }
                .schedule-card-title {
                    margin: 0 0 6px;
                    font-size: 1rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .schedule-card-meta {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    justify-content: space-between;
                    width: 100%;
                }
                .schedule-meta-item {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.8rem;
                    color: var(--text-muted);
                }
                .schedule-meta-item.schedule-date {
                    margin-left: auto;
                    padding: 6px 10px;
                    background: #F8FAFC;
                    border-radius: 10px;
                    border: 1px solid rgba(59, 130, 246, 0.12);
                }
                .schedule-meta-item.reminder { color: #F59E0B; }
                .schedule-meta-item.schedule-reminder {
                    padding: 6px 10px;
                    background: rgba(245, 158, 11, 0.12);
                    border-radius: 10px;
                    border: 1px solid rgba(245, 158, 11, 0.2);
                }

                .schedule-empty {
                    text-align: center;
                    padding: 80px 20px;
                    color: var(--text-muted);
                }
                .schedule-empty h3 {
                    margin: 16px 0 8px;
                    font-size: 1.25rem;
                    color: var(--text-secondary);
                }
                .schedule-empty p {
                    margin: 0;
                    font-size: 0.9rem;
                }

                @media (max-width: 768px) {
                    .schedule-rich-view {
                        padding: 0;
                    }
                    .schedule-stats-bar {
                        gap: 8px;
                        padding: 12px;
                        margin: 0 0 16px;
                    }
                    .schedule-stat {
                        padding: 10px 16px;
                        min-width: auto;
                        flex: 1;
                    }
                    .schedule-stat .stat-num {
                        font-size: 1.5rem;
                    }
                    .schedule-stat .stat-txt {
                        font-size: 0.65rem;
                    }
                    .schedule-section-title {
                        font-size: 1.1rem;
                    }
                    .schedule-card {
                        padding: 12px;
                        grid-template-columns: 80px 1fr;
                    }
                    .schedule-card-media {
                        min-height: 64px;
                        max-height: 70px;
                    }
                    .schedule-card-content {
                        gap: 4px;
                    }
                    .schedule-card-meta {
                        flex-direction: column;
                        gap: 4px;
                    }
                }
            `}</style>
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

    // High-Performance Memoized Filter
    const { items: filteredItems, tasks: filteredTasks } = useFilteredItems();

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
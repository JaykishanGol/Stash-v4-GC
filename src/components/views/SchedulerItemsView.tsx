import { useState, useEffect } from 'react';
import {
    StickyNote,
    FileText,
    Image,
    Link2,
    FolderClosed,
    Bell,
    CalendarDays,
    ListTodo
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { supabase, STORAGE_BUCKET } from '../../lib/supabase';
import '../../styles/scheduler-items.css';

// Shared cache to avoid thumbnail flicker
const scheduleUrlCache = new Map<string, { url: string; expiry: number }>();

export function ScheduleImage({ path, alt }: { path: string; alt: string }) {
    const user = useAppStore((s) => s.user);
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

        // Skip storage API if user is not authenticated (prevents 400 errors)
        if (!user || user.id === 'demo') {
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
    }, [path, user]);

    if (!src) return <div className="schedule-media-fallback" />;
    return <img src={src} alt={alt} className="schedule-media-image" loading="lazy" decoding="async" />;
}

interface SchedulerItemsViewProps {
    items: any[];
    tasks: any[];
    viewType: 'scheduled' | 'overdue';
}

export function SchedulerItemsView({ items, tasks, viewType: _viewType }: SchedulerItemsViewProps) {
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
                <div className="schedule-media-icon task" style={{ background: '#E0E7FF', color: '#4F46E5' }}>
                    <ListTodo size={20} />
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
                <div className="schedule-media-icon file" style={{ background: '#F1F5F9', color: '#475569' }}>
                    <FileText size={20} />
                </div>
            );
        }

        if (item.type === 'link' && content?.image) {
            return <img src={content.image} alt="" className="schedule-media-image" loading="lazy" decoding="async" />;
        }

        if (item.type === 'folder') {
            return (
                <div className="schedule-media-icon folder" style={{ background: '#FEF3C7', color: '#D97706' }}>
                    <FolderClosed size={20} />
                </div>
            );
        }

        if (item.type === 'link') {
            return (
                <div className="schedule-media-icon link" style={{ background: '#DBEAFE', color: '#2563EB' }}>
                    <Link2 size={20} />
                </div>
            );
        }

        if (item.type === 'image') {
            return (
                <div className="schedule-media-icon image" style={{ background: '#D1FAE5', color: '#059669' }}>
                    <Image size={20} />
                </div>
            );
        }

        return (
            <div className="schedule-media-icon note" style={{ background: '#FEF9C3', color: '#CA8A04' }}>
                <StickyNote size={20} />
            </div>
        );
    };

    const renderScheduleCard = (item: any) => {
        const isOverdue = item.scheduled_at ? new Date(item.scheduled_at) < now && !item.is_completed : false;
        const isTask = item._isTask;
        const reminder = item.remind_before ? `${item.remind_before}m prior` : null;
        const typeLabel = isTask ? 'Task' : (item.type || 'item');
        const priority = item.priority || (item._isTask ? null : 'none');

        // Extract time for large display
        const timeObj = item.scheduled_at ? new Date(item.scheduled_at) : null;
        const timeString = timeObj ? timeObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';

        const handleClick = () => {
            if (isTask) {
                setSelectedTask(item.id);
            } else {
                setEditingItem(item);
            }
        };

        const getPriorityColor = (p: string) => {
            if (p === 'high') return '#EF4444';
            if (p === 'medium') return '#F59E0B';
            if (p === 'low') return '#3B82F6';
            return 'transparent';
        };

        return (
            <div
                key={item.id}
                className={`schedule-card ${isOverdue ? 'overdue' : ''} ${isTask ? 'task' : ''}`}
                onClick={handleClick}
            >
                {/* 1. Icon / Media */}
                <div className="schedule-card-media">
                    {renderMedia(item)}
                </div>

                {/* 2. Main Content */}
                <div className="schedule-card-content">
                    <div className="schedule-card-top">
                        <span className={`schedule-card-type ${isTask ? 'task' : item.type}`}>
                            {typeLabel}
                        </span>
                        {isOverdue && <span className="schedule-card-badge">Overdue</span>}
                    </div>
                    <h4 className="schedule-card-title">{item.title || 'Untitled'}</h4>
                    {!isTask && !reminder && (
                        <div className="schedule-card-meta">
                            {/* Empty meta placeholder if needed */}
                        </div>
                    )}
                </div>

                {/* 3. Large Time Display (Right Side) */}
                <div className="schedule-card-time">
                    <div className="time-primary">
                        <span className="time-large">{timeString}</span>
                        {priority && priority !== 'none' && (
                            <div
                                className="priority-indicator"
                                style={{ background: getPriorityColor(priority) }}
                                title={`${priority} priority`}
                            />
                        )}
                    </div>

                    <div className="time-secondary">
                        <span className="date-small">{formatScheduleDate(item.scheduled_at).split(',')[0]}</span>
                        {reminder && (
                            <span className="reminder-badge">
                                <Bell size={10} fill="currentColor" />
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
        </div>
    );
}

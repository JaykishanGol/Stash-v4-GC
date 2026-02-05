import { useAppStore } from '../../store/useAppStore';
import type { Task } from '../../lib/types';
import { CheckCircle2, Bell, Trash2, Calendar } from 'lucide-react';
import { getRelativeTime } from '../../hooks/useKeyboardNavigation';

interface TaskCardProps {
    task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
    const { openContextMenu, toggleTaskCompletion, openScheduler, deleteTask, setSelectedTask } = useAppStore();

    const completedCount = Object.values(task.item_completion || {}).filter(Boolean).length;
    const totalCount = (task.item_ids || []).length;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        openContextMenu(e.clientX, e.clientY, task.id);
    };

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedTask(task.id);
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Delete this task?')) {
            deleteTask(task.id);
        }
    };

    const handleSchedule = (e: React.MouseEvent) => {
        e.stopPropagation();
        openScheduler(task.id);
    };

    // Date indicators
    const now = new Date();
    const scheduledDate = task.scheduled_at ? new Date(task.scheduled_at) : null;
    const reminderDate = scheduledDate && task.remind_before
        ? new Date(scheduledDate.getTime() - task.remind_before * 60 * 1000)
        : null;
    const isOverdue = scheduledDate && scheduledDate < now && !task.is_completed;

    const formatDateTime = (date: Date) => {
        const isToday = date.toDateString() === now.toDateString();
        const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        return isToday ? timeStr : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return (
        <div
            className="card task-card"
            onClick={handleEdit} // Clicking card opens it
            onContextMenu={handleContextMenu}
            style={{ borderLeft: `4px solid ${task.color || '#F59E0B'}` }}
        >
            <div className="task-card-header">
                <div className="task-card-title-row">
                    <button
                        className={`task-check-btn ${task.is_completed ? 'completed' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleTaskCompletion(task.id); }}
                        aria-label={task.is_completed ? 'Mark task incomplete' : 'Mark task complete'}
                    >
                        <CheckCircle2 size={18} />
                    </button>
                    <span className={`task-title ${task.is_completed ? 'completed' : ''}`}>
                        {task.title}
                    </span>
                </div>

                {/* Quick Actions (Hover) */}
                <div className="task-quick-actions">
                    <button onClick={handleSchedule} title="Schedule"><Calendar size={14} /></button>
                    <button onClick={handleDelete} title="Delete"><Trash2 size={14} /></button>
                </div>
            </div>

            {/* Progress Bar */}
            {totalCount > 0 && (
                <div className="task-progress-wrapper">
                    <div className="task-progress-bar">
                        <div className="task-progress-fill" style={{ width: `${progress}%`, background: task.color || '#F59E0B' }} />
                    </div>
                    <span className="task-progress-text">{completedCount}/{totalCount}</span>
                </div>
            )}

            {/* Meta Row */}
            <div className="task-meta-row">
                <div className="task-dates">
                    {scheduledDate && (
                        <span className={`task-date ${isOverdue ? 'overdue' : ''}`}>
                            <Calendar size={12} /> {formatDateTime(scheduledDate)}
                        </span>
                    )}
                    {reminderDate && (
                        <span className="task-date reminder">
                            <Bell size={12} /> {formatDateTime(reminderDate)}
                        </span>
                    )}
                </div>
                <span className="task-updated">{getRelativeTime(task.updated_at)}</span>
            </div>

            <style>{`
                .task-card {
                    display: flex;
                    flex-direction: column;
                    padding: 16px;
                    gap: 12px;
                    background: white;
                    position: relative;
                }
                .task-card:hover .task-quick-actions {
                    opacity: 1;
                }
                .task-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                }
                .task-card-title-row {
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                    flex: 1;
                }
                .task-check-btn {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 2px;
                    transition: color 0.2s;
                    flex-shrink: 0;
                }
                .task-check-btn:hover {
                    color: var(--success);
                }
                .task-check-btn.completed {
                    color: var(--success);
                }
                .task-title {
                    font-weight: 600;
                    font-size: 0.95rem;
                    color: var(--text-primary);
                    line-height: 1.4;
                }
                .task-title.completed {
                    text-decoration: line-through;
                    color: var(--text-muted);
                }
                
                .task-quick-actions {
                    display: flex;
                    gap: 4px;
                    opacity: 0;
                    transition: opacity 0.2s;
                }
                .task-quick-actions button {
                    background: none;
                    border: none;
                    padding: 4px;
                    color: var(--text-muted);
                    cursor: pointer;
                    border-radius: 4px;
                }
                .task-quick-actions button:hover {
                    background: var(--bg-hover);
                    color: var(--text-primary);
                }

                .task-progress-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .task-progress-bar {
                    flex: 1;
                    height: 4px;
                    background: var(--bg-hover);
                    border-radius: 2px;
                    overflow: hidden;
                }
                .task-progress-fill {
                    height: 100%;
                    border-radius: 2px;
                    transition: width 0.3s ease;
                }
                .task-progress-text {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    font-weight: 500;
                }

                .task-meta-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: auto;
                    padding-top: 8px;
                    border-top: 1px solid rgba(0,0,0,0.05);
                }
                .task-dates {
                    display: flex;
                    gap: 8px;
                }
                .task-date {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    background: var(--bg-hover);
                    padding: 2px 6px;
                    border-radius: 4px;
                }
                .task-date.overdue {
                    color: var(--error);
                    background: #FEF2F2;
                }
                .task-date.reminder {
                    color: var(--info);
                    background: #EFF6FF;
                }
                .task-updated {
                    font-size: 0.7rem;
                    color: var(--text-muted);
                }
            `}</style>
        </div>
    );
}

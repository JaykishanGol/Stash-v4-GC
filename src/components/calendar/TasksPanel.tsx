import { useState, useEffect } from 'react';
import { format, isToday, isTomorrow, isPast, isYesterday } from 'date-fns';
import { Plus, ChevronDown, ChevronRight, Circle, CheckCircle2, Calendar, Cloud } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { GoogleClient, type GoogleTask } from '../../lib/googleClient';
import { supabase } from '../../lib/supabase';
import type { Task } from '../../lib/types';

interface UnifiedTask {
    id: string;
    title: string;
    due_at?: string | null;
    is_completed: boolean;
    type: 'local' | 'google';
    originalData?: Task | GoogleTask;
}

export function TasksPanel() {
    const { tasks, addTask, toggleTaskCompletion, openScheduler, user } = useAppStore();
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [showCompleted, setShowCompleted] = useState(false);
    const [googleTasks, setGoogleTasks] = useState<GoogleTask[]>([]);
    const [hasGoogleAuth, setHasGoogleAuth] = useState(false);

    // Fetch Google Tasks
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.provider_token) {
                setHasGoogleAuth(true);
                GoogleClient.listAllTasks().then(setGoogleTasks).catch(console.error);
            }
        });
    }, []);

    // Convert to unified format
    const unifiedTasks: UnifiedTask[] = [
        // Local tasks
        ...tasks.filter(t => !t.deleted_at).map(t => ({
            id: t.id,
            title: t.title,
            due_at: t.due_at,
            is_completed: t.is_completed,
            type: 'local' as const,
            originalData: t
        })),
        // Google tasks
        ...googleTasks.map(gt => ({
            id: `google-${gt.id}`,
            title: gt.title,
            due_at: gt.due,
            is_completed: gt.status === 'completed',
            type: 'google' as const,
            originalData: gt
        }))
    ];

    // Filter active and completed
    const activeTasks = unifiedTasks.filter(t => !t.is_completed);
    const completedTasks = unifiedTasks.filter(t => t.is_completed);

    // Group active by deadline
    const noDeadline = activeTasks.filter(t => !t.due_at);
    const withDeadline = activeTasks.filter(t => t.due_at).sort((a, b) =>
        new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()
    );

    const handleAddTask = () => {
        if (!newTaskTitle.trim()) return;
        addTask({
            title: newTaskTitle,
            description: null,
            color: '#ffffff',
            priority: 'none',
            due_at: null,
            reminder_type: 'none',
            one_time_at: null,
            recurring_config: null,
            next_trigger_at: null,
            last_acknowledged_at: null,
            remind_at: null,
            reminder_recurring: null,
            item_ids: [],
            item_completion: {},
            is_completed: false,
            user_id: user?.id || '',
        });
        setNewTaskTitle('');
    };

    const getDeadlineLabel = (dueAt: string) => {
        const date = new Date(dueAt);
        if (isToday(date)) return 'Today';
        if (isTomorrow(date)) return 'Tomorrow';
        if (isYesterday(date)) return 'Yesterday';
        if (isPast(date)) return format(date, 'MMM d');
        return format(date, 'EEE, MMM d');
    };

    const getDeadlineColor = (dueAt: string) => {
        const date = new Date(dueAt);
        if (isPast(date) && !isToday(date)) return '#D93025';
        if (isToday(date)) return '#1A73E8';
        return '#5F6368';
    };

    const handleTaskClick = (task: UnifiedTask) => {
        if (task.type === 'local') {
            openScheduler(task.id);
        }
        // Google tasks - could open in Google Tasks in future
    };

    const handleToggle = (task: UnifiedTask) => {
        if (task.type === 'local') {
            toggleTaskCompletion(task.id);
        }
        // For Google tasks, would need GoogleClient.updateTask
    };

    const TaskItem = ({ task }: { task: UnifiedTask }) => (
        <div className="task-item" onClick={() => handleTaskClick(task)}>
            <button
                className="task-check"
                onClick={(e) => { e.stopPropagation(); handleToggle(task); }}
            >
                {task.is_completed
                    ? <CheckCircle2 size={20} color="#10B981" />
                    : <Circle size={20} color="#5F6368" />
                }
            </button>
            <div className="task-content">
                <div className="task-title-row">
                    <span className={`task-title ${task.is_completed ? 'completed' : ''}`}>
                        {task.title}
                    </span>
                    {task.type === 'google' && <span title="Google Task"><Cloud size={12} color="#1A73E8" /></span>}
                </div>
                {task.due_at && (
                    <span className="task-deadline" style={{ color: getDeadlineColor(task.due_at) }}>
                        <Calendar size={12} />
                        {getDeadlineLabel(task.due_at)}
                    </span>
                )}
            </div>
        </div>
    );

    return (
        <div className="tasks-panel">
            <div className="tasks-header">
                <span className="tasks-label">TASKS</span>
                <span className="tasks-list-name">
                    My Tasks
                    {hasGoogleAuth && <Cloud size={14} color="#1A73E8" style={{ marginLeft: 6 }} />}
                </span>
            </div>

            {/* Add Task */}
            <div className="add-task-row">
                <Plus size={20} color="#1A73E8" />
                <input
                    type="text"
                    placeholder="Add a task"
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                />
            </div>

            {/* No Deadline Tasks */}
            {noDeadline.length > 0 && (
                <div className="task-group">
                    <div className="group-header">No deadline</div>
                    {noDeadline.map(task => <TaskItem key={task.id} task={task} />)}
                </div>
            )}

            {/* Tasks with Deadline */}
            {withDeadline.map(task => <TaskItem key={task.id} task={task} />)}

            {/* Completed Section */}
            {completedTasks.length > 0 && (
                <div className="completed-section">
                    <button
                        className="completed-toggle"
                        onClick={() => setShowCompleted(!showCompleted)}
                    >
                        {showCompleted ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <span>Completed ({completedTasks.length})</span>
                    </button>
                    {showCompleted && completedTasks.map(task => <TaskItem key={task.id} task={task} />)}
                </div>
            )}

            <style>{`
                .tasks-panel {
                    width: 300px;
                    min-width: 300px;
                    background: var(--bg-sidebar);
                    border-left: 1px solid var(--border-light);
                    display: flex;
                    flex-direction: column;
                    overflow-y: auto;
                }

                .tasks-header {
                    padding: 16px 20px;
                    border-bottom: 1px solid var(--border-light);
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .tasks-label {
                    font-size: 11px;
                    font-weight: 600;
                    color: var(--text-muted);
                    letter-spacing: 0.1em;
                }
                .tasks-list-name {
                    font-size: 14px;
                    font-weight: 500;
                    color: var(--text-primary);
                    display: flex;
                    align-items: center;
                }

                .add-task-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 20px;
                    border-bottom: 1px solid var(--border-light);
                }
                .add-task-row input {
                    flex: 1;
                    border: none;
                    background: none;
                    outline: none;
                    font-size: 14px;
                    color: var(--text-primary);
                }
                .add-task-row input::placeholder { color: #1A73E8; }

                .task-group { padding: 8px 0; }
                .group-header {
                    padding: 8px 20px;
                    font-size: 12px;
                    font-weight: 500;
                    color: var(--text-muted);
                }

                .task-item {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    padding: 10px 20px;
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .task-item:hover { background: rgba(0,0,0,0.03); }
                .task-check {
                    padding: 0;
                    border: none;
                    background: none;
                    cursor: pointer;
                    flex-shrink: 0;
                }
                .task-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    min-width: 0;
                }
                .task-title-row {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .task-title {
                    font-size: 14px;
                    color: var(--text-primary);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .task-title.completed {
                    text-decoration: line-through;
                    color: var(--text-muted);
                }
                .task-deadline {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                }

                .completed-section {
                    border-top: 1px solid var(--border-light);
                    margin-top: auto;
                }
                .completed-toggle {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    width: 100%;
                    padding: 12px 20px;
                    border: none;
                    background: none;
                    font-size: 13px;
                    color: var(--text-secondary);
                    cursor: pointer;
                    text-align: left;
                }
                .completed-toggle:hover { background: rgba(0,0,0,0.03); }
            `}</style>
        </div>
    );
}

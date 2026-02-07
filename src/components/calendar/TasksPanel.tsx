import { useState, useEffect, useRef } from 'react';
import { format, isToday, isTomorrow, isPast, isYesterday } from 'date-fns';
import { Plus, ChevronDown, ChevronRight, Circle, CheckCircle2, Calendar, Cloud, GripVertical, StickyNote, FileText, Image, Link2, FolderClosed } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Draggable } from '@fullcalendar/interaction';
import type { Task } from '../../lib/types';

interface UnifiedTask {
    id: string;
    title: string;
    due_at?: string | null;
    is_completed: boolean;
    type: 'local';
    originalData?: Task;
}

export function TasksPanel() {
    const { tasks, items, addTask, toggleTaskCompletion, openScheduler, user } = useAppStore();
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [showCompleted, setShowCompleted] = useState(false);
    const [activeTab, setActiveTab] = useState<'tasks' | 'items'>('tasks');
    const [itemFilter, setItemFilter] = useState<'note' | 'file' | 'image' | 'link' | 'folder'>('note');

    // Refs for FullCalendar Draggable initialization
    const taskListRef = useRef<HTMLDivElement>(null);
    const itemListRef = useRef<HTMLDivElement>(null);

    // Initialize FullCalendar Draggable on task list container
    useEffect(() => {
        if (activeTab !== 'tasks' || !taskListRef.current) return;
        const draggable = new Draggable(taskListRef.current, {
            itemSelector: '.fc-external-event',
            eventData(eventEl) {
                const id = eventEl.getAttribute('data-item-id') || '';
                const title = eventEl.getAttribute('data-title') || '';
                const isTask = eventEl.getAttribute('data-is-task') === 'true';
                const color = eventEl.getAttribute('data-color') || '#039be5';
                return {
                    title,
                    duration: '00:30',
                    backgroundColor: color,
                    borderColor: color,
                    textColor: '#ffffff',
                    extendedProps: { externalItemId: id, externalIsTask: isTask },
                };
            },
        });
        return () => draggable.destroy();
    }, [activeTab]);

    // Initialize FullCalendar Draggable on items list container
    useEffect(() => {
        if (activeTab !== 'items' || !itemListRef.current) return;
        const draggable = new Draggable(itemListRef.current, {
            itemSelector: '.fc-external-event',
            eventData(eventEl) {
                const id = eventEl.getAttribute('data-item-id') || '';
                const title = eventEl.getAttribute('data-title') || '';
                const color = eventEl.getAttribute('data-color') || '#4285f4';
                return {
                    title,
                    duration: '00:30',
                    backgroundColor: color,
                    borderColor: color,
                    textColor: '#ffffff',
                    extendedProps: { externalItemId: id, externalIsTask: false },
                };
            },
        });
        return () => draggable.destroy();
    }, [activeTab]);

    // Filter items for "Items" tab
    const typeColors: Record<string, string> = {
        note: '#4285f4', link: '#0b8043', image: '#8e24aa', file: '#616161', folder: '#f4b400',
    };
    const filteredItems = items.filter(i => !i.deleted_at && i.type === itemFilter);
    const itemCounts = {
        note: items.filter(i => i.type === 'note' && !i.deleted_at).length,
        file: items.filter(i => i.type === 'file' && !i.deleted_at).length,
        image: items.filter(i => i.type === 'image' && !i.deleted_at).length,
        link: items.filter(i => i.type === 'link' && !i.deleted_at).length,
        folder: items.filter(i => i.type === 'folder' && !i.deleted_at).length,
    };

    // Convert to unified format
    const unifiedTasks: UnifiedTask[] = [
        // Canonical source: local mirrored tasks only
        ...tasks.filter(t => !t.deleted_at).map(t => ({
            id: t.id,
            title: t.title,
            due_at: t.scheduled_at,
            is_completed: t.is_completed,
            type: 'local' as const,
            originalData: t
        })),
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
            scheduled_at: null,
            remind_before: null,
            recurring_config: null,
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
        openScheduler(task.id);
    };

    const handleToggle = (task: UnifiedTask) => {
        toggleTaskCompletion(task.id);
    };

    const TaskItem = ({ task }: { task: UnifiedTask }) => {
        const isGoogleLinked = !!task.originalData?.google_etag;
        return (
        <div
            className="task-item fc-external-event"
            data-item-id={task.id}
            data-title={task.title}
            data-is-task="true"
            data-color="#039be5"
            onClick={() => handleTaskClick(task)}
        >
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
                    {isGoogleLinked && <span title="Google-synced task"><Cloud size={12} color="#1A73E8" /></span>}
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
    };

    return (
        <div className="tasks-panel">
            <div className="tasks-header">
                {/* Tab switcher: Tasks | Items */}
                <div className="panel-tabs">
                    <button
                        className={`panel-tab ${activeTab === 'tasks' ? 'active' : ''}`}
                        onClick={() => setActiveTab('tasks')}
                    >
                        Tasks
                    </button>
                    <button
                        className={`panel-tab ${activeTab === 'items' ? 'active' : ''}`}
                        onClick={() => setActiveTab('items')}
                    >
                        Items
                    </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 0 0' }}>
                    <GripVertical size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                    Drag onto calendar to schedule
                </div>
            </div>

            {activeTab === 'tasks' ? (
                <>
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

                    <div ref={taskListRef} style={{ flex: 1, overflowY: 'auto' }}>
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
                    </div>
                </>
            ) : (
                <>
                    {/* Item type filter */}
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
                        <div style={{ display: 'flex', padding: 3, background: 'var(--bg-app)', borderRadius: 8, border: '1px solid var(--border-light)', gap: 2 }}>
                            {(['note', 'file', 'image', 'link', 'folder'] as const).map(f => {
                                const Icon = f === 'note' ? StickyNote : f === 'file' ? FileText : f === 'image' ? Image : f === 'link' ? Link2 : FolderClosed;
                                return (
                                    <button
                                        key={f}
                                        onClick={() => setItemFilter(f)}
                                        title={f.charAt(0).toUpperCase() + f.slice(1)}
                                        style={{
                                            flex: 1, height: 32, padding: 0, borderRadius: 6, border: 'none',
                                            background: itemFilter === f ? 'var(--bg-content)' : 'transparent',
                                            color: itemFilter === f ? 'var(--text-primary)' : 'var(--text-secondary)',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            boxShadow: itemFilter === f ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                            transition: 'all 0.15s ease', position: 'relative',
                                        }}
                                    >
                                        <Icon size={15} />
                                        {itemCounts[f] > 0 && (
                                            <span style={{ position: 'absolute', top: 5, right: 5, width: 5, height: 5, borderRadius: '50%', background: itemFilter === f ? 'var(--accent)' : 'var(--text-muted)', opacity: itemFilter === f ? 1 : 0.4 }} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 6, fontWeight: 500 }}>
                            {itemFilter.charAt(0).toUpperCase() + itemFilter.slice(1)}s ({itemCounts[itemFilter]})
                        </div>
                    </div>

                    <div ref={itemListRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {filteredItems.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                <GripVertical size={20} style={{ opacity: 0.3 }} />
                                <span style={{ fontSize: '0.85rem' }}>No {itemFilter}s found</span>
                            </div>
                        ) : (
                            filteredItems.map(item => (
                                <div
                                    key={item.id}
                                    className="fc-external-event item-drag-card"
                                    data-item-id={item.id}
                                    data-title={item.title || 'Untitled'}
                                    data-is-task="false"
                                    data-color={typeColors[item.type] || '#4285f4'}
                                    style={{
                                        cursor: 'grab', background: 'var(--bg-content)', padding: '8px 10px',
                                        borderRadius: 8, border: '1px solid var(--border-light)',
                                        boxShadow: 'var(--shadow-xs)', transition: 'all 0.15s ease',
                                        display: 'flex', alignItems: 'center', gap: 10,
                                    }}
                                >
                                    <GripVertical size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                    <div style={{
                                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                        background: typeColors[item.type] || '#4285f4',
                                    }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.83rem', color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {item.title || 'Untitled'}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                            {item.type}{item.scheduled_at ? ' · Scheduled' : ''}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}

            <style>{`
                .tasks-panel {
                    width: 300px;
                    min-width: 300px;
                    background: var(--bg-sidebar);
                    border-left: 1px solid var(--border-light);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .tasks-header {
                    padding: 12px 16px;
                    border-bottom: 1px solid var(--border-light);
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .panel-tabs {
                    display: flex;
                    gap: 0;
                    background: var(--bg-app);
                    border-radius: 8px;
                    padding: 3px;
                    border: 1px solid var(--border-light);
                }
                .panel-tab {
                    flex: 1;
                    padding: 6px 12px;
                    border: none;
                    border-radius: 6px;
                    background: transparent;
                    font-size: 13px;
                    font-weight: 500;
                    color: var(--text-secondary);
                    cursor: pointer;
                    transition: all 0.15s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                }
                .panel-tab.active {
                    background: var(--bg-content);
                    color: var(--text-primary);
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }
                .panel-tab:hover:not(.active) {
                    color: var(--text-primary);
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
                    cursor: grab;
                    transition: background 0.15s;
                }
                .task-item:hover { background: rgba(0,0,0,0.03); }
                .task-item:active { cursor: grabbing; }
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

                .item-drag-card:hover {
                    box-shadow: var(--shadow-md);
                    transform: translateY(-1px);
                    border-color: var(--border-medium) !important;
                }
                .item-drag-card:active {
                    cursor: grabbing !important;
                    transform: scale(0.98);
                }
            `}</style>
        </div>
    );
}

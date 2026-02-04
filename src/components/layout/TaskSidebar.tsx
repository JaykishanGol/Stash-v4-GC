import { useState } from 'react';
import { Check, Plus, Trash2, Calendar, Circle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export function TaskSidebar() {
    const { tasks, addTask, deleteTask, toggleTaskCompletion, user } = useAppStore();
    const [newTaskTitle, setNewTaskTitle] = useState('');

    const completedTasks = tasks.filter(t => t.is_completed);
    const pendingTasks = tasks.filter(t => !t.is_completed).sort((a, b) => {
        // Sort by scheduled_at if exists, otherwise created_at
        if (a.scheduled_at && b.scheduled_at) return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
        if (a.scheduled_at) return -1;
        if (b.scheduled_at) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const handleAddTask = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTaskTitle.trim()) return;

        addTask({
            user_id: user?.id || 'demo',
            title: newTaskTitle.trim(),
            description: null,
            color: '#F59E0B',
            priority: 'none',
            scheduled_at: null,
            remind_before: null,
            recurring_config: null,
            item_ids: [],
            item_completion: {},
            is_completed: false,
        });
        setNewTaskTitle('');
    };

    return (
        <aside className="task-sidebar">
            <div className="task-header">
                <h2>Tasks</h2>
                <span className="task-count">{pendingTasks.length} pending</span>
            </div>

            <form className="task-input-form" onSubmit={handleAddTask}>
                <input
                    type="text"
                    placeholder="Add a task..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="task-input"
                />
                <button type="submit" disabled={!newTaskTitle.trim()} className="task-add-btn">
                    <Plus size={18} />
                </button>
            </form>

            <div className="task-list">
                {pendingTasks.length === 0 && completedTasks.length === 0 && (
                    <div className="empty-tasks">
                        <Check size={48} className="empty-icon" />
                        <p>No tasks yet</p>
                        <span>Stay organized by adding tasks here</span>
                    </div>
                )}

                {pendingTasks.map(task => (
                    <div key={task.id} className="task-item">
                        <button
                            className="task-checkbox"
                            onClick={() => toggleTaskCompletion(task.id)}
                        >
                            <Circle size={18} />
                        </button>
                        <div className="task-content">
                            <span className="task-title">{task.title}</span>
                            {task.scheduled_at && (
                                <span className="task-date">
                                    <Calendar size={12} />
                                    {new Date(task.scheduled_at).toLocaleDateString()}
                                </span>
                            )}
                        </div>
                        <button
                            className="task-delete-btn"
                            onClick={() => deleteTask(task.id)}
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}

                {completedTasks.length > 0 && (
                    <div className="completed-section">
                        <h3 className="completed-title">Completed ({completedTasks.length})</h3>
                        {completedTasks.map(task => (
                            <div key={task.id} className="task-item completed">
                                <button
                                    className="task-checkbox checked"
                                    onClick={() => toggleTaskCompletion(task.id)}
                                >
                                    <Check size={14} />
                                </button>
                                <span className="task-title">{task.title}</span>
                                <button
                                    className="task-delete-btn"
                                    onClick={() => deleteTask(task.id)}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <style>{`
                .task-sidebar {
                    width: 300px;
                    border-left: 1px solid var(--border-light);
                    background: var(--bg-card);
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                }
                .task-header {
                    padding: 20px;
                    border-bottom: 1px solid var(--border-light);
                    display: flex;
                    justify-content: space-between;
                    align-items: baseline;
                }
                .task-header h2 {
                    font-size: 1.1rem;
                    font-weight: 600;
                    margin: 0;
                }
                .task-count {
                    font-size: 0.8rem;
                    color: var(--text-muted);
                }
                .task-input-form {
                    padding: 16px;
                    display: flex;
                    gap: 8px;
                }
                .task-input {
                    flex: 1;
                    padding: 8px 12px;
                    border-radius: 6px;
                    border: 1px solid var(--border-light);
                    background: var(--bg-app);
                    color: var(--text-primary);
                    font-size: 0.9rem;
                }
                .task-add-btn {
                    padding: 8px;
                    border-radius: 6px;
                    background: var(--accent);
                    color: white;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .task-add-btn:disabled {
                    opacity: 0.5;
                    cursor: default;
                }
                .task-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 0 16px 16px;
                }
                .task-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 0;
                    group: true;
                }
                .task-item:hover .task-delete-btn {
                    opacity: 1;
                }
                .task-checkbox {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 2px;
                    display: flex;
                }
                .task-checkbox.checked {
                    color: var(--accent);
                }
                .task-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }
                .task-title {
                    font-size: 0.9rem;
                    color: var(--text-primary);
                }
                .completed .task-title {
                    text-decoration: line-through;
                    color: var(--text-muted);
                }
                .task-date {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    margin-top: 2px;
                }
                .task-delete-btn {
                    opacity: 0;
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 4px;
                    transition: opacity 0.2s;
                }
                .task-delete-btn:hover {
                    color: #EF4444;
                }
                .completed-section {
                    margin-top: 24px;
                    padding-top: 16px;
                    border-top: 1px solid var(--border-light);
                }
                .completed-title {
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: var(--text-muted);
                    margin-bottom: 8px;
                    text-transform: uppercase;
                }
                .empty-tasks {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 48px 0;
                    color: var(--text-muted);
                    text-align: center;
                }
                .empty-icon {
                    margin-bottom: 16px;
                    opacity: 0.2;
                }
            `}</style>
        </aside>
    );
}

import * as React from 'react';
import { useState, useMemo } from 'react';
import {
    Plus,
    CheckCircle2,
    StickyNote,
    Link2,
    Image,
    FileText,
    Folder,
    Clock,
    Grid,
    List,
} from 'lucide-react';
import Masonry from 'react-masonry-css';
import { useAppStore } from '../../store/useAppStore';
import type { Task, Item } from '../../lib/types';
import { ItemCard } from '../cards/ItemCard';

// Task colors for picker
const TASK_COLORS = [
    '#FDE68A', // yellow
    '#FFB5A7', // coral
    '#BFDBFE', // blue
    '#FBCFE8', // pink
    '#86EFAC', // green
    '#DDD6FE', // purple
    '#99F6E4', // teal
    '#FFFFFF', // white
];

const TYPE_ICONS: Record<string, any> = {
    note: StickyNote,
    link: Link2,
    image: Image,
    file: FileText,
    folder: Folder,
};

// Date/Time indicator for due dates and reminders
function DateTimeIndicator({ target }: { target: any }) {
    const now = new Date();
    const dueDate = target.due_at ? new Date(target.due_at) : null;
    const reminderDate = target.next_trigger_at ? new Date(target.next_trigger_at) : (target.remind_at ? new Date(target.remind_at) : null);

    if (!dueDate && !reminderDate) return null;

    const formatDateTime = (date: Date): string => {
        const isToday = date.toDateString() === now.toDateString();
        const isTomorrow = date.toDateString() === new Date(now.getTime() + 86400000).toDateString();
        const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        if (isToday) return `Today, ${timeStr}`;
        if (isTomorrow) return `Tomorrow, ${timeStr}`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${timeStr}`;
    };

    const isOverdue = dueDate && dueDate < now && !target.is_completed;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {dueDate && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: isOverdue ? '#EF4444' : '#6B7280', fontWeight: isOverdue ? 600 : 400 }}>
                    <Clock size={12} />
                    <span>Due: {formatDateTime(dueDate)}</span>
                </div>
            )}
            {reminderDate && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: '#3B82F6' }}>
                    <Clock size={12} />
                    <span>Remind: {formatDateTime(reminderDate)}</span>
                </div>
            )}
        </div>
    );
}

// Task Box component with drag-drop support
interface TaskBoxProps {
    task: Task;
    items: Item[];
    onDrop: (taskId: string, itemIds: string[]) => void;
}

function TaskBox({ task, items, onDrop }: TaskBoxProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const { openContextMenu, setSelectedTask } = useAppStore();

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        try {
            const data = e.dataTransfer.getData('application/json');
            if (data) {
                const parsed = JSON.parse(data);

                // FIX: Check if it's a raw array (which ItemCard sends)
                if (Array.isArray(parsed)) {
                    onDrop(task.id, parsed);
                }
                // Keep support for object format just in case
                else if (parsed.itemIds && Array.isArray(parsed.itemIds)) {
                    onDrop(task.id, parsed.itemIds);
                } else if (parsed.itemId) {
                    onDrop(task.id, [parsed.itemId]);
                }
            }
        } catch (err) {
            console.error('Drop parse error:', err);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        openContextMenu(e.clientX, e.clientY, task.id);
    };

    const completedCount = Object.values(task.item_completion || {}).filter(Boolean).length;

    // Get task items for preview
    const taskItems = (task.item_ids || []).map(id => items.find(i => i.id === id)).filter(Boolean) as Item[];
    const previewItems = taskItems.slice(0, 4);

    return (
        <div
            className={`task-box-simple ${isDragOver ? 'drag-over' : ''}`}
            style={{
                borderColor: task.color || '#F59E0B',
                backgroundColor: isDragOver ? (task.color || '#FEF3C7') : 'white',
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onContextMenu={handleContextMenu}
            onClick={() => setSelectedTask(task.id)}
        >
            <div className="task-box-header-simple">
                <div className="task-box-color" style={{ background: task.color || '#F59E0B' }} />
                <span className="task-box-name">{task.title}</span>
                {task.is_completed && <CheckCircle2 size={14} style={{ color: '#10B981' }} />}
            </div>

            <div className="task-box-preview">
                {previewItems.length > 0 ? (
                    <div className="task-preview-icons">
                        {previewItems.map(item => {
                            const Icon = TYPE_ICONS[item.type] || FileText;
                            return (
                                <div key={item.id} className="preview-icon-wrapper" style={{ background: item.bg_color || '#F3F4F6' }}>
                                    <Icon size={12} style={{ color: '#4B5563' }} />
                                </div>
                            );
                        })}
                        {taskItems.length > 4 && (
                            <div className="preview-more">+{taskItems.length - 4}</div>
                        )}
                    </div>
                ) : (
                    <span className="task-empty-text">Drop items here</span>
                )}
                <span className="task-box-count">{completedCount}/{(task.item_ids || []).length}</span>
            </div>

            <DateTimeIndicator target={task} />
        </div>
    );
}

// Quick Access Card - same as homepage
interface QuickAccessCardProps {
    type: string;
    icon: React.ReactNode;
    count: number;
    label: string;
    isActive?: boolean;
    onClick?: () => void;
}

function QuickAccessCard({ type, icon, count, label, isActive, onClick }: QuickAccessCardProps) {
    return (
        <div
            className={`qa-card ${isActive ? 'qa-active' : ''}`}
            data-type={type}
            onClick={onClick}
        >
            <div className="qa-icon">{icon}</div>
            <div className="qa-info">
                <span className="qa-count">{count}</span>
                <span className="qa-label">{label}</span>
            </div>
        </div>
    );
}

export function TasksView() {
    const {
        tasks,
        items,
        user,
        addTask,
        addItemsToTask,
        selectedListId,
    } = useAppStore();

    const [isCreating, setIsCreating] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskColor, setNewTaskColor] = useState(TASK_COLORS[0]);
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // Active tasks only
    const activeTasks = useMemo(() => tasks.filter(t => !t.is_completed), [tasks]);

    // Filter items (same as homepage)
    const availableItems = useMemo(() => {
        let filtered = items.filter(i => !i.deleted_at);
        if (selectedType) {
            filtered = filtered.filter(i => i.type === selectedType);
        }
        return filtered;
    }, [items, selectedType]);

    // Item counts by type
    const typeCounts = useMemo(() => ({
        note: items.filter(i => !i.deleted_at && i.type === 'note').length,
        file: items.filter(i => !i.deleted_at && i.type === 'file').length,
        image: items.filter(i => !i.deleted_at && i.type === 'image').length,
        link: items.filter(i => !i.deleted_at && i.type === 'link').length,
        folder: items.filter(i => !i.deleted_at && i.type === 'folder').length,
    }), [items]);

    const handleCreateTask = () => {
        if (!newTaskTitle.trim()) return;

        // LEAN PAYLOAD: Only send what is strictly necessary to avoid schema cache issues
        const taskData: any = {
            user_id: user?.id || 'demo',
            title: newTaskTitle.trim(),
            is_completed: false,
            list_id: selectedListId || null,  // Associate with current list
        };

        // Only add optional fields if they have a non-null value
        if (newTaskColor) taskData.color = newTaskColor;

        addTask(taskData);
        setNewTaskTitle('');
        setIsCreating(false);
    };

    const handleDropOnTask = (taskId: string, itemIds: string[]) => {
        addItemsToTask(taskId, itemIds);
    };

    return (
        <div className="tasks-view-simple">
            {/* TASKS ROW AT TOP */}
            <section className="tasks-row">
                <div className="tasks-row-header">
                    <h3>Tasks</h3>
                    <button
                        className="add-task-btn"
                        onClick={() => setIsCreating(true)}
                    >
                        <Plus size={16} />
                        Add Task
                    </button>
                </div>

                {/* New Task Form */}
                {isCreating && (
                    <div className="task-create-inline">
                        <input
                            type="text"
                            placeholder="Task name..."
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateTask()}
                            autoFocus
                        />
                        <div className="color-picker">
                            {TASK_COLORS.map(color => (
                                <button
                                    key={color}
                                    className={`color-btn ${newTaskColor === color ? 'active' : ''}`}
                                    style={{ background: color }}
                                    onClick={() => setNewTaskColor(color)}
                                />
                            ))}
                        </div>
                        <button className="save-btn" onClick={handleCreateTask}>Create</button>
                        <button className="cancel-btn" onClick={() => setIsCreating(false)}>Cancel</button>
                    </div>
                )}

                {/* Task Boxes - Drag items here */}
                <div className="tasks-boxes">
                    {activeTasks.length === 0 ? (
                        <div className="tasks-empty-hint">
                            No tasks yet. Create a task and drag items to it!
                        </div>
                    ) : (
                        activeTasks.map(task => (
                            <TaskBox
                                key={task.id}
                                task={task}
                                items={items}
                                onDrop={handleDropOnTask}
                            />
                        ))
                    )}
                </div>
            </section>

            {/* QUICK ACCESS - Same as Homepage */}
            <div className="quick-access-compact">
                <h3 className="compact-section-title">Quick Access</h3>
                <div className="quick-access-grid">
                    <QuickAccessCard
                        type="note"
                        icon={<StickyNote size={22} />}
                        count={typeCounts.note}
                        label="Notes"
                        isActive={selectedType === 'note'}
                        onClick={() => setSelectedType(selectedType === 'note' ? null : 'note')}
                    />
                    <QuickAccessCard
                        type="file"
                        icon={<FileText size={22} />}
                        count={typeCounts.file}
                        label="Files"
                        isActive={selectedType === 'file'}
                        onClick={() => setSelectedType(selectedType === 'file' ? null : 'file')}
                    />
                    <QuickAccessCard
                        type="image"
                        icon={<Image size={22} />}
                        count={typeCounts.image}
                        label="Images"
                        isActive={selectedType === 'image'}
                        onClick={() => setSelectedType(selectedType === 'image' ? null : 'image')}
                    />
                    <QuickAccessCard
                        type="link"
                        icon={<Link2 size={22} />}
                        count={typeCounts.link}
                        label="Links"
                        isActive={selectedType === 'link'}
                        onClick={() => setSelectedType(selectedType === 'link' ? null : 'link')}
                    />
                    <QuickAccessCard
                        type="folder"
                        icon={<Folder size={22} />}
                        count={typeCounts.folder}
                        label="Folders"
                        isActive={selectedType === 'folder'}
                        onClick={() => setSelectedType(selectedType === 'folder' ? null : 'folder')}
                    />
                </div>
            </div>

            {/* ITEMS SECTION - Same as Homepage */}
            <section className="items-section-home">
                <div className="items-header">
                    <h3>
                        <Clock size={16} />
                        {selectedType ? selectedType.toUpperCase() + 'S' : 'ALL ITEMS'}
                    </h3>
                    <div className="view-toggle">
                        <button
                            className={viewMode === 'grid' ? 'active' : ''}
                            onClick={() => setViewMode('grid')}
                        >
                            <Grid size={16} />
                        </button>
                        <button
                            className={viewMode === 'list' ? 'active' : ''}
                            onClick={() => setViewMode('list')}
                        >
                            <List size={16} />
                        </button>
                    </div>
                </div>

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
                        {availableItems.map(item => (
                            <div key={item.id} className="masonry-item">
                                <ItemCard item={item} />
                            </div>
                        ))}
                    </Masonry>
                ) : (
                    <div className="items-grid-home list">
                        {availableItems.map(item => (
                            <ItemCard key={item.id} item={item} />
                        ))}
                    </div>
                )}
            </section>

            <style>{`
                .tasks-view-simple {
                    padding: 24px 32px;
                    max-width: 1200px;
                    margin: 0 auto;
                }

                /* Tasks Row */
                .tasks-row {
                    background: var(--bg-sidebar, #FAF5F0);
                    border-radius: 16px;
                    padding: 16px 20px;
                    margin-bottom: 24px;
                    border: 1px solid var(--border-light, #E5E7EB);
                }
                .tasks-row-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }
                .tasks-row-header h3 {
                    font-size: 0.85rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: #6B7280;
                    margin: 0;
                }
                .add-task-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    background: #F59E0B;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .add-task-btn:hover {
                    background: #D97706;
                }

                /* Task Create Form */
                .task-create-inline {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 12px;
                    flex-wrap: wrap;
                }
                .task-create-inline input {
                    flex: 1;
                    min-width: 200px;
                    padding: 8px 12px;
                    border: 1px solid #E5E7EB;
                    border-radius: 8px;
                    font-size: 0.875rem;
                }
                .color-picker {
                    display: flex;
                    gap: 6px;
                }
                .color-btn {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    border: 2px solid rgba(0,0,0,0.1);
                    cursor: pointer;
                }
                .color-btn.active {
                    border-color: #3B82F6;
                    box-shadow: 0 0 0 2px rgba(59,130,246,0.3);
                }
                .save-btn {
                    padding: 8px 16px;
                    background: #F59E0B;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                }
                .cancel-btn {
                    padding: 8px 16px;
                    background: transparent;
                    border: 1px solid #E5E7EB;
                    border-radius: 8px;
                    cursor: pointer;
                }

                /* Task Boxes */
                .tasks-boxes {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                }
                .tasks-empty-hint {
                    color: #9CA3AF;
                    font-size: 0.85rem;
                    padding: 16px;
                    text-align: center;
                    width: 100%;
                }
                .task-box-simple {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    padding: 12px 14px;
                    background: white;
                    border: 2px solid #E5E7EB;
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                    min-width: 180px;
                    max-width: 220px;
                }
                .task-box-simple:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .task-box-simple.drag-over {
                    transform: scale(1.05);
                    box-shadow: 0 6px 20px rgba(245, 158, 11, 0.3);
                }
                .task-box-header-simple {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    width: 100%;
                }
                .task-box-color {
                    width: 10px;
                    height: 10px;
                    border-radius: 3px;
                    flex-shrink: 0;
                }
                .task-box-name {
                    font-weight: 600;
                    font-size: 0.85rem;
                    color: #1F2937;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .task-box-preview {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    width: 100%;
                    margin-top: 4px;
                }
                .task-preview-icons {
                    display: flex;
                    align-items: center;
                }
                .preview-icon-wrapper {
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    border: 1px solid white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-left: -6px;
                }
                .preview-icon-wrapper:first-child {
                    margin-left: 0;
                }
                .preview-more {
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: #F3F4F6;
                    border: 1px solid white;
                    font-size: 0.6rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-left: -6px;
                    color: #6B7280;
                    font-weight: 600;
                }
                .task-empty-text {
                    font-size: 0.7rem;
                    color: #D1D5DB;
                    font-style: italic;
                }
                .task-box-count {
                    font-size: 0.75rem;
                    color: #9CA3AF;
                }

                /* Items Section */
                .items-section-home {
                    margin-top: 24px;
                }
                .items-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                }
                .items-header h3 {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: #6B7280;
                    margin: 0;
                }
                .view-toggle {
                    display: flex;
                    background: #F3F4F6;
                    border-radius: 8px;
                    padding: 2px;
                }
                .view-toggle button {
                    padding: 6px 10px;
                    background: transparent;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    color: #9CA3AF;
                }
                .view-toggle button.active {
                    background: white;
                    color: #1F2937;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .items-grid-home {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: 16px;
                }
                .items-grid-home.list {
                    grid-template-columns: 1fr;
                }
            `}</style>
        </div>
    );
}

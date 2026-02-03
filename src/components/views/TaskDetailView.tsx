import { useState, useEffect } from 'react';
import {
    ArrowLeft,
    Trash2,
    Calendar,
    Flag,
    CheckCircle2,
    AlignLeft,
    CheckSquare,
    X
} from 'lucide-react';
import Masonry from 'react-masonry-css';
import { useAppStore } from '../../store/useAppStore';
import { CARD_COLORS, type PriorityLevel, type Item } from '../../lib/types';
import { ItemCard } from '../cards/ItemCard';
import { getRelativeTime } from '../../hooks/useKeyboardNavigation';

// Standard Priority Colors
const PRIORITY_COLORS: Record<PriorityLevel, string> = {
    high: '#EF4444',
    medium: '#F59E0B',
    low: '#10B981',
    none: '#9CA3AF',
};

export function TaskDetailView() {
    const {
        tasks,
        items,
        selectedTaskId,
        setSelectedTask,
        updateTask,
        deleteTask,
        toggleTaskCompletion,
        openScheduler,
        removeItemFromTask
    } = useAppStore();

    const [description, setDescription] = useState('');
    const [title, setTitle] = useState('');

    // Find the task
    const task = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null;

    // Sync local state when task changes
    useEffect(() => {
        if (task) {
            setTitle(task.title);
            setDescription(task.description || '');
        }
    }, [task]);

    // Handle Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleBack();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (!selectedTaskId || !task) return null;

    const handleBack = () => setSelectedTask(null);

    const handleTitleBlur = () => {
        if (title.trim() !== task.title) {
            updateTask(task.id, { title: title.trim() });
        }
    };

    const handleDescriptionBlur = () => {
        if (description.trim() !== (task.description || '')) {
            updateTask(task.id, { description: description.trim() });
        }
    };

    const handleDelete = () => {
        if (confirm('Are you sure you want to delete this task?')) {
            deleteTask(task.id);
            handleBack();
        }
    };

    const handlePriorityChange = (priority: PriorityLevel) => {
        updateTask(task.id, { priority });
    };

    const handleColorChange = (color: string) => {
        updateTask(task.id, { color });
    };

    // Linked Items
    const linkedItems = (task.item_ids || [])
        .map(id => items.find(i => i.id === id))
        .filter(Boolean) as Item[];

    const completedCount = Object.values(task.item_completion || {}).filter(Boolean).length;
    const totalCount = (task.item_ids || []).length;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return (
        <div className="task-detail-page">
            {/* TOP BAR */}
            <header className="detail-header">
                <button className="back-btn" onClick={handleBack}>
                    <ArrowLeft size={20} />
                    <span>Back to Board</span>
                </button>

                <div className="header-actions">
                    <span className="last-updated">
                        Updated {getRelativeTime(task.updated_at)}
                    </span>
                    <button
                        className="action-btn danger"
                        onClick={handleDelete}
                        title="Delete Task"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            </header>

            {/* MAIN CONTENT CONTAINER */}
            <div className="detail-container">

                {/* HERO / TITLE SECTION */}
                <div className="detail-hero">
                    <div className="hero-top-row">
                        <button
                            className={`status-chip ${task.is_completed ? 'completed' : 'active'}`}
                            onClick={() => toggleTaskCompletion(task.id)}
                        >
                            <CheckCircle2 size={16} />
                            <span>{task.is_completed ? 'Completed' : 'In Progress'}</span>
                        </button>

                        <div className="priority-selector">
                            {(['none', 'low', 'medium', 'high'] as PriorityLevel[]).map(p => {
                                const isActive = task.priority === p;
                                const color = PRIORITY_COLORS[p];
                                return (
                                    <button
                                        key={p}
                                        className={`prio-dot ${isActive ? 'active' : ''}`}
                                        data-priority={p}
                                        onClick={() => handlePriorityChange(p)}
                                        title={`Priority: ${p}`}
                                        style={{
                                            color: isActive ? 'white' : color,
                                            backgroundColor: isActive ? color : 'transparent',
                                            border: `1px solid ${isActive ? color : 'transparent'}`,
                                            boxShadow: isActive ? `0 2px 4px ${color}40` : 'none'
                                        }}
                                    >
                                        <Flag size={14} className={isActive ? 'fill-current' : ''} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <input
                        type="text"
                        className="hero-title-input"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={handleTitleBlur}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        placeholder="Task Title"
                    />

                    {/* Meta Grid (Like Notion properties) */}
                    <div className="properties-grid">
                        <div className="prop-row">
                            <div className="prop-label"><Calendar size={16} /> Due Date</div>
                            <div className="prop-value">
                                <button className="prop-btn" onClick={() => openScheduler(task.id)}>
                                    {task.due_at ? new Date(task.due_at).toLocaleDateString() : 'Empty'}
                                </button>
                            </div>
                        </div>
                        <div className="prop-row">
                            <div className="prop-label"><div className="color-swatch-mini" style={{ background: task.color }} /> Color</div>
                            <div className="prop-value">
                                <div className="color-options-row">
                                    {Object.values(CARD_COLORS).map(c => (
                                        <button
                                            key={c}
                                            className={`color-dot ${task.color === c ? 'selected' : ''}`}
                                            style={{ background: c }}
                                            onClick={() => handleColorChange(c)}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="detail-divider" />

                {/* DESCRIPTION */}
                <div className="detail-section">
                    <h3 className="section-heading">
                        <AlignLeft size={20} />
                        Description
                    </h3>
                    <textarea
                        className="large-description-input"
                        placeholder="Type a description..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onBlur={handleDescriptionBlur}
                    />
                </div>

                <div className="detail-divider" />

                {/* ATTACHED ITEMS GRID */}
                <div className="detail-section full-width">
                    <div className="section-header-row">
                        <h3 className="section-heading">
                            <CheckSquare size={20} />
                            Attachments & Subtasks
                        </h3>
                        <span className="count-badge">
                            {completedCount}/{totalCount} Completed
                        </span>
                    </div>

                    {/* Progress Line */}
                    {totalCount > 0 && (
                        <div className="detail-progress-track">
                            <div
                                className="detail-progress-fill"
                                style={{ width: `${progress}%`, background: task.color || '#F59E0B' }}
                            />
                        </div>
                    )}

                    {linkedItems.length === 0 ? (
                        <div className="empty-zone">
                            <p>No items linked.</p>
                            <p className="sub">Drag and drop items from the sidebar or main list to link them to this task.</p>
                        </div>
                    ) : (
                        <Masonry
                            breakpointCols={{ default: 3, 1100: 2, 700: 1 }}
                            className="my-masonry-grid"
                            columnClassName="my-masonry-grid_column"
                        >
                            {linkedItems.map(item => (
                                <div key={item.id} className="masonry-item">
                                    {/* We wrap ItemCard to add task-specific controls if needed, but ItemCard handles completion logic internally for ITEMS. 
                                        Wait, toggleTaskItemCompletion is stored on the TASK, not the ITEM.
                                        ItemCard doesn't know about the task context. 
                                        So we need a wrapper to handle the "Check off this item FOR THIS TASK" logic.
                                    */}
                                    <div className="task-item-wrapper">
                                        <div className="task-item-overlay">
                                            <button
                                                className={`task-checkbox-large ${(task.item_completion || {})[item.id] ? 'checked' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    useAppStore.getState().toggleTaskItemCompletion(task.id, item.id);
                                                }}
                                            >
                                                {(task.item_completion || {})[item.id] ? <CheckSquare size={20} /> : <div className="square" />}
                                            </button>
                                            <button
                                                className="task-remove-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeItemFromTask(task.id, item.id);
                                                }}
                                                title="Remove from task"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                        <ItemCard item={item} hideControls={true} />
                                    </div>
                                </div>
                            ))}
                        </Masonry>
                    )}
                </div>
            </div>

            <style>{`
                .task-detail-page {
                    height: calc(100% - 24px);
                    margin: 12px;
                    overflow-y: auto;
                    background: #fff;
                    display: flex;
                    flex-direction: column;
                    animation: fadeIn 0.3s ease;
                    border-radius: 24px;
                    box-shadow: 0 8px 30px rgba(0,0,0,0.12);
                    border: 1px solid rgba(0,0,0,0.05);
                }
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }

                .detail-header {
                    padding: 16px 32px;
                    border-bottom: 1px solid var(--border-light);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: #fff;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                    border-top-left-radius: 24px;
                    border-top-right-radius: 24px;
                }
                .back-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    border: none;
                    background: transparent;
                    font-size: 0.9rem;
                    font-weight: 500;
                    color: var(--text-secondary);
                    cursor: pointer;
                    padding: 8px 12px;
                    border-radius: 8px;
                    transition: all 0.2s;
                }
                .back-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

                .header-actions {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .last-updated {
                    font-size: 0.8rem;
                    color: var(--text-muted);
                }
                .action-btn {
                    border: none;
                    background: transparent;
                    padding: 8px;
                    border-radius: 6px;
                    cursor: pointer;
                    color: var(--text-secondary);
                }
                .action-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
                .action-btn.danger:hover { background: #FEF2F2; color: #DC2626; }

                .detail-container {
                    max-width: 900px;
                    margin: 0 auto;
                    width: 100%;
                    padding: 48px 32px;
                }

                .detail-hero {
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                    margin-bottom: 32px;
                }

                .hero-top-row {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .status-chip {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    border: 1px solid transparent;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .status-chip.active { background: #EFF6FF; color: #2563EB; border-color: #BFDBFE; }
                .status-chip.completed { background: #ECFDF5; color: #059669; border-color: #6EE7B7; }

                .priority-selector {
                    display: flex;
                    gap: 4px;
                    background: #F3F4F6;
                    padding: 4px;
                    border-radius: 8px;
                }
                .prio-dot {
                    width: 24px; height: 24px;
                    border: none;
                    background: transparent;
                    border-radius: 4px;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer;
                    color: #9CA3AF;
                }
                .prio-dot:hover { background: rgba(255,255,255,0.5); }
                .prio-dot.active { background: white; color: #1F2937; shadow: 0 1px 2px rgba(0,0,0,0.1); }

                .hero-title-input {
                    font-size: 2.5rem;
                    font-weight: 700;
                    border: none;
                    outline: none;
                    background: transparent;
                    font-family: var(--font-display);
                    color: var(--text-primary);
                    width: 100%;
                    line-height: 1.2;
                }
                .hero-title-input::placeholder { color: #E5E7EB; }

                .properties-grid {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 24px;
                    padding-top: 16px;
                }
                .prop-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-size: 0.9rem;
                }
                .prop-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: var(--text-muted);
                    width: 100px;
                }
                .prop-value {
                    flex: 1;
                }
                .prop-btn {
                    border: none;
                    background: transparent;
                    font-family: inherit;
                    font-size: inherit;
                    color: var(--text-primary);
                    cursor: pointer;
                    padding: 4px 8px;
                    border-radius: 4px;
                }
                .prop-btn:hover { background: var(--bg-hover); }

                .color-swatch-mini { width: 12px; height: 12px; border-radius: 2px; border: 1px solid rgba(0,0,0,0.1); }
                .color-options-row { display: flex; gap: 6px; }
                .color-dot {
                    width: 16px; height: 16px;
                    border-radius: 50%;
                    border: 1px solid rgba(0,0,0,0.1);
                    cursor: pointer;
                    transition: transform 0.1s;
                }
                .color-dot:hover { transform: scale(1.2); }
                .color-dot.selected { box-shadow: 0 0 0 2px white, 0 0 0 4px var(--text-primary); }

                .detail-divider {
                    height: 1px;
                    background: var(--border-light);
                    margin: 32px 0;
                }

                .detail-section {
                    margin-bottom: 32px;
                }
                .section-heading {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 1.1rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin-bottom: 16px;
                }

                .large-description-input {
                    width: 100%;
                    min-height: 150px;
                    border: none;
                    background: transparent;
                    font-size: 1rem;
                    line-height: 1.6;
                    color: var(--text-primary);
                    outline: none;
                    resize: none;
                }
                .large-description-input:focus { background: #FAFAFA; border-radius: 8px; padding: 16px; margin: -16px; width: calc(100% + 32px); }

                .section-header-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 16px;
                }
                .count-badge {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                    font-weight: 500;
                    background: var(--bg-hover);
                    padding: 4px 10px;
                    border-radius: 12px;
                }

                .detail-progress-track {
                    height: 4px;
                    background: var(--bg-hover);
                    border-radius: 2px;
                    margin-bottom: 24px;
                    overflow: hidden;
                }
                .detail-progress-fill { height: 100%; transition: width 0.3s ease; }

                .empty-zone {
                    padding: 40px;
                    text-align: center;
                    background: #F9FAFB;
                    border: 2px dashed var(--border-light);
                    border-radius: 12px;
                    color: var(--text-muted);
                }
                .sub { font-size: 0.85rem; margin-top: 8px; }

                /* Task Item Wrapper */
                .task-item-wrapper {
                    position: relative;
                }
                .task-item-overlay {
                    position: absolute;
                    top: 10px;
                    left: 10px;
                    z-index: 5;
                    display: flex;
                    gap: 4px;
                }
                .task-checkbox-large {
                    background: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    color: var(--text-muted);
                    padding: 4px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    display: flex;
                    align-items: center; justify-content: center;
                }
                .task-checkbox-large:hover { color: #10B981; }
                .task-checkbox-large.checked { color: #10B981; }
                .square { width: 20px; height: 20px; border: 2px solid #D1D5DB; border-radius: 4px; }
                .task-remove-btn {
                    background: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    color: var(--text-muted);
                    padding: 4px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    display: flex;
                    align-items: center; justify-content: center;
                    opacity: 0;
                    transition: opacity 0.2s, color 0.2s;
                }
                .task-item-wrapper:hover .task-remove-btn { opacity: 1; }
                .task-remove-btn:hover { color: #DC2626; background: #FEF2F2; }

            `}</style>
        </div>
    );
}

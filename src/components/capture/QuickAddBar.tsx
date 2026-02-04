import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import {
    Image,
    CheckSquare,
    Bell,
    UserPlus,
    MoreVertical,
    Undo,
    Redo,
    Pin,
    ListTodo
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { generateId } from '../../lib/utils';
import type { Item, CardColor } from '../../lib/types';
import { CARD_COLORS } from '../../lib/types';

export function QuickAddBar() {
    const { addItem, user, selectedFolderId, addTask } = useAppStore();

    // State
    const [isExpanded, setIsExpanded] = useState(false);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [selectedColor, setSelectedColor] = useState<CardColor>('default');
    const [isPinned, setIsPinned] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [content]);

    const resetForm = useCallback(() => {
        setIsExpanded(false);
        setTitle('');
        setContent('');
        setSelectedColor('default');
        setIsPinned(false);
    }, []);

    const handleSubmit = useCallback(() => {
        if (!title.trim() && !content.trim()) return;

        const newItem: Item = {
            id: generateId(),
            user_id: user?.id || 'demo',
            folder_id: selectedFolderId || null,
            type: 'note',
            title: title,
            content: { text: content },
            file_meta: null,
            priority: 'none',
            tags: [],
            scheduled_at: null,
            remind_before: null,
            recurring_config: null,
            bg_color: CARD_COLORS[selectedColor],
            is_pinned: isPinned,
            is_archived: false,
            is_completed: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: null,
        };

        addItem(newItem);
        resetForm();
    }, [addItem, user, selectedFolderId, title, content, selectedColor, isPinned, resetForm]);

    // FIXED: Must be defined BEFORE useEffect that uses it
    const handleCloseAndSave = useCallback(() => {
        if (title.trim() || content.trim()) {
            handleSubmit();
        } else {
            resetForm();
        }
    }, [title, content, handleSubmit, resetForm]);

    // Handle outside click to close/save
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                if (isExpanded) {
                    handleCloseAndSave();
                }
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isExpanded, handleCloseAndSave]);

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            handleSubmit();
        }
    };

    const handleCreateTask = (e: React.MouseEvent) => {
        e.stopPropagation();
        const taskName = prompt('Enter task name:');
        if (taskName && taskName.trim()) {
            addTask({
                user_id: user?.id || 'demo',
                title: taskName.trim(),
                description: null,
                color: '#FDE68A',
                priority: 'none',
                scheduled_at: null,
                remind_before: null,
                recurring_config: null,
                item_ids: [],
                item_completion: {},
                is_completed: false,
            });
        }
    };

    return (
        <div className="quick-add-bar-wrapper">
            <div
                ref={containerRef}
                className={`quick-add-bar ${isExpanded ? 'expanded' : ''} ${selectedColor !== 'default' ? 'has-color' : ''}`}
                style={{
                    backgroundColor: selectedColor !== 'default' ? CARD_COLORS[selectedColor] : 'var(--bg-card)'
                }}
                onClick={() => !isExpanded && setIsExpanded(true)}
            >
                {/* Collapsed State */}
                {!isExpanded && (
                    <div className="quick-add-placeholder">
                        <span>Take a note...</span>
                        <div className="quick-actions">
                            <button title="New Task" onClick={handleCreateTask}><ListTodo size={20} /></button>
                            <button title="New List"><CheckSquare size={20} /></button>
                            <button title="New Image"><Image size={20} /></button>
                        </div>
                    </div>
                )}

                {/* Expanded State */}
                {isExpanded && (
                    <div className="quick-add-expanded" onKeyDown={handleKeyDown}>
                        <div className="qa-header">
                            <input
                                type="text"
                                placeholder="Title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="qa-title-input"
                            />
                            <button
                                className={`qa-pin-btn ${isPinned ? 'active' : ''}`}
                                onClick={() => setIsPinned(!isPinned)}
                            >
                                <Pin size={20} className={isPinned ? 'fill-current' : ''} />
                            </button>
                        </div>

                        <textarea
                            ref={textareaRef}
                            placeholder="Take a note..."
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="qa-content-input"
                            rows={1}
                        />

                        <div className="qa-footer">
                            <div className="qa-tools">
                                <button title="Remind me" className="qa-tool-btn"><Bell size={18} /></button>
                                <button title="Collaborator" className="qa-tool-btn"><UserPlus size={18} /></button>
                                <button title="Background options" className="qa-tool-btn" onClick={() => setSelectedColor(selectedColor === 'default' ? 'yellow' : 'default')}>
                                    <div className="color-icon" style={{ backgroundColor: selectedColor !== 'default' ? 'transparent' : 'inherit' }} />
                                    {/* Simplistic toggle for now */}
                                </button>
                                <button title="Add Image" className="qa-tool-btn"><Image size={18} /></button>
                                <button title="More" className="qa-tool-btn"><MoreVertical size={18} /></button>
                                <button title="Undo" className="qa-tool-btn disabled"><Undo size={18} /></button>
                                <button title="Redo" className="qa-tool-btn disabled"><Redo size={18} /></button>
                            </div>
                            <button className="qa-close-btn" onClick={handleCloseAndSave}>
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                .quick-add-bar-wrapper {
                    display: flex;
                    justify-content: center;
                    padding: 24px 0 16px;
                    width: 100%;
                }
                .quick-add-bar {
                    background: var(--bg-card);
                    border: 1px solid var(--border-light);
                    border-radius: 8px;
                    box-shadow: var(--shadow-sm);
                    width: 600px;
                    max-width: 100%;
                    transition: all 0.2s ease;
                    position: relative;
                    overflow: hidden;
                }
                .quick-add-bar.expanded {
                    box-shadow: var(--shadow-md);
                    border-color: var(--border-hover);
                }
                .quick-add-placeholder {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 16px;
                    cursor: text;
                    color: var(--text-muted);
                    font-weight: 500;
                }
                .quick-actions {
                    display: flex;
                    gap: 16px;
                }
                .quick-actions button {
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                }
                .quick-actions button:hover {
                    color: var(--text-primary);
                    background: var(--bg-hover);
                }
                
                .quick-add-expanded {
                    padding: 12px 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .qa-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .qa-title-input {
                    font-weight: 600;
                    font-size: 1rem;
                    border: none;
                    background: transparent;
                    width: 100%;
                    outline: none;
                    color: var(--text-primary);
                }
                .qa-title-input::placeholder {
                    color: var(--text-muted);
                }
                .qa-content-input {
                    font-family: inherit;
                    font-size: 0.9375rem;
                    border: none;
                    background: transparent;
                    width: 100%;
                    outline: none;
                    resize: none;
                    line-height: 1.5;
                    color: var(--text-primary);
                    min-height: 24px;
                }
                .qa-pin-btn {
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    cursor: pointer;
                    padding: 8px;
                    border-radius: 50%;
                    display: flex;
                }
                .qa-pin-btn:hover {
                    background: rgba(0,0,0,0.05);
                }
                .qa-pin-btn.active {
                    color: var(--text-primary);
                    background: var(--bg-hover);
                }
                .qa-footer {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-top: 4px;
                    padding-top: 4px;
                }
                .qa-tools {
                    display: flex;
                    gap: 4px;
                }
                .qa-tool-btn {
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    cursor: pointer;
                    padding: 8px;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .qa-tool-btn:hover {
                    background: rgba(0,0,0,0.05);
                    color: var(--text-primary);
                }
                .qa-tool-btn.disabled {
                    opacity: 0.5;
                    cursor: default;
                }
                .qa-close-btn {
                    background: transparent;
                    border: none;
                    font-weight: 500;
                    font-size: 0.875rem;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    color: var(--text-primary);
                }
                .qa-close-btn:hover {
                    background: rgba(0,0,0,0.05);
                }
            `}</style>
        </div>
    );
}

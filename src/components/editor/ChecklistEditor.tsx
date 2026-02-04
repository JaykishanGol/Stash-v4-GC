import React, { useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { generateId } from '../../lib/utils';

export interface ChecklistItem {
    id: string;
    text: string;
    checked: boolean;
}

interface ChecklistEditorProps {
    items: ChecklistItem[];
    onChange: (items: ChecklistItem[]) => void;
    autoFocus?: boolean;
}

export function ChecklistEditor({ items, onChange, autoFocus }: ChecklistEditorProps) {
    const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

    // Initialize with one empty item if empty
    useEffect(() => {
        if (items.length === 0) {
            onChange([{ id: generateId(), text: '', checked: false }]);
        }
    }, [items.length, onChange]);

    // Focus new item logic (simple implementation)
    // In a real app, we'd track "focusId" state to focus specific inputs

    const handleChange = (id: string, text: string) => {
        const newItems = items.map(item => 
            item.id === id ? { ...item, text } : item
        );
        onChange(newItems);
    };

    const handleToggle = (id: string) => {
        const newItems = items.map(item => 
            item.id === id ? { ...item, checked: !item.checked } : item
        );
        onChange(newItems);
    };

    const handleKeyDown = (e: React.KeyboardEvent, id: string, index: number) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const newItem = { id: generateId(), text: '', checked: false };
            const newItems = [...items];
            newItems.splice(index + 1, 0, newItem);
            onChange(newItems);
            
            // Focus next tick
            setTimeout(() => {
                const el = inputRefs.current.get(newItem.id);
                el?.focus();
            }, 0);
        }
        
        if (e.key === 'Backspace' && items[index].text === '' && items.length > 1) {
            e.preventDefault();
            const newItems = items.filter(i => i.id !== id);
            onChange(newItems);
            
            // Focus prev
            setTimeout(() => {
                const prevItem = items[index - 1];
                if (prevItem) {
                    const el = inputRefs.current.get(prevItem.id);
                    el?.focus();
                }
            }, 0);
        }
    };

    const handleDelete = (id: string) => {
        if (items.length <= 1) {
            handleChange(id, ''); // Just clear if it's the last one
            return;
        }
        onChange(items.filter(i => i.id !== id));
    };

    // Sort: unchecked first, then checked
    // actually, Keep usually keeps them in order until you refresh, or moves checked to bottom.
    // Let's keep manual order for editing stability.

    return (
        <div className="checklist-editor">
            {items.map((item, index) => (
                <div key={item.id} className={`checklist-row ${item.checked ? 'checked' : ''}`}>
                    <button 
                        className="checkbox-btn"
                        onClick={() => handleToggle(item.id)}
                    >
                        <div className={`checkbox-box ${item.checked ? 'checked' : ''}`}>
                            {item.checked && <span className="check-icon">✓</span>}
                        </div>
                    </button>
                    
                    <input
                        ref={el => {
                            if (el) inputRefs.current.set(item.id, el);
                            else inputRefs.current.delete(item.id);
                        }}
                        type="text"
                        value={item.text}
                        onChange={(e) => handleChange(item.id, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, item.id, index)}
                        placeholder="List item"
                        className="checklist-input"
                        autoFocus={autoFocus && index === 0}
                    />
                    
                    <button 
                        className="delete-btn"
                        onClick={() => handleDelete(item.id)}
                        tabIndex={-1}
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
            
            <div 
                className="checklist-add-row" 
                onClick={() => {
                    const newItem = { id: generateId(), text: '', checked: false };
                    onChange([...items, newItem]);
                    setTimeout(() => inputRefs.current.get(newItem.id)?.focus(), 0);
                }}
            >
                <Plus size={16} />
                <span>List item</span>
            </div>

            <style>{`
                .checklist-editor {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    padding: 8px 0;
                }
                .checklist-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 4px 0;
                    transition: opacity 0.2s;
                }
                .checklist-row.checked .checklist-input {
                    text-decoration: line-through;
                    color: var(--text-muted);
                }
                .checkbox-btn {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .checkbox-box {
                    width: 18px;
                    height: 18px;
                    border: 2px solid var(--text-secondary);
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s;
                }
                .checkbox-box.checked {
                    background: var(--text-secondary);
                    border-color: var(--text-secondary);
                }
                .check-icon {
                    color: white;
                    font-size: 12px;
                    font-weight: bold;
                }
                .checklist-input {
                    flex: 1;
                    border: none;
                    background: transparent;
                    font-size: 0.95rem;
                    color: var(--text-primary);
                    caret-color: var(--text-primary); /* Ensure cursor is visible */
                    padding: 4px 0;
                    outline: none;
                    font-family: inherit;
                }
                .delete-btn {
                    opacity: 0;
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 4px;
                    transition: all 0.15s;
                }
                .checklist-row:hover .delete-btn {
                    opacity: 1;
                }
                .delete-btn:hover {
                    color: var(--highlight);
                    background: rgba(239, 68, 68, 0.1);
                    border-radius: 4px;
                }
                .checklist-add-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 8px 12px;
                    color: var(--text-muted);
                    font-size: 0.95rem;
                    cursor: text;
                    border-top: 1px solid transparent;
                }
                .checklist-add-row:hover {
                    color: var(--text-secondary);
                }
            `}</style>
        </div>
    );
}
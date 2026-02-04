import { Calendar, MoreVertical, Edit3, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { Item, Task } from '../../lib/types';

interface QuickActionsProps {
    item: Item | Task;
}

function isTask(item: Item | Task): item is Task {
    return 'item_ids' in item;
}

export function QuickActions({ item }: QuickActionsProps) {
    const { openScheduler, openContextMenu, setEditingItem, moveItemsToTrash, deleteTask, setSelectedTask } = useAppStore();

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isTask(item)) {
            setSelectedTask(item.id);
        } else {
            setEditingItem(item);
        }
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isTask(item)) {
            if (confirm('Delete this task?')) {
                deleteTask(item.id);
            }
        } else {
            moveItemsToTrash([item.id]);
        }
    };


    const handleMore = (e: React.MouseEvent) => {
        e.stopPropagation();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        openContextMenu(rect.left, rect.bottom + 4, item.id);
    };

    return (
        <div className="quick-actions-center-dock" onClick={(e) => e.stopPropagation()}>

            {/* Schedule - Opens Scheduler Modal */}
            <button
                className="dock-action-btn"
                onClick={(e) => {
                    e.stopPropagation();
                    openScheduler(item.id);
                }}
                title="Schedule"
                style={item.scheduled_at ? { color: '#10B981', background: '#ECFDF5' } : undefined}
            >
                <Calendar size={16} />
            </button>



            {/* Edit */}
            <button
                className="dock-action-btn"
                onClick={handleEdit}
                title="Edit"
            >
                <Edit3 size={16} />
            </button>

            <div className="dock-separator" />

            {/* Delete */}
            <button
                className="dock-action-btn danger-hover"
                onClick={handleDelete}
                title="Delete"
            >
                <Trash2 size={16} />
            </button>

            {/* More */}
            <button
                className="dock-action-btn"
                onClick={handleMore}
                title="More options"
            >
                <MoreVertical size={16} />
            </button>

            <style>{`
                /* Dock Container */
                .quick-actions-center-dock {
                    position: absolute;
                    bottom: 16px;
                    left: 50%;
                    transform: translateX(-50%) translateY(8px) scale(0.95);
                    z-index: 20;
                    
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px;
                    
                    background: rgba(255, 255, 255, 0.85);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.5);
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0,0,0,0.05);
                    border-radius: 16px;

                    opacity: 0;
                    pointer-events: none;
                    transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                /* Show on Hover - for ItemCard (.card) and agenda cards (.agenda-card) */
                .card:hover .quick-actions-center-dock,
                .agenda-card:hover .quick-actions-center-dock {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0) scale(1);
                    pointer-events: auto;
                }

                /* Buttons */
                .dock-action-btn {
                    width: 34px;
                    height: 34px;
                    border-radius: 10px;
                    border: none;
                    background: transparent;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: #4B5563;
                    transition: all 0.15s ease;
                }

                .dock-action-btn:hover {
                    background: rgba(0, 0, 0, 0.05);
                    transform: scale(1.05);
                    color: #111827;
                }

                .dock-action-btn.danger-hover:hover {
                    background: #FEF2F2;
                    color: #EF4444;
                }

                .dock-separator {
                    width: 1px;
                    height: 18px;
                    background: rgba(0, 0, 0, 0.1);
                    margin: 0 2px;
                }

                /* Popup Menu (Upwards) */
                .dock-popup-menu {
                    position: absolute;
                    bottom: 100%;
                    left: 50%;
                    transform: translateX(-50%);
                    margin-bottom: 8px;
                    width: 140px;
                    background: white;
                    border: 1px solid #E5E7EB;
                    border-radius: 10px;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
                    padding: 4px;
                    z-index: 30;
                    animation: slideUp 0.15s ease-out;
                }

                .dock-menu-item {
                    padding: 8px 12px;
                    font-size: 0.8rem;
                    color: #374151;
                    cursor: pointer;
                    border-radius: 6px;
                    transition: background 0.1s;
                    text-align: left;
                }
                .dock-menu-item:hover {
                    background: #F3F4F6;
                }
                .dock-menu-item.danger {
                    color: #EF4444;
                }
                .dock-menu-item.danger:hover {
                    background: #FEF2F2;
                }
                .dock-menu-divider {
                    height: 1px;
                    background: #E5E7EB;
                    margin: 4px 0;
                }

                @keyframes slideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `}</style>
        </div>
    );
}

import { useState, useRef, useEffect } from 'react';
import { Plus, Calendar, CheckSquare, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

interface CalendarFABProps {
    selectedDate?: Date | null;
}

export function CalendarFAB({ selectedDate }: CalendarFABProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [showQuickEvent, setShowQuickEvent] = useState(false);
    const [showQuickTask, setShowQuickTask] = useState(false);
    const [quickTitle, setQuickTitle] = useState('');
    const [quickTime, setQuickTime] = useState('09:00');
    const [quickEndTime, setQuickEndTime] = useState('10:00');
    const [quickIsAllDay, setQuickIsAllDay] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const { addEvent, addTask, openEventScheduler, user } = useAppStore();

    const targetDate = selectedDate || new Date();
    const dateStr = targetDate.toISOString().split('T')[0];

    // Close menu on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen]);

    // Auto focus input
    useEffect(() => {
        if ((showQuickEvent || showQuickTask) && inputRef.current) {
            inputRef.current.focus();
        }
    }, [showQuickEvent, showQuickTask]);

    const handleCreateEvent = async () => {
        if (!quickTitle.trim()) return;

        const startIso = quickIsAllDay 
            ? `${dateStr}T00:00:00` 
            : `${dateStr}T${quickTime}:00`;
        const endIso = quickIsAllDay
            ? `${dateStr}T23:59:59`
            : `${dateStr}T${quickEndTime}:00`;

        const newEvent = await addEvent({
            user_id: user?.id || 'demo',
            title: quickTitle.trim(),
            description: '',
            start_at: new Date(startIso).toISOString(),
            end_at: new Date(endIso).toISOString(),
            is_all_day: quickIsAllDay,
            rrule: null,
            parent_event_id: null,
            recurring_event_id: null,
            is_deleted_instance: false,
            location: '',
            color_id: '7',
            visibility: 'default',
            transparency: 'opaque',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            attendees: [],
            conference_data: null,
            reminders: [{ method: 'popup', minutes: 10 }],
            attachments: [],
            google_event_id: null,
            google_calendar_id: 'primary',
            deleted_at: null,
            is_unsynced: true,
        });

        resetAndClose();

        // Open scheduler for further editing
        setTimeout(() => openEventScheduler(newEvent.id), 300);
    };

    const handleCreateTask = () => {
        if (!quickTitle.trim()) return;

        const newTask = {
            title: quickTitle.trim(),
            description: null,
            color: '#ffffff',
            priority: 'none' as const,
            scheduled_at: `${dateStr}T00:00:00`,
            remind_before: null,
            recurring_config: null,
            item_ids: [] as string[],
            item_completion: {} as Record<string, boolean>,
            is_completed: false,
            user_id: user?.id || '',
        };

        addTask(newTask);
        resetAndClose();
    };

    const resetAndClose = () => {
        setQuickTitle('');
        setQuickTime('09:00');
        setQuickEndTime('10:00');
        setQuickIsAllDay(false);
        setShowQuickEvent(false);
        setShowQuickTask(false);
        setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (showQuickEvent) handleCreateEvent();
            else if (showQuickTask) handleCreateTask();
        }
        if (e.key === 'Escape') resetAndClose();
    };

    // Quick Event/Task Creation Form
    if (showQuickEvent || showQuickTask) {
        return (
            <div className="cal-fab-container" ref={menuRef}>
                <div className="quick-create-form">
                    <div className="quick-create-header">
                        <div className="quick-create-icon" style={{ background: showQuickEvent ? '#1A73E8' : '#10B981' }}>
                            {showQuickEvent ? <Calendar size={14} color="white" /> : <CheckSquare size={14} color="white" />}
                        </div>
                        <span className="quick-create-label">{showQuickEvent ? 'New Event' : 'New Task'}</span>
                        <button className="quick-close" onClick={resetAndClose}><X size={16} /></button>
                    </div>

                    <input
                        ref={inputRef}
                        type="text"
                        className="quick-title-input"
                        placeholder={showQuickEvent ? "Add title" : "Add task"}
                        value={quickTitle}
                        onChange={e => setQuickTitle(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />

                    {showQuickEvent && (
                        <div className="quick-time-row">
                            <span className="quick-date-label">{targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                            {!quickIsAllDay && (
                                <div className="quick-time-inputs">
                                    <input type="time" value={quickTime} onChange={e => setQuickTime(e.target.value)} className="quick-time-input" />
                                    <span>–</span>
                                    <input type="time" value={quickEndTime} onChange={e => setQuickEndTime(e.target.value)} className="quick-time-input" />
                                </div>
                            )}
                            <label className="quick-allday">
                                <input type="checkbox" checked={quickIsAllDay} onChange={e => setQuickIsAllDay(e.target.checked)} />
                                All day
                            </label>
                        </div>
                    )}

                    {showQuickTask && (
                        <div className="quick-time-row">
                            <span className="quick-date-label">
                                Due: {targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                    )}

                    <div className="quick-actions">
                        <button className="quick-more-btn" onClick={() => {
                            if (showQuickEvent && quickTitle.trim()) {
                                handleCreateEvent();
                            } else if (showQuickTask && quickTitle.trim()) {
                                handleCreateTask();
                            }
                        }}>
                            More options
                        </button>
                        <button 
                            className="quick-save-btn"
                            onClick={showQuickEvent ? handleCreateEvent : handleCreateTask}
                            disabled={!quickTitle.trim()}
                        >
                            Save
                        </button>
                    </div>
                </div>

                <style>{calFabStyles}</style>
            </div>
        );
    }

    return (
        <div className="cal-fab-container" ref={menuRef}>
            {/* Menu */}
            {isOpen && (
                <div className="fab-menu">
                    <button className="fab-menu-item" onClick={() => { setShowQuickEvent(true); setIsOpen(false); }}>
                        <div className="fab-menu-icon event">
                            <Calendar size={18} />
                        </div>
                        <div className="fab-menu-text">
                            <span className="fab-menu-title">Event</span>
                            <span className="fab-menu-desc">Schedule with time</span>
                        </div>
                    </button>
                    <button className="fab-menu-item" onClick={() => { setShowQuickTask(true); setIsOpen(false); }}>
                        <div className="fab-menu-icon task">
                            <CheckSquare size={18} />
                        </div>
                        <div className="fab-menu-text">
                            <span className="fab-menu-title">Task</span>
                            <span className="fab-menu-desc">To-do with due date</span>
                        </div>
                    </button>
                </div>
            )}

            {/* FAB Button */}
            <button 
                className={`cal-fab-btn ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                title="Create"
            >
                <Plus size={24} className={`fab-icon ${isOpen ? 'rotated' : ''}`} />
            </button>

            <style>{calFabStyles}</style>
        </div>
    );
}

const calFabStyles = `
    .cal-fab-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 12px;
    }

    .cal-fab-btn {
        width: 56px;
        height: 56px;
        border-radius: 16px;
        border: none;
        background: #1A73E8;
        color: white;
        cursor: pointer;
        box-shadow: 0 6px 20px rgba(26, 115, 232, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }
    .cal-fab-btn:hover {
        box-shadow: 0 8px 28px rgba(26, 115, 232, 0.5);
        transform: scale(1.05);
    }
    .cal-fab-btn.open {
        background: #5F6368;
        border-radius: 50%;
    }
    .fab-icon {
        transition: transform 0.2s;
    }
    .fab-icon.rotated {
        transform: rotate(45deg);
    }

    .fab-menu {
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.15);
        overflow: hidden;
        min-width: 220px;
        animation: fabSlideUp 0.15s ease-out;
    }

    @keyframes fabSlideUp {
        from { transform: translateY(10px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }

    .fab-menu-item {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 12px 16px;
        border: none;
        background: none;
        cursor: pointer;
        text-align: left;
        transition: background 0.15s;
    }
    .fab-menu-item:hover {
        background: #F8F9FA;
    }
    .fab-menu-item:first-child {
        border-bottom: 1px solid #F1F3F4;
    }

    .fab-menu-icon {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }
    .fab-menu-icon.event {
        background: #E8F0FE;
        color: #1A73E8;
    }
    .fab-menu-icon.task {
        background: #E6F4EA;
        color: #137333;
    }

    .fab-menu-text {
        display: flex;
        flex-direction: column;
    }
    .fab-menu-title {
        font-size: 14px;
        font-weight: 500;
        color: #3C4043;
    }
    .fab-menu-desc {
        font-size: 12px;
        color: #5F6368;
    }

    /* Quick Create Form */
    .quick-create-form {
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.2);
        width: 340px;
        max-width: calc(100vw - 32px);
        animation: fabSlideUp 0.15s ease-out;
        overflow: hidden;
    }

    .quick-create-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        border-bottom: 1px solid #F1F3F4;
    }
    .quick-create-icon {
        width: 24px;
        height: 24px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .quick-create-label {
        font-size: 13px;
        font-weight: 600;
        color: #3C4043;
        flex: 1;
    }
    .quick-close {
        border: none;
        background: none;
        color: #5F6368;
        cursor: pointer;
        padding: 4px;
        border-radius: 50%;
        display: flex;
    }
    .quick-close:hover { background: rgba(0,0,0,0.05); }

    .quick-title-input {
        width: 100%;
        border: none;
        padding: 12px 16px;
        font-size: 16px;
        outline: none;
        color: #3C4043;
        border-bottom: 1px solid #F1F3F4;
    }
    .quick-title-input::placeholder {
        color: #9AA0A6;
    }

    .quick-time-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        flex-wrap: wrap;
    }
    .quick-date-label {
        font-size: 13px;
        color: #5F6368;
        font-weight: 500;
    }
    .quick-time-inputs {
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .quick-time-input {
        border: 1px solid #DADCE0;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 13px;
        color: #3C4043;
        width: 90px;
    }
    .quick-allday {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 13px;
        color: #5F6368;
        cursor: pointer;
        margin-left: auto;
    }

    .quick-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 16px;
        border-top: 1px solid #F1F3F4;
    }
    .quick-more-btn {
        border: none;
        background: none;
        color: #1A73E8;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        padding: 6px 12px;
        border-radius: 4px;
    }
    .quick-more-btn:hover {
        background: #E8F0FE;
    }
    .quick-save-btn {
        background: #1A73E8;
        color: white;
        border: none;
        padding: 6px 20px;
        border-radius: 4px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
    }
    .quick-save-btn:hover { background: #1557B0; }
    .quick-save-btn:disabled { background: #E0E0E0; color: #9AA0A6; cursor: not-allowed; }

    @media (max-width: 768px) {
        .cal-fab-container {
            bottom: 80px;
            right: 16px;
        }
    }
`;

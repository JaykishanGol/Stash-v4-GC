import { useState, useEffect } from 'react';
import { 
    startOfWeek, 
    addWeeks, 
    subWeeks, 
    addDays, 
    format, 
    isSameDay, 
    isToday
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, CheckSquare, MapPin, Video, Circle, CheckCircle2 } from 'lucide-react';
import type { CalendarEntry } from '../../hooks/useGoogleCalendar';
import { useAppStore } from '../../store/useAppStore';
import { GoogleEventDetail } from './GoogleEventDetail';

interface MobileCalendarViewProps {
    selectedDate: Date;
    onSelectDate: (date: Date) => void;
    getEntriesForDate: (date: Date) => CalendarEntry[];
}

export function MobileCalendarView({ selectedDate, onSelectDate, getEntriesForDate }: MobileCalendarViewProps) {
    const [weekStart, setWeekStart] = useState(startOfWeek(selectedDate));
    const [selectedGhostEntry, setSelectedGhostEntry] = useState<CalendarEntry | null>(null);
    const { openScheduler } = useAppStore();
    
    // Sync week strip if selectedDate changes externally (e.g. from jump to today)
    useEffect(() => {
        setWeekStart(startOfWeek(selectedDate));
    }, [selectedDate]);

    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const entries = getEntriesForDate(selectedDate).sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return a.start.getTime() - b.start.getTime();
    });

    const handleEntryClick = (entry: CalendarEntry) => {
        if (entry.isGhost) {
            setSelectedGhostEntry(entry);
            return;
        }
        if (entry.type === 'item' || entry.type === 'task') {
            openScheduler(entry.id);
        }
    };

    return (
        <div className="mobile-calendar-container">
            {/* Google Event Detail Popup */}
            {selectedGhostEntry && (
                <GoogleEventDetail
                    entry={selectedGhostEntry}
                    onClose={() => setSelectedGhostEntry(null)}
                />
            )}

            {/* 1. Week Strip Header */}
            <div className="week-strip-header">
                <div className="week-nav-row">
                    <span className="month-label">{format(weekStart, 'MMMM yyyy')}</span>
                    <div className="week-nav-buttons">
                        <button onClick={() => setWeekStart(d => subWeeks(d, 1))} className="nav-btn">
                            <ChevronLeft size={20} />
                        </button>
                        <button onClick={() => setWeekStart(d => addWeeks(d, 1))} className="nav-btn">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
                
                <div className="week-days-row">
                    {weekDays.map(day => {
                        const isSelected = isSameDay(day, selectedDate);
                        const isDayToday = isToday(day);
                        
                        return (
                            <div 
                                key={day.toISOString()} 
                                className={`week-day-item ${isSelected ? 'selected' : ''} ${isDayToday ? 'today' : ''}`}
                                onClick={() => onSelectDate(day)}
                            >
                                <span className="day-name">{format(day, 'EEE')}</span>
                                <span className="day-num">{format(day, 'd')}</span>
                                {/* Dot indicator if events exist */}
                                {getEntriesForDate(day).length > 0 && (
                                    <div className="day-dot" />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 2. Agenda Stream */}
            <div className="agenda-stream">
                {entries.length === 0 ? (
                    <div className="empty-agenda-state">
                        <div className="empty-icon">
                            <CalendarIcon size={48} strokeWidth={1} />
                        </div>
                        <h3>No plans for {isToday(selectedDate) ? 'today' : format(selectedDate, 'eeee')}</h3>
                        <p>Tap + to add an event or task</p>
                    </div>
                ) : (
                    <div className="agenda-list">
                        {entries.map(entry => {
                            const isTaskEntry = entry.type === 'task' || entry.type === 'google-task';
                            const isEventEntry = entry.type === 'google-event' || entry.sourceType === 'event';
                            return (
                            <div 
                                key={entry.id} 
                                className={`agenda-card ${entry.allDay ? 'all-day' : ''} ${entry.isCompleted ? 'completed' : ''} ${isTaskEntry ? 'task-card' : ''}`}
                                style={{ borderLeftColor: isTaskEntry ? 'transparent' : entry.color }}
                                onClick={() => handleEntryClick(entry)}
                            >
                                {/* Task checkbox indicator */}
                                {isTaskEntry && (
                                    <div className="task-check-col">
                                        {entry.isCompleted 
                                            ? <CheckCircle2 size={20} color="#9CA3AF" />
                                            : <Circle size={20} color={entry.color || '#10B981'} />
                                        }
                                    </div>
                                )}

                                {/* Event color bar indicator */}
                                {!isTaskEntry && (
                                <div className="agenda-time-col">
                                    {entry.allDay ? (
                                        <span className="time-text">All Day</span>
                                    ) : (
                                        <>
                                            <span className="time-text start">{format(entry.start, 'h:mm a')}</span>
                                            <span className="duration-text">
                                                {format(entry.end || entry.start, 'h:mm a')}
                                            </span>
                                        </>
                                    )}
                                </div>
                                )}
                                
                                <div className="agenda-info-col">
                                    <div className={`entry-title ${entry.isCompleted ? 'line-through' : ''}`}>{entry.title}</div>

                                    {/* Time for tasks (shown inline) */}
                                    {isTaskEntry && entry.allDay && (
                                        <div className="task-due-label">Due today</div>
                                    )}
                                    {isTaskEntry && !entry.allDay && (
                                        <div className="task-due-label">{format(entry.start, 'h:mm a')}</div>
                                    )}

                                    <div className="entry-meta">
                                        {isTaskEntry ? (
                                            <span className="meta-tag task">
                                                <CheckSquare size={12} /> Task
                                            </span>
                                        ) : isEventEntry ? (
                                            <span className="meta-tag event-tag">
                                                {entry.source === 'google' ? 'Google Calendar' : 'Event'}
                                            </span>
                                        ) : (
                                            <span className="meta-tag event">
                                                {entry.source === 'google' ? 'Google' : (entry.sourceType || 'Item')}
                                            </span>
                                        )}
                                        {entry.location && (
                                            <span className="meta-tag location">
                                                <MapPin size={10} /> {entry.location.substring(0, 25)}
                                            </span>
                                        )}
                                        {entry.meetLink && (
                                            <span className="meta-tag meet">
                                                <Video size={10} /> Meet
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <style>{`
                .mobile-calendar-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: var(--bg-app);
                }

                .week-strip-header {
                    background: white;
                    border-bottom: 1px solid var(--border-light);
                    padding-bottom: 12px;
                    flex-shrink: 0;
                }

                .week-nav-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 16px;
                }

                .month-label {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: var(--text-primary);
                }

                .week-nav-buttons {
                    display: flex;
                    gap: 16px;
                }

                .nav-btn {
                    background: transparent;
                    border: none;
                    color: var(--text-secondary);
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .week-days-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 0 8px;
                }

                .week-day-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    width: 44px;
                    height: 64px;
                    border-radius: 22px; /* Pill shape */
                    transition: all 0.2s;
                    position: relative;
                }

                .day-name {
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: var(--text-muted);
                    margin-bottom: 4px;
                    text-transform: uppercase;
                }

                .day-num {
                    font-size: 1.1rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                }

                /* Selected State */
                .week-day-item.selected {
                    background: #3B82F6;
                }
                .week-day-item.selected .day-name { color: rgba(255,255,255,0.8); }
                .week-day-item.selected .day-num { color: white; }
                
                /* Today State (if not selected) */
                .week-day-item.today:not(.selected) .day-num {
                    color: #3B82F6;
                    background: rgba(59, 130, 246, 0.1);
                }

                .day-dot {
                    width: 4px;
                    height: 4px;
                    background: var(--accent);
                    border-radius: 50%;
                    position: absolute;
                    bottom: 6px;
                }
                .week-day-item.selected .day-dot { background: white; }

                /* Agenda Stream */
                .agenda-stream {
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px;
                }

                .empty-agenda-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    color: var(--text-muted);
                    text-align: center;
                    padding-bottom: 80px; /* offset for fab if needed */
                }
                .empty-icon {
                    margin-bottom: 16px;
                    opacity: 0.2;
                }
                .empty-agenda-state h3 {
                    font-size: 1.1rem;
                    margin-bottom: 8px;
                    color: var(--text-secondary);
                }

                .agenda-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .agenda-card {
                    background: white;
                    border-radius: 12px;
                    padding: 12px 16px;
                    display: flex;
                    gap: 16px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                    border-left: 4px solid #ccc;
                }

                .agenda-time-col {
                    display: flex;
                    flex-direction: column;
                    min-width: 60px;
                    padding-top: 2px;
                }

                .time-text {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: var(--text-primary);
                }
                .duration-text {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    margin-top: 2px;
                }

                .agenda-info-col {
                    flex: 1;
                    padding-top: 2px;
                }

                .entry-title {
                    font-size: 0.95rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin-bottom: 6px;
                    line-height: 1.3;
                }

                .entry-meta {
                    display: flex;
                    gap: 8px;
                }

                .meta-tag {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.7rem;
                    padding: 2px 8px;
                    border-radius: 4px;
                    background: var(--bg-app);
                    color: var(--text-secondary);
                    font-weight: 500;
                }
                .meta-tag.location { color: #2563EB; }
                .meta-tag.meet { color: #00897B; background: #E0F2F1; }

                .agenda-card.completed {
                    opacity: 0.6;
                }
                .agenda-card.completed .entry-title {
                    text-decoration: line-through;
                    color: var(--text-muted);
                }
                .entry-title.line-through {
                    text-decoration: line-through;
                    color: var(--text-muted);
                }

                /* Task card styles */
                .agenda-card.task-card {
                    border-left: none !important;
                    background: var(--bg-app);
                    box-shadow: none;
                    border: 1px solid var(--border-light);
                }
                .task-check-col {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 4px;
                    flex-shrink: 0;
                }
                .task-due-label {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    margin-bottom: 4px;
                }
                .meta-tag.event-tag {
                    background: #E8F0FE;
                    color: #1A73E8;
                }
            `}</style>
        </div>
    );
}

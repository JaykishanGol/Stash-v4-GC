import { startOfWeek, endOfWeek, eachDayOfInterval, format, isToday } from 'date-fns';
import { useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { CalendarEntry } from '../../hooks/useGoogleCalendar';
import { GoogleSyncService } from '../../lib/googleSyncService';
import { GoogleEventDetail } from './GoogleEventDetail';

interface CalendarWeekViewProps {
    viewDate: Date;
    mode?: 'week' | 'day';
    onSelectDate?: (date: Date) => void;
    getEntriesForDate: (date: Date) => CalendarEntry[];
}

export function CalendarWeekView({ viewDate, mode = 'week', onSelectDate, getEntriesForDate }: CalendarWeekViewProps) {
    const { updateItem, updateTask, openScheduler } = useAppStore();
    const [selectedGhostEntry, setSelectedGhostEntry] = useState<CalendarEntry | null>(null);

    const days = mode === 'week'
        ? eachDayOfInterval({ start: startOfWeek(viewDate), end: endOfWeek(viewDate) })
        : [viewDate];

    const hours = Array.from({ length: 24 }, (_, i) => i);

    const handleEntryClick = (e: React.MouseEvent, entry: CalendarEntry) => {
        e.stopPropagation();
        if (entry.isGhost) {
            setSelectedGhostEntry(entry);
            return;
        }
        if (entry.type === 'item' || entry.type === 'task') {
            openScheduler(entry.id);
        }
    };

    const handleDragStart = (e: React.DragEvent, entry: CalendarEntry) => {
        if (entry.isGhost) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('text/plain', entry.id);
        e.dataTransfer.setData('item-type', entry.type === 'task' ? 'task' : 'item');
        e.dataTransfer.setData('duration', String((entry.end?.getTime() || 0) - entry.start.getTime()));
    };

    const handleDrop = async (e: React.DragEvent, day: Date) => {
        e.preventDefault();
        const itemId = e.dataTransfer.getData('text/plain');
        const itemType = e.dataTransfer.getData('item-type');

        if (!itemId) return;

        // Calculate time from Y position
        const gridRect = e.currentTarget.getBoundingClientRect();
        const relativeY = e.clientY - gridRect.top + e.currentTarget.scrollTop;
        const minutes = Math.floor(relativeY); // 1px = 1min

        // Snap to 15 min
        const snappedMinutes = Math.round(minutes / 15) * 15;
        const hours = Math.floor(snappedMinutes / 60);
        const mins = snappedMinutes % 60;

        const newDate = new Date(day);
        newDate.setHours(hours, mins, 0, 0);
        const isoDate = newDate.toISOString();

        const updates: any = {
            scheduled_at: isoDate
        };

        // For tasks, we also update scheduled_at
        if (itemType === 'task') {
            updateTask(itemId, updates);

            // Seamless Sync
            const { tasks } = useAppStore.getState();
            const updatedTask = { ...tasks.find(t => t.id === itemId), ...updates };
            GoogleSyncService.syncToGoogleTask(updatedTask, { dueDate: isoDate });
        } else {
            updateItem(itemId, updates);

            // Seamless Sync (Try both Event and Task since we don't know which one it is yet)
            const { items } = useAppStore.getState();
            const updatedItem = { ...items.find(i => i.id === itemId), ...updates };
            // Naive "Try Sync" - ideally we check links first, but this is okay for "Update if exists" logic
            GoogleSyncService.syncToGoogleEvent(updatedItem, {
                start: isoDate,
                end: new Date(newDate.getTime() + 3600000).toISOString() // Default 1h duration
            });
        }
    };

    // Calculate position and height for timed events
    const getEventStyle = (entry: CalendarEntry) => {
        const startHour = entry.start.getHours();
        const startMin = entry.start.getMinutes();
        const endHour = entry.end ? entry.end.getHours() : startHour + 1;
        const endMin = entry.end ? entry.end.getMinutes() : startMin;

        const top = (startHour * 60 + startMin); // minutes from top
        const duration = ((endHour * 60 + endMin) - top) || 60; // duration in minutes, default 60

        return {
            top: `${top}px`,
            height: `${Math.max(24, duration)}px`, // Min height 24px
            backgroundColor: entry.color || '#4285F4',
            opacity: entry.isGhost ? 0.8 : 1
        };
    };

    return (
        <div className="week-view">
            {/* Google Event Detail Popup */}
            {selectedGhostEntry && (
                <GoogleEventDetail
                    entry={selectedGhostEntry}
                    onClose={() => setSelectedGhostEntry(null)}
                />
            )}

            {/* Header Row: Days */}
            <div className="week-header">
                <div className="time-gutter-header"></div>
                {days.map(day => (
                    <div key={day.toISOString()} className={`day-column-header ${isToday(day) ? 'is-today' : ''}`}>
                        <div className="day-name">{format(day, 'EEE')}</div>
                        <div className="day-num" onClick={() => onSelectDate?.(day)}>{format(day, 'd')}</div>

                        {/* All Day Events Section */}
                        <div className="all-day-section">
                            {getEntriesForDate(day).filter(e => e.allDay).map(entry => {
                                const isTaskEntry = entry.type === 'task' || entry.type === 'google-task';
                                return (
                                <div
                                    key={entry.id}
                                    className={`all-day-chip ${entry.isGhost ? 'ghost' : ''} ${isTaskEntry ? 'task-chip' : ''} ${entry.isCompleted ? 'is-completed' : ''}`}
                                    style={{ backgroundColor: isTaskEntry ? 'transparent' : entry.color }}
                                    onClick={(e) => handleEntryClick(e, entry)}
                                >
                                    {isTaskEntry && (
                                        entry.isCompleted
                                            ? <CheckCircle2 size={12} className="task-check-icon done" />
                                            : <Circle size={12} className="task-check-icon" style={{ color: entry.color }} />
                                    )}
                                    <span className={`chip-title ${entry.isCompleted ? 'line-through' : ''}`}>{entry.title}</span>
                                </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Scrollable Grid: Hours */}
            <div className="week-grid-scroll">
                <div className="week-grid">
                    {/* Time Labels */}
                    <div className="time-gutter">
                        {hours.map(hour => (
                            <div key={hour} className="time-label">
                                <span className="time-text">
                                    {hour === 0 ? '' : format(new Date().setHours(hour), 'h a')}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Columns */}
                    {days.map(day => (
                        <div
                            key={day.toISOString()}
                            className="day-column"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDrop(e, day)}
                        >
                            {/* Grid Lines */}
                            {hours.map(hour => (
                                <div key={hour} className="hour-cell"></div>
                            ))}

                            {/* Timed Events */}
                            {getEntriesForDate(day).filter(e => !e.allDay).map(entry => {
                                const isTaskEntry = entry.type === 'task' || entry.type === 'google-task';
                                return (
                                <div
                                    key={entry.id}
                                    className={`timed-event ${entry.isGhost ? 'ghost' : ''} ${isTaskEntry ? 'task-event' : ''} ${entry.isCompleted ? 'is-completed' : ''}`}
                                    style={isTaskEntry ? {
                                        ...getEventStyle(entry),
                                        backgroundColor: 'transparent',
                                        border: `1px ${entry.isGhost ? 'dashed' : 'solid'} ${entry.color || '#10B981'}`,
                                        color: 'var(--text-primary)'
                                    } : getEventStyle(entry)}
                                    onClick={(e) => handleEntryClick(e, entry)}
                                    draggable={!entry.isGhost}
                                    onDragStart={(e) => handleDragStart(e, entry)}
                                    title={`${entry.title} (${format(entry.start, 'h:mm a')})`}
                                >
                                    <div className="event-content">
                                        {isTaskEntry && (
                                            entry.isCompleted
                                                ? <CheckCircle2 size={12} className="task-check done" />
                                                : <Circle size={12} className="task-check" style={{ color: entry.color }} />
                                        )}
                                        <span className={`event-title ${entry.isCompleted ? 'line-through' : ''}`}>{entry.title}</span>
                                        <span className="event-time">{format(entry.start, 'h:mm a')}</span>
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
                .week-view {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: var(--bg-app);
                    overflow: hidden;
                }

                .week-header {
                    display: flex;
                    border-bottom: 1px solid var(--border-light);
                    flex-shrink: 0;
                    background: var(--bg-app);
                }
                .time-gutter-header {
                    width: 60px;
                    flex-shrink: 0;
                    border-right: 1px solid var(--border-light);
                    background: var(--bg-app);
                }
                .day-column-header {
                    flex: 1;
                    min-width: 0;
                    border-right: 1px solid var(--border-light);
                    text-align: center;
                    padding: 8px 4px;
                    background: var(--bg-app);
                }
                .day-column-header:last-child { border-right: none; }
                .day-column-header.is-today .day-num {
                    background: var(--primary);
                    color: white;
                }
                .day-column-header.is-today .day-name {
                    color: var(--primary);
                }

                .day-name { font-size: 11px; font-weight: 500; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px; }
                .day-num {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 46px; height: 46px;
                    border-radius: 50%;
                    font-size: 24px;
                    color: var(--text-primary);
                    cursor: pointer;
                }
                .day-num:hover { background: rgba(0,0,0,0.05); }

                .all-day-section {
                    margin-top: 4px;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .all-day-chip {
                    font-size: 12px;
                    color: white;
                    padding: 2px 6px;
                    border-radius: 4px;
                    text-align: left;
                    cursor: pointer;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .all-day-chip.ghost {
                    opacity: 0.7;
                    border: 1px dashed rgba(255,255,255,0.5);
                }

                .week-grid-scroll {
                    flex: 1;
                    overflow-y: auto;
                    position: relative;
                    background: var(--bg-app);
                }
                .week-grid {
                    display: flex;
                    min-height: 1440px; /* 24 hours * 60px */
                }

                .time-gutter {
                    width: 60px;
                    flex-shrink: 0;
                    border-right: 1px solid var(--border-light);
                    background: var(--bg-app);
                }
                .time-label {
                    height: 60px; /* 1 hour */
                    position: relative;
                }
                .time-text {
                    position: absolute;
                    top: -6px;
                    right: 8px;
                    font-size: 10px;
                    color: var(--text-muted);
                }

                .day-column {
                    flex: 1;
                    border-right: 1px solid var(--border-light);
                    position: relative;
                    min-width: 0;
                    background: var(--bg-app);
                }
                .day-column:last-child { border-right: none; }
                
                .hour-cell {
                    height: 60px;
                    border-bottom: 1px solid var(--border-light);
                    box-sizing: border-box;
                }
                .hour-cell:first-child { border-top: 1px solid transparent; } /* align with time label */

                .timed-event {
                    position: absolute;
                    left: 2px; right: 4px; /* margins */
                    border-radius: 4px;
                    padding: 4px;
                    cursor: pointer;
                    overflow: hidden;
                    color: white;
                    border: 1px solid white;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.2);
                    z-index: 10;
                }
                .timed-event.ghost {
                    border-style: dashed;
                    opacity: 0.8;
                }
                .timed-event:hover {
                    z-index: 20;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                }

                .event-content { display: flex; flex-direction: column; }
                .event-title { font-size: 12px; font-weight: 500; line-height: 1.2; }
                .event-time { font-size: 10px; opacity: 0.9; margin-top: 2px; }

                /* Task-specific styles */
                .all-day-chip.task-chip {
                    background: transparent !important;
                    border: 1px solid var(--border-light);
                    color: var(--text-primary);
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .task-check-icon { flex-shrink: 0; }
                .task-check-icon.done { color: #9CA3AF; }
                .chip-title.line-through, .event-title.line-through {
                    text-decoration: line-through;
                    color: var(--text-muted);
                }
                .is-completed { opacity: 0.5; }

                .timed-event.task-event {
                    background: white !important;
                    box-shadow: none;
                }
                .task-check { flex-shrink: 0; margin-bottom: 2px; }
                .task-check.done { color: #9CA3AF; }
            `}</style>
        </div>
    );
}

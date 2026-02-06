import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth, isSameDay, isToday } from 'date-fns';
import { useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { CalendarEntry } from '../../hooks/useGoogleCalendar';
import { GoogleSyncService } from '../../lib/googleSyncService';
import { GoogleEventDetail } from './GoogleEventDetail';

interface CalendarGridProps {
    viewDate: Date;
    selectedDate?: Date | null;
    onSelectDate?: (date: Date) => void;
    getEntriesForDate: (date: Date) => CalendarEntry[];
}

export function CalendarGrid({ viewDate, selectedDate, onSelectDate, getEntriesForDate }: CalendarGridProps) {
    const { updateItem, updateTask, openScheduler } = useAppStore();
    const [selectedGhostEntry, setSelectedGhostEntry] = useState<CalendarEntry | null>(null);

    // Generate calendar days
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const weekCount = Math.ceil(days.length / 7);

    const handleDrop = (e: React.DragEvent, date: Date) => {
        e.preventDefault();
        const itemId = e.dataTransfer.getData('text/plain');
        const itemType = e.dataTransfer.getData('item-type');
        if (itemId) {
            const newDate = new Date(date);
            newDate.setHours(12, 0, 0, 0);
            const isoDate = newDate.toISOString();
            const updates = {
                scheduled_at: isoDate,
            };

            if (itemType === 'task') {
                updateTask(itemId, updates);
                const { tasks } = useAppStore.getState();
                const foundTask = tasks.find(t => t.id === itemId);
                if (foundTask) {
                    GoogleSyncService.syncToGoogleTask({ ...foundTask, ...updates }, { dueDate: isoDate });
                }
            } else {
                updateItem(itemId, updates);
                const { items } = useAppStore.getState();
                const foundItem = items.find(i => i.id === itemId);
                if (foundItem) {
                    GoogleSyncService.syncToGoogleEvent({ ...foundItem, ...updates }, {
                        start: isoDate,
                        end: isoDate,
                    });
                }
            }
        }
    };

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

    return (
        <div className="calendar-grid-container" style={{ '--week-count': weekCount } as React.CSSProperties}>
            {/* Google Event Detail Popup */}
            {selectedGhostEntry && (
                <GoogleEventDetail
                    entry={selectedGhostEntry}
                    onClose={() => setSelectedGhostEntry(null)}
                />
            )}

            {/* Weekday Headers */}
            <div className="calendar-header-row">
                {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                    <div key={day} className="weekday-header">{day}</div>
                ))}
            </div>

            {/* Grid */}
            <div className="calendar-body-grid">
                {days.map(day => {
                    const entries = getEntriesForDate(day);
                    const isCurrentMonth = isSameMonth(day, monthStart);
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    
                    // Limit visible entries to 3
                    const visibleEntries = entries.slice(0, 3);
                    const hiddenCount = entries.length - 3;

                    return (
                        <div
                            key={day.toISOString()}
                            className={`grid-day ${!isCurrentMonth ? 'other-month' : ''} ${isToday(day) ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => onSelectDate?.(day)}
                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                            onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
                            onDrop={(e) => { e.currentTarget.classList.remove('drag-over'); handleDrop(e, day); }}
                        >
                            <div className="day-header">
                                <span className="day-number">{format(day, 'd')}</span>
                            </div>

                            <div className="day-content">
                                {visibleEntries.map(entry => {
                                    const isTaskEntry = entry.type === 'task' || entry.type === 'google-task';
                                    return (
                                    <div
                                        key={entry.id}
                                        className={`event-chip ${isTaskEntry ? 'task-chip' : entry.allDay ? 'all-day' : 'timed'} ${entry.isGhost ? 'ghost' : ''} ${entry.isCompleted ? 'is-completed' : ''}`}
                                        style={{ '--event-color': entry.color || '#3B82F6' } as React.CSSProperties}
                                        onClick={(e) => handleEntryClick(e, entry)}
                                        draggable={!entry.isGhost}
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('text/plain', entry.id);
                                            e.dataTransfer.setData('item-type', entry.type === 'task' ? 'task' : 'item');
                                        }}
                                        title={entry.title}
                                    >
                                        {isTaskEntry ? (
                                            // Task: Checkbox + title (Google Calendar style)
                                            <>
                                                {entry.isCompleted 
                                                    ? <CheckCircle2 size={12} className="task-check-icon done" />
                                                    : <Circle size={12} className="task-check-icon" style={{ color: entry.color }} />
                                                }
                                                <span className={`event-title ${entry.isCompleted ? 'line-through' : ''}`}>{entry.title}</span>
                                            </>
                                        ) : entry.allDay ? (
                                            // All Day Event: Solid Block
                                            <span className="event-title">{entry.title}</span>
                                        ) : (
                                            // Timed Event: Dot + Time + Text
                                            <>
                                                <span className="event-dot" />
                                                <span className="event-time">{format(entry.start, 'h:mm a')}</span>
                                                <span className="event-title">{entry.title}</span>
                                            </>
                                        )}
                                    </div>
                                    );
                                })}n                                {hiddenCount > 0 && (
                                    <div className="more-events">+{hiddenCount} more</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <style>{`
                .calendar-grid-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: var(--bg-app);
                }

                .calendar-header-row {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    border-bottom: 1px solid var(--border-light);
                    flex-shrink: 0;
                    background: var(--bg-app);
                }

                .weekday-header {
                    padding: 12px 8px;
                    text-align: center;
                    font-size: 11px;
                    font-weight: 600;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .calendar-body-grid {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    grid-template-rows: repeat(var(--week-count), 1fr);
                    flex: 1;
                    min-height: 0;
                    background: var(--bg-app);
                }

                .grid-day {
                    border-right: 1px solid var(--border-light);
                    border-bottom: 1px solid var(--border-light);
                    padding: 2px;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                    overflow: hidden;
                    cursor: pointer;
                    transition: background 0.1s;
                    background: var(--bg-app);
                }
                .grid-day:nth-child(7n) { border-right: none; }
                
                /* Subtle distinction for other month days */
                .grid-day.other-month { 
                    background: rgba(0,0,0,0.03);
                    background-image: radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px);
                    background-size: 20px 20px;
                } 
                .grid-day.other-month .day-number { color: var(--text-muted); opacity: 0.5; }
                
                .grid-day:hover { background: rgba(0,0,0,0.02); }
                .grid-day.drag-over { background: var(--bg-selection); }

                .day-header {
                    text-align: center;
                    padding: 8px 0;
                }

                .day-number {
                    font-size: 12px;
                    font-weight: 500;
                    color: var(--text-primary);
                    width: 24px;
                    height: 24px;
                    line-height: 24px;
                    display: inline-block;
                    border-radius: 50%;
                }

                .grid-day.is-today .day-number {
                    background: var(--primary);
                    color: white;
                    font-weight: 600;
                }

                .day-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    padding: 0 2px 2px;
                    overflow: hidden;
                }

                /* Events */
                .event-chip {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 1px 4px;
                    border-radius: 4px;
                    font-size: 11px;
                    cursor: pointer;
                    overflow: hidden;
                    white-space: nowrap;
                    min-height: 18px;
                }

                /* All Day Style */
                .event-chip.all-day {
                    background: var(--event-color);
                    color: white;
                }
                .event-chip.all-day .event-title {
                    font-weight: 500;
                }

                /* Timed Style (Dot) */
                .event-chip.timed {
                    background: transparent;
                    color: var(--text-primary);
                }
                .event-chip.timed:hover {
                    background: rgba(0,0,0,0.04);
                }
                .event-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: var(--event-color);
                    flex-shrink: 0;
                }
                .event-time {
                    color: var(--text-muted);
                    font-size: 10px;
                    margin-right: 2px;
                }

                .event-title {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    font-weight: 400;
                }

                .event-chip.ghost {
                    opacity: 0.6;
                    border: 1px dashed var(--event-color);
                }

                /* Task Chips - Google Calendar style */
                .event-chip.task-chip {
                    background: transparent;
                    color: var(--text-primary);
                }
                .event-chip.task-chip:hover {
                    background: rgba(0,0,0,0.04);
                }
                .task-check-icon {
                    flex-shrink: 0;
                    color: var(--event-color);
                }
                .task-check-icon.done {
                    color: #9CA3AF;
                }
                .event-chip.is-completed {
                    opacity: 0.5;
                }
                .event-title.line-through {
                    text-decoration: line-through;
                    color: var(--text-muted);
                }

                .more-events {
                    font-size: 10px;
                    font-weight: 600;
                    color: var(--text-secondary);
                    padding-left: 6px;
                    margin-top: 1px;
                }
                .more-events:hover {
                    color: var(--primary);
                }
            `}</style>
        </div>
    );
}

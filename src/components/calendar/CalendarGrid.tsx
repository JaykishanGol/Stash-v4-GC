import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth, isSameDay, isToday } from 'date-fns';
import { useAppStore } from '../../store/useAppStore';
import { CheckSquare, Calendar as CalendarIcon, File, Folder, Link, Image } from 'lucide-react';
import type { CalendarEntry } from '../../hooks/useGoogleCalendar';
import { GoogleSyncService } from '../../lib/googleSyncService';

interface CalendarGridProps {
    viewDate: Date;
    selectedDate?: Date | null;
    onSelectDate?: (date: Date) => void;
    getEntriesForDate: (date: Date) => CalendarEntry[];
}

export function CalendarGrid({ viewDate, selectedDate, onSelectDate, getEntriesForDate }: CalendarGridProps) {
    const { updateItem, updateTask, openScheduler } = useAppStore();

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
                due_at: isoDate,
                next_trigger_at: isoDate,
                reminder_type: 'one_time' as const,
                one_time_at: isoDate
            };

            if (itemType === 'task') {
                updateTask(itemId, updates);
                 // Seamless Sync
                const { tasks } = useAppStore.getState();
                const updatedTask = { ...tasks.find(t => t.id === itemId), ...updates };
                GoogleSyncService.syncToGoogleTask(updatedTask, { dueDate: isoDate });
            } else {
                updateItem(itemId, updates);
                
                // Seamless Sync
                const { items } = useAppStore.getState();
                const updatedItem = { ...items.find(i => i.id === itemId), ...updates };
                GoogleSyncService.syncToGoogleEvent(updatedItem, { 
                    start: isoDate, 
                    end: isoDate, // All day usually
                    isAllDay: true
                });
            }
        }
    };

    const handleEntryClick = (e: React.MouseEvent, entry: CalendarEntry) => {
        e.stopPropagation();
        if (entry.isGhost) {
            // For now, alert or simple log. In Phase 2, this will open a Google Event Detail modal
            console.log('Clicked Ghost Event:', entry);
            alert(`Google Event: ${entry.title}\n(This is a live preview from Google)`);
            return;
        }

        if (entry.type === 'item' || entry.type === 'task') {
            openScheduler(entry.id);
        }
    };

    const getIcon = (entry: CalendarEntry) => {
        if (entry.type === 'google-event') return <CalendarIcon size={10} />;
        if (entry.type === 'google-task') return <CheckSquare size={10} />;
        if (entry.type === 'task') return <CheckSquare size={10} />;
        
        // Item types
        switch (entry.sourceType) {
            case 'file': return <File size={10} />;
            case 'folder': return <Folder size={10} />;
            case 'link': return <Link size={10} />;
            case 'image': return <Image size={10} />;
            default: return null;
        }
    };

    return (
        <div className="calendar-grid" style={{ '--week-count': weekCount } as React.CSSProperties}>
            {/* Weekday Headers */}
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                <div key={day} className="weekday-header">{day}</div>
            ))}

            {/* Days */}
            {days.map(day => {
                const entries = getEntriesForDate(day);
                const isCurrentMonth = isSameMonth(day, monthStart);
                const isSelected = selectedDate && isSameDay(day, selectedDate);

                return (
                    <div
                        key={day.toISOString()}
                        className={`calendar-grid-day ${!isCurrentMonth ? 'other-month' : ''} ${isToday(day) ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => onSelectDate?.(day)}
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                        onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
                        onDrop={(e) => { e.currentTarget.classList.remove('drag-over'); handleDrop(e, day); }}
                    >
                        <span className={`day-number ${isToday(day) ? 'today-badge' : ''}`}>
                            {format(day, 'd')}
                        </span>

                        <div className="day-entries">
                            {entries.slice(0, 4).map(entry => (
                                <div
                                    key={entry.id}
                                    className={`calendar-chip ${entry.allDay ? 'all-day' : 'timed'} ${entry.isGhost ? 'ghost' : ''}`}
                                    style={{ '--chip-color': entry.color } as React.CSSProperties}
                                    onClick={(e) => handleEntryClick(e, entry)}
                                    draggable={!entry.isGhost}
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', entry.id);
                                        e.dataTransfer.setData('item-type', entry.type === 'task' ? 'task' : 'item');
                                    }}
                                    title={entry.title}
                                >
                                    {getIcon(entry)}
                                    {!entry.allDay && (
                                        <span className="chip-time">{format(entry.start, 'h:mma').toLowerCase()}</span>
                                    )}
                                    <span className="chip-title">{entry.title}</span>
                                </div>
                            ))}
                            {entries.length > 4 && (
                                <div className="more-count">+{entries.length - 4} more</div>
                            )}
                        </div>
                    </div>
                );
            })}

            <style>{`
                .calendar-grid {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    grid-template-rows: auto repeat(var(--week-count, 5), 1fr);
                    height: 100%;
                    gap: 0;
                    border: 1px solid var(--border-light);
                    background: var(--bg-content);
                }

                .weekday-header {
                    background: var(--bg-content);
                    padding: 12px 8px;
                    text-align: center;
                    font-weight: 500;
                    font-size: 11px;
                    letter-spacing: 0.05em;
                    color: var(--text-muted);
                    border-bottom: 1px solid var(--border-light);
                }

                .calendar-grid-day {
                    background: var(--bg-content);
                    border-right: 1px solid var(--border-light);
                    border-bottom: 1px solid var(--border-light);
                    padding: 4px;
                    min-height: 100px;
                    display: flex;
                    flex-direction: column;
                    cursor: pointer;
                    transition: background 0.1s;
                }
                .calendar-grid-day:nth-child(7n) { border-right: none; }
                .calendar-grid-day:hover { background: rgba(0,0,0,0.02); }
                .calendar-grid-day.other-month { background: #FAFAFA; }
                .calendar-grid-day.other-month .day-number { color: var(--text-muted); opacity: 0.5; }
                .calendar-grid-day.is-selected { background: #E8F0FE; }
                .calendar-grid-day.drag-over { background: #E3F2FD; }

                .day-number {
                    font-size: 12px;
                    font-weight: 500;
                    color: var(--text-secondary);
                    padding: 4px 8px;
                    text-align: center;
                    align-self: flex-start;
                }
                .day-number.today-badge {
                    background: #1A73E8;
                    color: white;
                    border-radius: 50%;
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                }

                .day-entries {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    overflow: hidden;
                }

                .calendar-chip {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.1s;
                    overflow: hidden;
                }
                .calendar-chip.all-day {
                    background: var(--chip-color);
                    color: white;
                }
                .calendar-chip.timed {
                    background: transparent;
                    color: var(--text-primary);
                    border-left: 3px solid var(--chip-color);
                    padding-left: 4px;
                }
                .calendar-chip.ghost {
                    border: 1px dashed var(--chip-color);
                    background: rgba(255, 255, 255, 0.5);
                    opacity: 0.8;
                }
                .calendar-chip:hover {
                    opacity: 0.9;
                    transform: translateX(1px);
                }

                .chip-time {
                    font-size: 10px;
                    color: var(--chip-color);
                    font-weight: 500;
                    flex-shrink: 0;
                }
                .chip-title {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .more-count {
                    font-size: 11px;
                    color: var(--text-muted);
                    padding: 2px 6px;
                    font-weight: 500;
                }

                /* Dark mode */
                :global(.dark) .calendar-grid-day.other-month { background: #1a1a1a; }
            `}</style>
        </div>
    );
}

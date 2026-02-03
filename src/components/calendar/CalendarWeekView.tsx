import { startOfWeek, endOfWeek, eachDayOfInterval, format, isSameDay, isToday, addDays } from 'date-fns';
import { useAppStore } from '../../store/useAppStore';
import { CheckSquare, Calendar as CalendarIcon, File, Folder, Link, Image } from 'lucide-react';
import type { CalendarEntry } from '../../hooks/useGoogleCalendar';
import { GoogleSyncService } from '../../lib/googleSyncService';

interface CalendarWeekViewProps {
    viewDate: Date;
    mode?: 'week' | 'day';
    onSelectDate?: (date: Date) => void;
    getEntriesForDate: (date: Date) => CalendarEntry[];
}

export function CalendarWeekView({ viewDate, mode = 'week', onSelectDate, getEntriesForDate }: CalendarWeekViewProps) {
    const { updateItem, updateTask } = useAppStore();

    const days = mode === 'week'
        ? eachDayOfInterval({ start: startOfWeek(viewDate), end: endOfWeek(viewDate) })
        : [viewDate];

    const hours = Array.from({ length: 24 }, (_, i) => i);

    const getIcon = (entry: CalendarEntry) => {
        if (entry.type === 'google-event') return <CalendarIcon size={12} />;
        if (entry.type === 'google-task') return <CheckSquare size={12} />;
        if (entry.type === 'task') return <CheckSquare size={12} />;
        switch (entry.sourceType) {
            case 'file': return <File size={12} />;
            case 'folder': return <Folder size={12} />;
            case 'link': return <Link size={12} />;
            case 'image': return <Image size={12} />;
            default: return null;
        }
    };

    const handleEntryClick = (e: React.MouseEvent, entry: CalendarEntry) => {
        e.stopPropagation();
        if (entry.isGhost) {
            alert(`Google Event: ${entry.title}`);
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
            next_trigger_at: isoDate,
            reminder_type: 'one_time',
            one_time_at: isoDate
        };

        // For tasks, we also update due_at
        if (itemType === 'task') {
            updates.due_at = isoDate;
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
            {/* Header Row: Days */}
            <div className="week-header">
                <div className="time-gutter-header"></div>
                {days.map(day => (
                    <div key={day.toISOString()} className={`day-column-header ${isToday(day) ? 'is-today' : ''}`}>
                        <div className="day-name">{format(day, 'EEE')}</div>
                        <div className="day-num" onClick={() => onSelectDate?.(day)}>{format(day, 'd')}</div>
                        
                        {/* All Day Events Section */}
                        <div className="all-day-section">
                            {getEntriesForDate(day).filter(e => e.allDay).map(entry => (
                                <div 
                                    key={entry.id} 
                                    className={`all-day-chip ${entry.isGhost ? 'ghost' : ''}`}
                                    style={{ backgroundColor: entry.color }}
                                    onClick={(e) => handleEntryClick(e, entry)}
                                >
                                    <span className="chip-title">{entry.title}</span>
                                </div>
                            ))}
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
                            {getEntriesForDate(day).filter(e => !e.allDay).map(entry => (
                                <div
                                    key={entry.id}
                                    className={`timed-event ${entry.isGhost ? 'ghost' : ''}`}
                                    style={getEventStyle(entry)}
                                    onClick={(e) => handleEntryClick(e, entry)}
                                    draggable={!entry.isGhost}
                                    onDragStart={(e) => handleDragStart(e, entry)}
                                    title={`${entry.title} (${format(entry.start, 'h:mm a')})`}
                                >
                                    <div className="event-content">
                                        <span className="event-title">{entry.title}</span>
                                        <span className="event-time">{format(entry.start, 'h:mm a')}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
                .week-view {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: white;
                    overflow: hidden;
                }

                .week-header {
                    display: flex;
                    border-bottom: 1px solid #DADCE0;
                    flex-shrink: 0;
                }
                .time-gutter-header {
                    width: 60px;
                    flex-shrink: 0;
                    border-right: 1px solid #DADCE0;
                }
                .day-column-header {
                    flex: 1;
                    min-width: 0;
                    border-right: 1px solid #DADCE0;
                    text-align: center;
                    padding: 8px 4px;
                }
                .day-column-header:last-child { border-right: none; }
                .day-column-header.is-today .day-num {
                    background: #1A73E8;
                    color: white;
                }
                .day-column-header.is-today .day-name {
                    color: #1A73E8;
                }

                .day-name { font-size: 11px; font-weight: 500; color: #70757A; text-transform: uppercase; margin-bottom: 4px; }
                .day-num {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 46px; height: 46px;
                    border-radius: 50%;
                    font-size: 24px;
                    color: #3C4043;
                    cursor: pointer;
                }
                .day-num:hover { background: #F1F3F4; }

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
                }
                .week-grid {
                    display: flex;
                    min-height: 1440px; /* 24 hours * 60px */
                }

                .time-gutter {
                    width: 60px;
                    flex-shrink: 0;
                    border-right: 1px solid #DADCE0;
                    background: white;
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
                    color: #70757A;
                }

                .day-column {
                    flex: 1;
                    border-right: 1px solid #DADCE0;
                    position: relative;
                    min-width: 0;
                }
                .day-column:last-child { border-right: none; }
                
                .hour-cell {
                    height: 60px;
                    border-bottom: 1px solid #F1F3F4;
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
            `}</style>
        </div>
    );
}

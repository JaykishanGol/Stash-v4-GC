/**
 * CalendarYearView — Google Calendar style year overview
 * 
 * Shows 12 mini month grids with event dots indicating busy days.
 * Click a day to navigate to day view.
 */

import { useMemo } from 'react';
import {
    startOfYear, endOfYear, eachMonthOfInterval,
    startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, format, isSameMonth, isToday, isSameDay
} from 'date-fns';
import { useAppStore } from '../../store/useAppStore';

interface CalendarYearViewProps {
    year: number;
    onDateClick: (date: Date) => void;
    selectedDate: Date | null;
}

export function CalendarYearView({ year, onDateClick, selectedDate }: CalendarYearViewProps) {
    const calendarEvents = useAppStore((s) => s.calendarEvents);
    const items = useAppStore((s) => s.items);
    const tasks = useAppStore((s) => s.tasks);

    // Build a set of "busy" date strings (YYYY-MM-DD) for the entire year
    const busyDates = useMemo(() => {
        const dates = new Set<string>();

        for (const ev of calendarEvents) {
            if (ev.deleted_at || ev.is_deleted_instance) continue;
            const d = ev.start_at.slice(0, 10);
            dates.add(d);
        }
        for (const item of items) {
            if (item.deleted_at || !item.scheduled_at) continue;
            dates.add(item.scheduled_at.slice(0, 10));
        }
        for (const task of tasks) {
            if (task.deleted_at || !task.scheduled_at || task.is_completed) continue;
            dates.add(task.scheduled_at.slice(0, 10));
        }
        return dates;
    }, [calendarEvents, items, tasks]);

    // Color coding by event count
    const eventCountByDate = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const ev of calendarEvents) {
            if (ev.deleted_at || ev.is_deleted_instance) continue;
            const d = ev.start_at.slice(0, 10);
            counts[d] = (counts[d] || 0) + 1;
        }
        for (const item of items) {
            if (item.deleted_at || !item.scheduled_at) continue;
            const d = item.scheduled_at.slice(0, 10);
            counts[d] = (counts[d] || 0) + 1;
        }
        for (const task of tasks) {
            if (task.deleted_at || !task.scheduled_at || task.is_completed) continue;
            const d = task.scheduled_at.slice(0, 10);
            counts[d] = (counts[d] || 0) + 1;
        }
        return counts;
    }, [calendarEvents, items, tasks]);

    const yearStart = startOfYear(new Date(year, 0, 1));
    const yearEnd = endOfYear(yearStart);
    const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });

    return (
        <div className="year-view-container">
            <div className="year-view-grid">
                {months.map(monthDate => (
                    <MiniMonth
                        key={monthDate.toISOString()}
                        monthDate={monthDate}
                        busyDates={busyDates}
                        eventCounts={eventCountByDate}
                        onDateClick={onDateClick}
                        selectedDate={selectedDate}
                    />
                ))}
            </div>

            <style>{`
                .year-view-container {
                    height: 100%;
                    overflow-y: auto;
                    padding: 24px;
                    background: var(--bg-content, #fff);
                }
                .year-view-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 24px;
                    max-width: 1200px;
                    margin: 0 auto;
                }
                @media (max-width: 900px) {
                    .year-view-grid { grid-template-columns: repeat(3, 1fr); }
                }
                @media (max-width: 600px) {
                    .year-view-grid { grid-template-columns: repeat(2, 1fr); }
                    .year-view-container { padding: 12px; }
                }
                .mini-month-card {
                    border-radius: 8px;
                    padding: 12px;
                }
                .mini-month-title {
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--text-primary, #3c4043);
                    margin-bottom: 8px;
                    text-align: center;
                }
                .mini-month-grid {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    gap: 1px;
                }
                .mini-month-weekday {
                    text-align: center;
                    font-size: 9px;
                    font-weight: 500;
                    color: var(--text-muted, #70757a);
                    padding: 2px;
                }
                .mini-month-day {
                    aspect-ratio: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 11px;
                    border: none;
                    background: none;
                    border-radius: 50%;
                    cursor: pointer;
                    color: var(--text-primary, #3c4043);
                    position: relative;
                    padding: 0;
                    min-width: 24px;
                    min-height: 24px;
                }
                .mini-month-day:hover { background: rgba(0,0,0,0.05); }
                .mini-month-day.other-month { visibility: hidden; }
                .mini-month-day.is-today {
                    background: #1a73e8;
                    color: white;
                    font-weight: 700;
                }
                .mini-month-day.is-selected {
                    outline: 2px solid #1a73e8;
                    outline-offset: -2px;
                }
                .mini-month-day .busy-dot {
                    position: absolute;
                    bottom: 1px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 4px;
                    height: 4px;
                    border-radius: 50%;
                    background: #1a73e8;
                }
                .mini-month-day.is-today .busy-dot {
                    background: white;
                }
                .mini-month-day .busy-dot.multi {
                    background: #d93025;
                }
            `}</style>
        </div>
    );
}

function MiniMonth({
    monthDate,
    busyDates,
    eventCounts,
    onDateClick,
    selectedDate,
}: {
    monthDate: Date;
    busyDates: Set<string>;
    eventCounts: Record<string, number>;
    onDateClick: (date: Date) => void;
    selectedDate: Date | null;
}) {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthStart);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: calStart, end: calEnd });

    return (
        <div className="mini-month-card">
            <div className="mini-month-title">{format(monthDate, 'MMMM')}</div>
            <div className="mini-month-grid">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <div key={i} className="mini-month-weekday">{d}</div>
                ))}
                {days.map(day => {
                    const dateKey = format(day, 'yyyy-MM-dd');
                    const isBusy = busyDates.has(dateKey);
                    const count = eventCounts[dateKey] || 0;
                    const inMonth = isSameMonth(day, monthDate);

                    return (
                        <button
                            key={day.toISOString()}
                            className={`mini-month-day ${!inMonth ? 'other-month' : ''} ${isToday(day) ? 'is-today' : ''} ${selectedDate && isSameDay(day, selectedDate) ? 'is-selected' : ''}`}
                            onClick={() => onDateClick(day)}
                            title={isBusy ? `${count} event${count > 1 ? 's' : ''}` : undefined}
                        >
                            {format(day, 'd')}
                            {isBusy && inMonth && (
                                <span className={`busy-dot ${count > 2 ? 'multi' : ''}`} />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

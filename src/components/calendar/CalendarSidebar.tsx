import { useState, useEffect } from 'react';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth, isSameDay, isToday, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, ChevronDown } from 'lucide-react';
import { GoogleClient, type GoogleCalendarListEntry } from '../../lib/googleClient';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';

interface CalendarSidebarProps {
    selectedDate: Date | null;
    onDateChange: (date: Date) => void;
    onDateSelect: (date: Date) => void;
}

export function CalendarSidebar({ selectedDate, onDateChange, onDateSelect }: CalendarSidebarProps) {
    const [miniCalDate, setMiniCalDate] = useState(new Date());
    const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);
    const [enabledCalendars, setEnabledCalendars] = useState<Set<string>>(new Set(['primary']));
    const [showCreateMenu, setShowCreateMenu] = useState(false);
    
    // Use the new hook that checks DB for stored refresh tokens
    const { isConnected: hasGoogleAuth, isLoading: googleAuthLoading } = useGoogleAuth();

    // Fetch calendars when Google is connected
    useEffect(() => {
        if (hasGoogleAuth && !googleAuthLoading) {
            GoogleClient.listCalendars().then(cals => {
                setCalendars(cals);
                setEnabledCalendars(new Set(cals.map(c => c.id)));
            }).catch(console.error);
        }
    }, [hasGoogleAuth, googleAuthLoading]);

    // Mini calendar days
    const monthStart = startOfMonth(miniCalDate);
    const monthEnd = endOfMonth(monthStart);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: calStart, end: calEnd });

    const toggleCalendar = (calId: string) => {
        const newSet = new Set(enabledCalendars);
        if (newSet.has(calId)) newSet.delete(calId);
        else newSet.add(calId);
        setEnabledCalendars(newSet);
    };

    return (
        <div className="gcal-sidebar">
            {/* Create Button */}
            <div className="create-btn-wrapper">
                <button className="gcal-create-btn" onClick={() => setShowCreateMenu(!showCreateMenu)}>
                    <Plus size={20} />
                    <span>Create</span>
                    <ChevronDown size={16} />
                </button>
                {showCreateMenu && (
                    <div className="create-menu">
                        <button onClick={() => { setShowCreateMenu(false); /* Open scheduler as event */ }}>
                            Event
                        </button>
                        <button onClick={() => { setShowCreateMenu(false); /* Open scheduler as task */ }}>
                            Task
                        </button>
                    </div>
                )}
            </div>

            {/* Mini Calendar */}
            <div className="mini-calendar">
                <div className="mini-cal-header">
                    <span className="mini-cal-title">{format(miniCalDate, 'MMMM yyyy')}</span>
                    <div className="mini-cal-nav">
                        <button onClick={() => setMiniCalDate(d => subMonths(d, 1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
                        <button onClick={() => setMiniCalDate(d => addMonths(d, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
                    </div>
                </div>
                <div className="mini-cal-grid">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                        <div key={i} className="mini-cal-weekday">{d}</div>
                    ))}
                    {days.map(day => (
                        <button
                            key={day.toISOString()}
                            className={`mini-cal-day ${!isSameMonth(day, miniCalDate) ? 'other-month' : ''} ${isToday(day) ? 'is-today' : ''} ${selectedDate && isSameDay(day, selectedDate) ? 'is-selected' : ''}`}
                            onClick={() => {
                                onDateSelect(day);
                                onDateChange(day);
                            }}
                        >
                            {format(day, 'd')}
                        </button>
                    ))}
                </div>
            </div>

            {/* Calendars List */}
            {hasGoogleAuth && calendars.length > 0 && (
                <div className="calendars-section">
                    <div className="section-header">
                        <ChevronDown size={16} />
                        <span>My calendars</span>
                    </div>
                    <div className="calendars-list">
                        {calendars.map(cal => (
                            <label key={cal.id} className="calendar-item">
                                <input
                                    type="checkbox"
                                    checked={enabledCalendars.has(cal.id)}
                                    onChange={() => toggleCalendar(cal.id)}
                                    style={{ accentColor: cal.backgroundColor }}
                                />
                                <span
                                    className="cal-color-dot"
                                    style={{ background: cal.backgroundColor }}
                                />
                                <span className="cal-name">{cal.summary}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            <style>{`
                .gcal-sidebar {
                    width: 256px;
                    min-width: 256px;
                    background: var(--bg-sidebar);
                    border-right: 1px solid var(--border-light);
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                    overflow-y: auto;
                }

                .create-btn-wrapper { position: relative; }
                .gcal-create-btn {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 14px 24px;
                    background: white;
                    border: 1px solid var(--border-light);
                    border-radius: 24px;
                    font-size: 14px;
                    font-weight: 500;
                    color: var(--text-primary);
                    cursor: pointer;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
                    transition: all 0.2s;
                }
                .gcal-create-btn:hover {
                    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
                }
                .create-menu {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    margin-top: 8px;
                    background: white;
                    border: 1px solid var(--border-light);
                    border-radius: 8px;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
                    z-index: 100;
                    overflow: hidden;
                }
                .create-menu button {
                    display: block;
                    width: 100%;
                    padding: 12px 24px;
                    text-align: left;
                    border: none;
                    background: none;
                    font-size: 14px;
                    cursor: pointer;
                }
                .create-menu button:hover { background: #f1f3f4; }

                .mini-calendar {
                    background: transparent;
                }
                .mini-cal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                .mini-cal-title {
                    font-size: 14px;
                    font-weight: 500;
                    color: var(--text-primary);
                }
                .mini-cal-nav {
                    display: flex;
                    gap: 4px;
                }
                .mini-cal-nav button {
                    padding: 4px;
                    border: none;
                    background: none;
                    cursor: pointer;
                    border-radius: 50%;
                    color: var(--text-secondary);
                }
                .mini-cal-nav button:hover { background: rgba(0,0,0,0.05); }

                .mini-cal-grid {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    gap: 2px;
                }
                .mini-cal-weekday {
                    text-align: center;
                    font-size: 10px;
                    font-weight: 500;
                    color: var(--text-muted);
                    padding: 4px;
                }
                .mini-cal-day {
                    aspect-ratio: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    border: none;
                    background: none;
                    border-radius: 50%;
                    cursor: pointer;
                    color: var(--text-primary);
                }
                .mini-cal-day:hover { background: rgba(0,0,0,0.05); }
                .mini-cal-day.other-month { color: var(--text-muted); opacity: 0.5; }
                .mini-cal-day.is-today {
                    background: var(--accent);
                    color: white;
                    font-weight: 600;
                }
                .mini-cal-day.is-selected {
                    background: #E8F0FE;
                    color: #1967D2;
                    font-weight: 600;
                }
                .mini-cal-day.is-today.is-selected {
                    background: var(--accent);
                    color: white;
                }

                .calendars-section {
                    border-top: 1px solid var(--border-light);
                    padding-top: 16px;
                }
                .section-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin-bottom: 12px;
                }
                .calendars-list {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .calendar-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                }
                .calendar-item:hover { background: rgba(0,0,0,0.03); }
                .calendar-item input { margin: 0; }
                .cal-color-dot {
                    width: 12px;
                    height: 12px;
                    border-radius: 2px;
                }
                .cal-name {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
            `}</style>
        </div>
    );
}

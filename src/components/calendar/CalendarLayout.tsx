import { useState } from 'react';
import { addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, format } from 'date-fns';
import { CalendarGrid } from './CalendarGrid';
import { CalendarWeekView } from './CalendarWeekView';
import { CalendarSidebar } from './CalendarSidebar';
import { TasksPanel } from './TasksPanel';
import { ChevronLeft, ChevronRight, Settings, HelpCircle, Search, RefreshCw } from 'lucide-react';
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar';

export function CalendarLayout() {
    const [viewDate, setViewDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
    const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');

    // Sync Hook
    const { isLoading, refresh, getEntriesForDate } = useGoogleCalendar(viewDate);

    const nextPeriod = () => {
        if (viewMode === 'week') setViewDate(d => addWeeks(d, 1));
        else if (viewMode === 'day') setViewDate(d => addDays(d, 1));
        else setViewDate(d => addMonths(d, 1));
    };

    const prevPeriod = () => {
        if (viewMode === 'week') setViewDate(d => subWeeks(d, 1));
        else if (viewMode === 'day') setViewDate(d => subDays(d, 1));
        else setViewDate(d => subMonths(d, 1));
    };

    const jumpToToday = () => {
        const today = new Date();
        setViewDate(today);
        setSelectedDate(today);
    };

    return (
        <div className="gcal-layout">
            {/* Left Sidebar */}
            <CalendarSidebar
                selectedDate={selectedDate}
                onDateChange={setViewDate}
                onDateSelect={setSelectedDate}
            />

            {/* Main Content */}
            <div className="gcal-main">
                {/* Header Bar */}
                <header className="gcal-header">
                    <div className="header-left">
                        <button className="today-btn" onClick={jumpToToday}>Today</button>
                        <div className="nav-arrows">
                            <button onClick={prevPeriod}><ChevronLeft size={20} /></button>
                            <button onClick={nextPeriod}><ChevronRight size={20} /></button>
                        </div>
                        <h1 className="current-month">{format(viewDate, 'MMMM yyyy')}</h1>
                    </div>
                    <div className="header-right">
                        <button 
                            className={`icon-btn ${isLoading ? 'rotating' : ''}`} 
                            onClick={refresh}
                            title="Refresh Calendar"
                        >
                            <RefreshCw size={20} />
                        </button>
                        <button className="icon-btn"><Search size={20} /></button>
                        <button className="icon-btn"><Settings size={20} /></button>
                        <select 
                            className="view-selector"
                            value={viewMode}
                            onChange={(e) => setViewMode(e.target.value as any)}
                        >
                            <option value="month">Month</option>
                            <option value="week">Week</option>
                            <option value="day">Day</option>
                        </select>
                    </div>
                </header>

                {/* Calendar Grid */}
                <div className="gcal-grid-container">
                    {viewMode === 'month' ? (
                        <CalendarGrid
                            viewDate={viewDate}
                            selectedDate={selectedDate}
                            onSelectDate={setSelectedDate}
                            getEntriesForDate={getEntriesForDate}
                        />
                    ) : (
                        <CalendarWeekView
                            viewDate={viewDate}
                            mode={viewMode}
                            onSelectDate={setSelectedDate}
                            getEntriesForDate={getEntriesForDate}
                        />
                    )}
                </div>
            </div>

            {/* Right Tasks Panel */}
            <TasksPanel />

            <style>{`
                .gcal-layout {
                    display: flex;
                    height: 100vh;
                    background: var(--bg-app);
                    overflow: hidden;
                }

                .gcal-main {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                    overflow: hidden;
                }

                .gcal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 16px;
                    border-bottom: 1px solid var(--border-light);
                    background: var(--bg-content);
                }
                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .today-btn {
                    padding: 8px 16px;
                    border: 1px solid var(--border-light);
                    border-radius: 4px;
                    background: white;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                }
                .today-btn:hover { background: #f1f3f4; }
                .nav-arrows {
                    display: flex;
                    gap: 4px;
                }
                .nav-arrows button {
                    padding: 8px;
                    border: none;
                    background: none;
                    border-radius: 50%;
                    cursor: pointer;
                    color: var(--text-secondary);
                }
                .nav-arrows button:hover { background: rgba(0,0,0,0.05); }
                .current-month {
                    font-size: 22px;
                    font-weight: 400;
                    color: var(--text-primary);
                    margin: 0;
                }

                .header-right {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .icon-btn {
                    padding: 8px;
                    border: none;
                    background: none;
                    border-radius: 50%;
                    cursor: pointer;
                    color: var(--text-secondary);
                }
                .icon-btn:hover { background: rgba(0,0,0,0.05); }
                .rotating {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin { 100% { transform: rotate(360deg); } }
                .view-selector {
                    padding: 8px 12px;
                    border: 1px solid var(--border-light);
                    border-radius: 4px;
                    background: white;
                    font-size: 14px;
                    cursor: pointer;
                }

                .gcal-grid-container {
                    flex: 1;
                    overflow: auto;
                    padding: 0;
                }

                /* Responsive adjustments */
                @media (max-width: 1200px) {
                    .gcal-sidebar { display: none; }
                }
                @media (max-width: 900px) {
                    .tasks-panel { display: none; }
                }
            `}</style>
        </div>
    );
}

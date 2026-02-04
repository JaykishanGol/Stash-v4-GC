import { useState, useEffect } from 'react';
import { addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, format } from 'date-fns';
import { CalendarGrid } from './CalendarGrid';
import { CalendarWeekView } from './CalendarWeekView';
import { MobileCalendarView } from './MobileCalendarView';
import { TasksPanel } from './TasksPanel';
import { ChevronLeft, ChevronRight, RefreshCw, Layout, Calendar as CalendarIcon } from 'lucide-react';
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar';

export function CalendarLayout() {
    const [viewDate, setViewDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
    const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
    const [isTaskPanelOpen, setIsTaskPanelOpen] = useState(false); // Toggleable Panel
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    // Sync Hook
    const { isLoading, refresh, getEntriesForDate } = useGoogleCalendar(viewDate);

    // Handle Mobile Resize
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

    if (isMobile) {
        return (
            <div className="gcal-layout" style={{ height: '100vh', background: 'var(--bg-app)' }}>
                <MobileCalendarView 
                    selectedDate={selectedDate || new Date()} 
                    onSelectDate={(date) => {
                        setSelectedDate(date);
                        setViewDate(date); // Sync view date for google fetch
                    }}
                    getEntriesForDate={getEntriesForDate}
                />
            </div>
        );
    }

    return (
        <div className="gcal-layout" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-app)', overflow: 'hidden' }}>
            
            {/* Unified Header */}
            <header className="gcal-header" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 24px', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-content)',
                flexShrink: 0
            }}>
                <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CalendarIcon size={24} color="var(--primary)" />
                        <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, minWidth: 180 }}>
                            {format(viewDate, 'MMMM yyyy')}
                        </h1>
                    </div>
                    
                    <div className="nav-controls" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-app)', padding: 4, borderRadius: 8 }}>
                        <button onClick={prevPeriod} style={{ padding: 6, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 4, display: 'flex' }}>
                            <ChevronLeft size={18} color="var(--text-secondary)" />
                        </button>
                        <button onClick={jumpToToday} style={{ 
                            padding: '4px 12px', border: 'none', background: 'var(--bg-content)', 
                            borderRadius: 6, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: 'pointer' 
                        }}>
                            Today
                        </button>
                        <button onClick={nextPeriod} style={{ padding: 6, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 4, display: 'flex' }}>
                            <ChevronRight size={18} color="var(--text-secondary)" />
                        </button>
                    </div>
                </div>

                <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 4, background: 'var(--bg-app)', padding: 4, borderRadius: 8 }}>
                        {(['month', 'week', 'day'] as const).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                style={{
                                    padding: '6px 12px', border: 'none', borderRadius: 6,
                                    background: viewMode === mode ? 'white' : 'transparent',
                                    color: viewMode === mode ? 'var(--primary)' : 'var(--text-secondary)',
                                    fontWeight: 500, fontSize: '13px', cursor: 'pointer',
                                    boxShadow: viewMode === mode ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                    textTransform: 'capitalize'
                                }}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>

                    <div style={{ width: 1, height: 24, background: 'var(--border-light)', margin: '0 8px' }} />

                    <button className={`icon-btn ${isLoading ? 'rotating' : ''}`} onClick={refresh} title="Refresh">
                        <RefreshCw size={18} />
                    </button>
                    
                    <button 
                        className={`icon-btn ${isTaskPanelOpen ? 'active' : ''}`} 
                        onClick={() => setIsTaskPanelOpen(!isTaskPanelOpen)}
                        title="Toggle Tasks Panel"
                        style={{ 
                            background: isTaskPanelOpen ? 'var(--bg-selection)' : 'transparent',
                            color: isTaskPanelOpen ? 'var(--primary)' : 'inherit'
                        }}
                    >
                        <Layout size={18} />
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <div className="gcal-body" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Calendar Grid (Takes remaining width) */}
                <div className="gcal-grid-wrapper" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
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

                {/* Right Tasks Panel (Conditional Slide-in) */}
                {isTaskPanelOpen && (
                    <div className="tasks-sidebar" style={{ 
                        width: 320, borderLeft: '1px solid var(--border-light)', 
                        background: 'var(--bg-content)', display: 'flex', flexDirection: 'column' 
                    }}>
                        <TasksPanel />
                    </div>
                )}
            </div>

            <style>{`
                .icon-btn {
                    padding: 8px;
                    border: none;
                    background: none;
                    border-radius: 6px;
                    cursor: pointer;
                    color: var(--text-secondary);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                .icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
                .rotating { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

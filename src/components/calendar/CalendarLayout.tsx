import { useState, useEffect, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { FullCalendarView, type CalendarViewMode } from './FullCalendarView';
import { TasksPanel } from './TasksPanel';
import { CalendarFAB } from './CalendarFAB';
import { CalendarSidebar } from './CalendarSidebar';
import { UndoToast, type UndoAction } from './UndoToast';
import { RecurrenceEditDialog } from '../modals/RecurrenceEditDialog';
import { useCalendarShortcuts } from '../../hooks/useCalendarShortcuts';
import { ChevronLeft, ChevronRight, RefreshCw, Layout, Calendar as CalendarIcon, Menu } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type FullCalendar from '@fullcalendar/react';
import type { RecurrenceEditMode } from '../../lib/types';

type ViewModeSimple = 'month' | 'week' | 'day';

const VIEW_MAP: Record<ViewModeSimple, CalendarViewMode> = {
    month: 'dayGridMonth',
    week: 'timeGridWeek',
    day: 'timeGridDay',
};

export function CalendarLayout() {
    const [viewDate, setViewDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
    const [viewMode, setViewMode] = useState<ViewModeSimple>('month');
    const [isTaskPanelOpen, setIsTaskPanelOpen] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    // Undo toast state
    const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
    const undoIdRef = useRef(0);

    // Recurrence dialog state
    const [recurrenceDialog, setRecurrenceDialog] = useState<{
        action: 'edit' | 'delete' | 'move';
        eventId: string;
        masterEventId?: string;
        originalStart?: string;
        pendingData?: { newStart: Date; newEnd: Date };
    } | null>(null);

    const calendarRef = useRef<FullCalendar | null>(null);

    const {
        openEventScheduler,
        addEvent,
        updateEvent,
        calendarEvents,
        user,
        loadEvents,
        isEventsLoading,
    } = useAppStore();

    // Undo handler — called from popover when event is deleted
    const handleEventDeleted = useCallback((message: string, undoFn: () => void) => {
        undoIdRef.current++;
        setUndoAction({
            id: String(undoIdRef.current),
            message,
            undoFn,
        });
    }, []);

    // Handle Mobile Resize
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Sync FullCalendar's view when viewMode changes from our buttons
    // Use requestAnimationFrame to avoid flushSync warning from FullCalendar
    useEffect(() => {
        const api = calendarRef.current?.getApi();
        if (api) {
            requestAnimationFrame(() => {
                api.changeView(VIEW_MAP[viewMode]);
            });
        }
    }, [viewMode]);

    const nextPeriod = () => {
        const api = calendarRef.current?.getApi();
        if (api) {
            api.next();
            setViewDate(api.getDate());
        }
    };

    const prevPeriod = () => {
        const api = calendarRef.current?.getApi();
        if (api) {
            api.prev();
            setViewDate(api.getDate());
        }
    };

    const jumpToToday = () => {
        const api = calendarRef.current?.getApi();
        if (api) {
            api.today();
            setViewDate(new Date());
            setSelectedDate(new Date());
        }
    };

    // Keyboard shortcuts (Google Calendar: t, d, w, m, j, k, c)
    useCalendarShortcuts({
        goToToday: jumpToToday,
        goToDay: () => setViewMode('day'),
        goToWeek: () => setViewMode('week'),
        goToMonth: () => setViewMode('month'),
        navigateBack: prevPeriod,
        navigateForward: nextPeriod,
        createEvent: () => {
            const now = new Date();
            const end = new Date(now.getTime() + 3600000);
            addEvent({
                user_id: user?.id || 'demo',
                title: '',
                description: '',
                start_at: now.toISOString(),
                end_at: end.toISOString(),
                is_all_day: false,
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
                google_event_id: null,
                google_calendar_id: 'primary',
                deleted_at: null,
                is_unsynced: true,
            }).then((newEvent) => {
                setTimeout(() => openEventScheduler(newEvent.id), 200);
            });
        },
    });

    // Handle sidebar date click → navigate FullCalendar
    const handleSidebarDateChange = useCallback((date: Date) => {
        const api = calendarRef.current?.getApi();
        if (api) {
            api.gotoDate(date);
            setViewDate(date);
        }
    }, []);

    const handleSidebarDateSelect = useCallback((date: Date) => {
        setSelectedDate(date);
        // Also switch to day view when clicking a date in the mini calendar
        setViewMode('day');
        const api = calendarRef.current?.getApi();
        if (api) {
            requestAnimationFrame(() => {
                api.gotoDate(date);
                api.changeView('timeGridDay');
            });
            setViewDate(date);
        }
    }, []);

    // --- FullCalendar callbacks ---

    const handleEventClick = useCallback(
        (eventId: string, isRecurrenceInstance: boolean, masterEventId?: string, originalStart?: string) => {
            // Open the scheduler/editor for this event
            openEventScheduler(
                isRecurrenceInstance && masterEventId ? masterEventId : eventId,
                originalStart
            );
        },
        [openEventScheduler]
    );

    const handleDateSelect = useCallback(
        (start: Date, end: Date, allDay: boolean) => {
            // Create a new event at the selected time range
            addEvent({
                user_id: user?.id || 'demo',
                title: '',
                description: '',
                start_at: start.toISOString(),
                end_at: end.toISOString(),
                is_all_day: allDay,
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
                google_event_id: null,
                google_calendar_id: 'primary',
                deleted_at: null,
                is_unsynced: true,
            }).then((newEvent) => {
                // Open scheduler for further editing
                setTimeout(() => openEventScheduler(newEvent.id), 200);
            });
        },
        [addEvent, openEventScheduler, user]
    );

    const handleEventDrop = useCallback(
        (eventId: string, newStart: Date, newEnd: Date, isRecurrenceInstance: boolean, masterEventId?: string, originalStart?: string) => {
            if (isRecurrenceInstance) {
                // Show the 3-option dialog
                setRecurrenceDialog({
                    action: 'move',
                    eventId: masterEventId || eventId,
                    masterEventId,
                    originalStart,
                    pendingData: { newStart, newEnd },
                });
            } else {
                // Check if this is a master (has rrule) — if so, show dialog for 'all' edit
                const event = calendarEvents.find(e => e.id === eventId);
                if (event?.rrule) {
                    setRecurrenceDialog({
                        action: 'move',
                        eventId,
                        pendingData: { newStart, newEnd },
                    });
                } else {
                    // Simple single event move
                    updateEvent(eventId, {
                        start_at: newStart.toISOString(),
                        end_at: newEnd.toISOString(),
                    }, 'all');
                }
            }
        },
        [updateEvent, calendarEvents]
    );

    // Resize event (drag bottom/right edge to change end time)
    const handleEventResize = useCallback(
        (eventId: string, newStart: Date, newEnd: Date, isRecurrenceInstance: boolean, masterEventId?: string, originalStart?: string) => {
            if (isRecurrenceInstance) {
                setRecurrenceDialog({
                    action: 'move',
                    eventId: masterEventId || eventId,
                    masterEventId,
                    originalStart,
                    pendingData: { newStart, newEnd },
                });
            } else {
                const event = calendarEvents.find(e => e.id === eventId);
                if (event?.rrule) {
                    setRecurrenceDialog({
                        action: 'move',
                        eventId,
                        pendingData: { newStart, newEnd },
                    });
                } else {
                    updateEvent(eventId, {
                        start_at: newStart.toISOString(),
                        end_at: newEnd.toISOString(),
                    }, 'all');
                }
            }
        },
        [updateEvent, calendarEvents]
    );

    const handleRecurrenceConfirm = useCallback(
        (mode: RecurrenceEditMode) => {
            if (!recurrenceDialog) return;
            const { eventId, originalStart, pendingData } = recurrenceDialog;

            if (pendingData) {
                updateEvent(
                    eventId,
                    {
                        start_at: pendingData.newStart.toISOString(),
                        end_at: pendingData.newEnd.toISOString(),
                    },
                    mode,
                    originalStart
                );
            }

            setRecurrenceDialog(null);
        },
        [recurrenceDialog, updateEvent]
    );

    // Mobile layout
    if (isMobile) {
        return (
            <div className="gcal-layout" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-app)' }}>
                {/* Mobile Header */}
                <header className="gcal-header-mobile" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-content)',
                    flexShrink: 0, gap: 4
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={prevPeriod} style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex' }}>
                            <ChevronLeft size={20} color="var(--text-secondary)" />
                        </button>
                        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', minWidth: 120, textAlign: 'center' }}>
                            {format(viewDate, 'MMM yyyy')}
                        </span>
                        <button onClick={nextPeriod} style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex' }}>
                            <ChevronRight size={20} color="var(--text-secondary)" />
                        </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <button onClick={jumpToToday} style={{ 
                            padding: '3px 8px', border: '1px solid var(--border-light)', background: 'var(--bg-content)', 
                            borderRadius: 6, fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' 
                        }}>
                            Today
                        </button>
                        {(['month', 'week', 'day'] as const).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                style={{
                                    padding: '3px 8px', border: 'none', borderRadius: 4,
                                    background: viewMode === mode ? 'var(--primary)' : 'transparent',
                                    color: viewMode === mode ? 'white' : 'var(--text-secondary)',
                                    fontWeight: 500, fontSize: '11px', cursor: 'pointer',
                                    textTransform: 'capitalize'
                                }}
                            >
                                {mode.charAt(0).toUpperCase()}
                            </button>
                        ))}
                    </div>
                </header>

                <div style={{ flex: 1, overflow: 'hidden' }}>
                    <FullCalendarView
                        viewMode={VIEW_MAP[viewMode]}
                        onEventClick={handleEventClick}
                        onDateSelect={handleDateSelect}
                        onEventDrop={handleEventDrop}
                        onEventResize={handleEventResize}
                        onEventDeleted={handleEventDeleted}
                        calendarRef={calendarRef}
                    />
                </div>
                <CalendarFAB selectedDate={selectedDate} />
                {recurrenceDialog && (
                    <RecurrenceEditDialog
                        action={recurrenceDialog.action}
                        onConfirm={handleRecurrenceConfirm}
                        onCancel={() => setRecurrenceDialog(null)}
                    />
                )}
                <UndoToast action={undoAction} onDismiss={() => setUndoAction(null)} />
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
                    <button
                        className="icon-btn"
                        onClick={() => setIsSidebarOpen(prev => !prev)}
                        title="Toggle sidebar"
                    >
                        <Menu size={20} />
                    </button>
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

                    <button className={`icon-btn ${isEventsLoading ? 'rotating' : ''}`} onClick={() => loadEvents()} title="Refresh">
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
                {/* Left Sidebar with Mini Calendar (Google Calendar style) */}
                {isSidebarOpen && (
                    <CalendarSidebar
                        selectedDate={selectedDate}
                        onDateChange={handleSidebarDateChange}
                        onDateSelect={handleSidebarDateSelect}
                    />
                )}

                {/* FullCalendar (Takes remaining width) */}
                <div className="gcal-grid-wrapper" style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                    <FullCalendarView
                        viewMode={VIEW_MAP[viewMode]}
                        onEventClick={handleEventClick}
                        onDateSelect={handleDateSelect}
                        onEventDrop={handleEventDrop}
                        onEventResize={handleEventResize}
                        onEventDeleted={handleEventDeleted}
                        calendarRef={calendarRef}
                    />
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

            <CalendarFAB selectedDate={selectedDate} />

            {/* Recurrence Edit Dialog */}
            {recurrenceDialog && (
                <RecurrenceEditDialog
                    action={recurrenceDialog.action}
                    onConfirm={handleRecurrenceConfirm}
                    onCancel={() => setRecurrenceDialog(null)}
                />
            )}

            {/* Undo Toast (Google Calendar style) */}
            <UndoToast action={undoAction} onDismiss={() => setUndoAction(null)} />
        </div>
    );
}

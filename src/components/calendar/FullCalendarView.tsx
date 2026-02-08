/**
 * FullCalendarView — Google Calendar Clone UI
 *
 * Replaces CalendarGrid, CalendarWeekView, MobileCalendarView with a single
 * FullCalendar component supporting month, week, day, and list views.
 *
 * Features:
 *  - RFC 5545 recurrence expansion via eventExpander
 *  - Drag & drop with recurrence edit prompt
 *  - Click to create / click to edit
 *  - Google Calendar color theming
 *  - All-day events in top bar
 *  - Tasks rendered with checkbox icon
 */

import { useCallback, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import type { EventClickArg, EventDropArg, DateSelectArg, EventContentArg, DatesSetArg } from '@fullcalendar/core';
import { useAppStore } from '../../store/useAppStore';
import { expandEventsForRange, toFullCalendarEvent } from '../../lib/eventExpander';
import { EventPopover } from './EventPopover';
import type { CalendarEvent } from '../../lib/types';
import '../../styles/calendar.css';

export type CalendarViewMode = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek';

interface PopoverState {
    event: CalendarEvent;
    anchorRect: DOMRect;
    isRecurrenceInstance: boolean;
    masterEventId?: string;
    originalStart?: string;
}

interface FullCalendarViewProps {
    viewMode: CalendarViewMode;
    onEventClick: (eventId: string, isRecurrenceInstance: boolean, masterEventId?: string, originalStart?: string) => void;
    onDateSelect: (start: Date, end: Date, allDay: boolean) => void;
    onEventDrop: (eventId: string, newStart: Date, newEnd: Date, isRecurrenceInstance: boolean, masterEventId?: string, originalStart?: string, isScheduledItem?: boolean, isTask?: boolean) => void;
    onEventResize?: (eventId: string, newStart: Date, newEnd: Date, isRecurrenceInstance: boolean, masterEventId?: string, originalStart?: string) => void;
    onEventDeleted?: (message: string, undoFn: () => void) => void;
    /** Called when an external item/task is dropped onto the calendar */
    onExternalDrop?: (itemId: string, isTask: boolean, start: Date) => void;
    calendarRef: React.RefObject<FullCalendar | null>;
    /** Set of enabled calendar IDs for filtering */
    enabledCalendarIds?: Set<string>;
    /** Primary timezone for rendering */
    timezone?: string;
    /** Secondary timezone to display alongside */
    secondaryTimezone?: string;
}

export function FullCalendarView({
    viewMode,
    onEventClick,
    onDateSelect,
    onEventDrop,
    onEventResize,
    onEventDeleted,
    onExternalDrop,
    calendarRef,
    enabledCalendarIds,
    timezone,
    secondaryTimezone,
}: FullCalendarViewProps) {
    const calendarEvents = useAppStore((s) => s.calendarEvents);
    const items = useAppStore((s) => s.items);
    const tasks = useAppStore((s) => s.tasks);
    const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date }>({
        start: new Date(),
        end: new Date(),
    });

    // Popover state
    const [popover, setPopover] = useState<PopoverState | null>(null);

    const closePopover = useCallback(() => setPopover(null), []);

    // When the visible date range changes, track it
    const handleDatesSet = useCallback((arg: DatesSetArg) => {
        setVisibleRange({ start: arg.start, end: arg.end });
    }, []);

    // Expand recurring events for the visible range + merge scheduled items/tasks
    const fcEvents = useMemo(() => {
        if (!visibleRange.start || !visibleRange.end) return [];

        // Filter Google Tasks for calendar display (matching Google Calendar behavior):
        // - Hide completed tasks (they go in TasksPanel's "Completed" section)
        // - Tasks WITH a due date show on their date (all-day)
        // - Tasks WITHOUT a due date show on today (Google Calendar does this too)
        const visibleCalendarEvents = calendarEvents.filter(e => {
            if (e.is_google_task || e.google_calendar_id === 'tasks') {
                if (e.is_completed) return false;
            }
            return true;
        });

        // Dedup by google_task_id / google_event_id + title fallback for tasks
        const seenGTaskIds = new Set<string>();
        const seenGEventIds = new Set<string>();
        const seenTaskTitles = new Set<string>();
        const dedupedEvents = visibleCalendarEvents.filter(e => {
            if (e.google_task_id) {
                if (seenGTaskIds.has(e.google_task_id)) return false;
                seenGTaskIds.add(e.google_task_id);
            }
            if (e.google_event_id) {
                if (seenGEventIds.has(e.google_event_id)) return false;
                seenGEventIds.add(e.google_event_id);
            }
            // Title-based dedup fallback for task events (catches any remaining orphans)
            if (e.google_calendar_id === 'tasks' || e.is_google_task) {
                const key = `${e.title}::${e.start_at?.slice(0, 10) ?? ''}`;
                if (seenTaskTitles.has(key)) return false;
                seenTaskTitles.add(key);
            }
            return true;
        });

        const expanded = expandEventsForRange(dedupedEvents, visibleRange.start, visibleRange.end);
        const calEvents = expanded.map(ev => {
            const fc = toFullCalendarEvent(ev);
            // Google Task styling: transparent bg with colored border + task icon
            if (ev.event.is_google_task) {
                const fcObj = fc as Record<string, unknown>;
                const existingProps = (fcObj.extendedProps ?? {}) as Record<string, unknown>;
                return {
                    ...fcObj,
                    backgroundColor: 'transparent',
                    borderColor: '#1A73E8',
                    textColor: 'var(--text-primary, #202124)',
                    extendedProps: {
                        ...existingProps,
                        isGoogleTask: true,
                    },
                };
            }
            return fc;
        });

        // Color map for item types
        const typeColors: Record<string, string> = {
            note: '#4285f4',   // Google blue
            link: '#0b8043',   // Google green
            image: '#8e24aa',  // Purple
            file: '#616161',   // Gray
            folder: '#f4b400', // Google yellow
        };

        // Add scheduled items (non-deleted, with scheduled_at)
        const scheduledItems = items
            .filter(i => i.scheduled_at && !i.deleted_at && i.type !== 'event')
            .filter(i => {
                const d = new Date(i.scheduled_at!);
                return d >= visibleRange.start && d <= visibleRange.end;
            })
            .map(item => {
                const start = new Date(item.scheduled_at!);
                const color = typeColors[item.type] || '#4285f4';
                return {
                    id: `item-${item.id}`,
                    title: item.title || 'Untitled',
                    start,
                    end: new Date(start.getTime() + 30 * 60 * 1000), // 30 min default
                    allDay: false,
                    backgroundColor: color,
                    borderColor: color,
                    textColor: '#ffffff',
                    editable: true, // can drag to move
                    durationEditable: false, // items have no end time — can't resize
                    extendedProps: {
                        eventId: item.id,
                        isScheduledItem: true,
                        itemType: item.type,
                        isTask: false,
                    },
                };
            });

        // Add scheduled tasks (non-deleted, with scheduled_at)
        const scheduledTasks = tasks
            .filter(t => t.scheduled_at && !t.deleted_at && !t.is_completed)
            .filter(t => {
                const d = new Date(t.scheduled_at!);
                return d >= visibleRange.start && d <= visibleRange.end;
            })
            .map(task => {
                const start = new Date(task.scheduled_at!);
                const priorityColors: Record<string, string> = {
                    high: '#d93025',   // Red
                    medium: '#f4b400', // Yellow
                    low: '#1a73e8',    // Blue
                };
                const color = priorityColors[task.priority || ''] || '#039be5';
                return {
                    id: `task-${task.id}`,
                    title: task.title || 'Untitled Task',
                    start,
                    end: new Date(start.getTime() + 30 * 60 * 1000),
                    allDay: false,
                    backgroundColor: color,
                    borderColor: color,
                    textColor: '#ffffff',
                    editable: true,
                    durationEditable: false, // tasks have no end time
                    extendedProps: {
                        eventId: task.id,
                        isScheduledItem: true,
                        isTask: true,
                        priority: task.priority,
                    },
                };
            });

        // Merge all event sources
        let allEvents = [...calEvents, ...scheduledItems, ...scheduledTasks];

        // Filter by enabled calendar IDs if provided (empty set = show all)
        if (enabledCalendarIds && enabledCalendarIds.size > 0) {
            allEvents = allEvents.filter(ev => {
                const calId = (ev as { extendedProps?: { calendarEvent?: CalendarEvent } }).extendedProps?.calendarEvent?.google_calendar_id;
                // Items, tasks, and ghost events always pass; calendar events filter by their calendar ID
                if (!calId) return true;
                // Google Task events always pass regardless of calendar filter
                if (calId === 'tasks') return true;
                return enabledCalendarIds.has(calId);
            });
        }

        return allEvents;
    }, [calendarEvents, items, tasks, visibleRange, enabledCalendarIds]);

    // Click on an event — show popover for calendar events, navigate for items/tasks
    const handleEventClick = useCallback(
        (info: EventClickArg) => {
            const props = info.event.extendedProps;

            // Scheduled items/tasks → open editor/task directly
            if (props.isScheduledItem) {
                const id = String(props.eventId || info.event.id).replace(/^(task-|item-)/, '');
                // Open scheduler details for both tasks and items.
                // This keeps calendar interactions inside the scheduler flow.
                useAppStore.getState().openScheduler(id);
                return;
            }

            const calEvent = props.calendarEvent as CalendarEvent | undefined;
            const resolvedEvent =
                calEvent ||
                (props.eventId
                    ? useAppStore.getState().calendarEvents.find(e => e.id === props.eventId)
                    : undefined);

            if (!resolvedEvent) {
                // Fallback: open scheduler directly if no calendarEvent data
                onEventClick(
                    props.eventId || info.event.id,
                    !!props.isRecurrenceInstance,
                    props.masterEventId,
                    props.originalStart
                );
                return;
            }

            // Get the bounding rect of the clicked element for positioning
            const el = info.el;
            const rect = el.getBoundingClientRect();

            setPopover({
                event: resolvedEvent,
                anchorRect: rect,
                isRecurrenceInstance: !!props.isRecurrenceInstance,
                masterEventId: props.masterEventId,
                originalStart: props.originalStart,
            });
        },
        [onEventClick]
    );

    // Drag-select to create new event
    const handleDateSelect = useCallback(
        (info: DateSelectArg) => {
            onDateSelect(info.start, info.end, info.allDay);
            // Unselect so the highlight goes away
            const api = calendarRef.current?.getApi();
            api?.unselect();
        },
        [onDateSelect, calendarRef]
    );

    // Drag-drop an existing event
    const handleEventDrop = useCallback(
        (info: EventDropArg) => {
            const props = info.event.extendedProps;
            const newStart = info.event.start!;
            const calendarEvent = props.calendarEvent as CalendarEvent | undefined;
            const originalDurationMs = calendarEvent
                ? Math.max(
                    1,
                    new Date(calendarEvent.end_at).getTime() - new Date(calendarEvent.start_at).getTime()
                )
                : info.event.allDay
                    ? 24 * 60 * 60 * 1000
                    : 60 * 60 * 1000;
            const newEnd = info.event.end || new Date(newStart.getTime() + originalDurationMs);
            const normalizedId = String(props.eventId || info.event.id).replace(/^(task-|item-)/, '');
            onEventDrop(
                normalizedId,
                newStart,
                newEnd,
                !!props.isRecurrenceInstance,
                props.masterEventId,
                props.originalStart,
                !!props.isScheduledItem,
                !!props.isTask,
            );
        },
        [onEventDrop]
    );

    // Resize an event (change end time by dragging edge) — only CalendarEvents support resize
    const handleEventResize = useCallback(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (info: any) => {
            if (!onEventResize) return;
            const props = info.event.extendedProps;
            // Scheduled items/tasks can't be resized
            if (props.isScheduledItem) {
                info.revert();
                return;
            }
            const newStart = info.event.start!;
            const calendarEvent = props.calendarEvent as CalendarEvent | undefined;
            const originalDurationMs = calendarEvent
                ? Math.max(
                    1,
                    new Date(calendarEvent.end_at).getTime() - new Date(calendarEvent.start_at).getTime()
                )
                : info.event.allDay
                    ? 24 * 60 * 60 * 1000
                    : 60 * 60 * 1000;
            const newEnd = info.event.end || new Date(newStart.getTime() + originalDurationMs);
            const normalizedId = String(props.eventId || info.event.id).replace(/^(task-|item-)/, '');
            onEventResize(
                normalizedId,
                newStart,
                newEnd,
                !!props.isRecurrenceInstance,
                props.masterEventId,
                props.originalStart
            );
        },
        [onEventResize]
    );

    // Handle external items/tasks dropped onto the calendar from the side panel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleEventReceive = useCallback((info: any) => {
        if (!onExternalDrop) { info.revert(); return; }
        const props = info.event.extendedProps;
        const itemId = props.externalItemId as string;
        const isTask = !!props.externalIsTask;
        const start = info.event.start!;
        // Remove the event FullCalendar auto-created — we'll let the store + fcEvents memo handle it
        info.event.remove();
        onExternalDrop(itemId, isTask, start);
    }, [onExternalDrop]);

    // Custom event content renderer
    const renderEventContent = useCallback((arg: EventContentArg) => {
        const props = arg.event.extendedProps;
        const isTask = props.isTask;
        const isGoogleTask = props.isGoogleTask;
        const color = arg.event.backgroundColor || '#039be5';

        if (arg.view.type === 'dayGridMonth') {
            // Month view: compact dot + title
            return (
                <div
                    className="fc-google-event-month"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '1px 4px', overflow: 'hidden' }}
                >
                    {isGoogleTask ? (
                        <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', border: '2px solid #1A73E8', display: 'inline-block' }} />
                    ) : isTask ? (
                        <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: 2, border: `2px solid ${color}`, display: 'inline-block' }} />
                    ) : arg.event.allDay ? null : (
                        <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                    )}
                    {!arg.event.allDay && arg.timeText && (
                        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', flexShrink: 0 }}>
                            {arg.timeText}
                        </span>
                    )}
                    <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {arg.event.title}
                    </span>
                </div>
            );
        }

        // Week/Day view: vertical card
        return (
            <div
                className="fc-google-event-time"
                style={{
                    padding: '2px 6px',
                    overflow: 'hidden',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    ...(isGoogleTask ? { border: '1px solid #1A73E8', borderRadius: 4, background: 'rgba(26,115,232,0.06)' } : {}),
                }}
            >
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isGoogleTask && <span style={{ marginRight: 4 }}>○</span>}
                    {isTask && !isGoogleTask && <span style={{ marginRight: 4 }}>☐</span>}
                    {arg.event.title}
                </div>
                {arg.timeText && (
                    <div style={{ fontSize: 11, opacity: 0.85 }}>{arg.timeText}</div>
                )}
                {props.location && (
                    <div style={{ fontSize: 11, opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        📍 {props.location}
                    </div>
                )}
            </div>
        );
    }, []);

    return (
        <div className="fullcalendar-google-wrapper" style={{ height: '100%', overflow: 'auto', display: 'flex' }}>
            {/* Secondary timezone column (shown in week/day views) */}
            {secondaryTimezone && (viewMode === 'timeGridWeek' || viewMode === 'timeGridDay') && (
                <SecondaryTimezoneColumn timezone={secondaryTimezone} />
            )}
            <div style={{ flex: 1, height: '100%' }}>
            <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
                initialView={viewMode}
                headerToolbar={false} // We use our own header
                events={fcEvents}
                editable={true}
                eventStartEditable={true}
                eventDurationEditable={true}
                selectable={true}
                selectMirror={true}
                dayMaxEvents={true} // "+N more" in month view
                weekends={true}
                nowIndicator={true}
                allDaySlot={true}
                slotMinTime="00:00:00"
                slotMaxTime="24:00:00"
                slotDuration="00:30:00"
                snapDuration="00:15:00"
                scrollTime="08:00:00"
                height="100%"
                timeZone={timezone || 'local'}
                eventClick={handleEventClick}
                select={handleDateSelect}
                eventDrop={handleEventDrop}
                eventResize={handleEventResize}
                eventReceive={handleEventReceive}
                droppable={true}
                datesSet={handleDatesSet}
                eventContent={renderEventContent}
                eventTimeFormat={{
                    hour: 'numeric',
                    minute: '2-digit',
                    meridiem: 'short',
                }}
                slotLabelFormat={{
                    hour: 'numeric',
                    minute: '2-digit',
                    meridiem: 'short',
                }}
                // Google Calendar style: thin border radius events
                eventDisplay="block"
                eventBorderColor="transparent"
            />
            </div>

            {/* Event Popover (Google Calendar style click preview) */}
            {popover && (
                <EventPopover
                    event={popover.event}
                    anchorRect={popover.anchorRect}
                    isRecurrenceInstance={popover.isRecurrenceInstance}
                    masterEventId={popover.masterEventId}
                    originalStart={popover.originalStart}
                    onClose={closePopover}
                    onDeleted={onEventDeleted}
                />
            )}
        </div>
    );
}

/** Renders a secondary timezone column alongside the time grid */
function SecondaryTimezoneColumn({ timezone }: { timezone: string }) {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const shortTZ = timezone.split('/').pop()?.replace(/_/g, ' ') || timezone;

    return (
        <div className="secondary-tz-column" style={{
            width: 52,
            minWidth: 52,
            borderRight: '1px solid var(--border-light, #dadce0)',
            paddingTop: 68, // Align with time grid header height
            overflow: 'hidden',
            fontSize: 10,
            color: 'var(--text-tertiary, #70757a)',
            background: 'var(--bg-content, #fff)',
            flexShrink: 0,
        }}>
            <div style={{ fontSize: 9, fontWeight: 600, textAlign: 'center', padding: '2px 0 4px', color: 'var(--text-muted, #9aa0a6)', borderBottom: '1px solid var(--border-light, #dadce0)' }}>
                {shortTZ}
            </div>
            {hours.map(h => {
                // Convert local hour to the secondary timezone
                const now = new Date();
                now.setHours(h, 0, 0, 0);
                let tzTime: string;
                try {
                    tzTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone });
                } catch {
                    tzTime = `${h}:00`;
                }
                return (
                    <div key={h} style={{ height: 48, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 2, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                        {tzTime}
                    </div>
                );
            })}
        </div>
    );
}

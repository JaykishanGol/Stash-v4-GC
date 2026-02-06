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

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import type { EventClickArg, EventDropArg, DateSelectArg, EventContentArg, DatesSetArg, EventResizeDoneArg } from '@fullcalendar/core';
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
    onEventDrop: (eventId: string, newStart: Date, newEnd: Date, isRecurrenceInstance: boolean, masterEventId?: string, originalStart?: string) => void;
    onEventResize?: (eventId: string, newStart: Date, newEnd: Date, isRecurrenceInstance: boolean, masterEventId?: string, originalStart?: string) => void;
    onEventDeleted?: (message: string, undoFn: () => void) => void;
    calendarRef: React.RefObject<FullCalendar | null>;
}

export function FullCalendarView({
    viewMode,
    onEventClick,
    onDateSelect,
    onEventDrop,
    onEventResize,
    onEventDeleted,
    calendarRef,
}: FullCalendarViewProps) {
    const calendarEvents = useAppStore((s) => s.calendarEvents);
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

    // Expand recurring events for the visible range
    const fcEvents = useMemo(() => {
        if (!visibleRange.start || !visibleRange.end) return [];
        const expanded = expandEventsForRange(calendarEvents, visibleRange.start, visibleRange.end);
        return expanded.map(toFullCalendarEvent);
    }, [calendarEvents, visibleRange]);

    // Click on an event — show popover instead of opening scheduler directly
    const handleEventClick = useCallback(
        (info: EventClickArg) => {
            const props = info.event.extendedProps;
            const calEvent = props.calendarEvent as CalendarEvent | undefined;

            if (!calEvent) {
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
                event: calEvent,
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
            const newEnd = info.event.end || new Date(newStart.getTime() + 3600000);
            onEventDrop(
                props.eventId || info.event.id,
                newStart,
                newEnd,
                !!props.isRecurrenceInstance,
                props.masterEventId,
                props.originalStart
            );
        },
        [onEventDrop]
    );

    // Resize an event (change end time by dragging edge)
    const handleEventResize = useCallback(
        (info: EventResizeDoneArg) => {
            if (!onEventResize) return;
            const props = info.event.extendedProps;
            const newStart = info.event.start!;
            const newEnd = info.event.end || new Date(newStart.getTime() + 3600000);
            onEventResize(
                props.eventId || info.event.id,
                newStart,
                newEnd,
                !!props.isRecurrenceInstance,
                props.masterEventId,
                props.originalStart
            );
        },
        [onEventResize]
    );

    // Custom event content renderer
    const renderEventContent = useCallback((arg: EventContentArg) => {
        const props = arg.event.extendedProps;
        const isTask = props.isTask;
        const color = arg.event.backgroundColor || '#039be5';

        if (arg.view.type === 'dayGridMonth') {
            // Month view: compact dot + title
            return (
                <div
                    className="fc-google-event-month"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '1px 4px', overflow: 'hidden' }}
                >
                    {isTask ? (
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
                }}
            >
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isTask && <span style={{ marginRight: 4 }}>☐</span>}
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
        <div className="fullcalendar-google-wrapper" style={{ height: '100%', overflow: 'auto' }}>
            <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
                initialView={viewMode}
                headerToolbar={false} // We use our own header
                events={fcEvents}
                editable={true}
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
                eventClick={handleEventClick}
                select={handleDateSelect}
                eventDrop={handleEventDrop}
                eventResize={handleEventResize}
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

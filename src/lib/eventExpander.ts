/**
 * Event Expander — The "Merge Algorithm"
 *
 * RFC 5545 Series + Exception pattern implementation.
 * Uses the `rrule` npm package to expand recurring events into individual instances,
 * then merges with exceptions (moved/deleted instances).
 *
 * This is the core engine that converts DB rows into renderable calendar entries.
 */

import { RRule } from 'rrule';
import type { CalendarEvent } from './types';
import { GOOGLE_COLOR_MAP, getEventColor } from './calendarConstants';

/**
 * An expanded (virtual) event instance ready for rendering.
 * For recurring events, each generated occurrence becomes one ExpandedEvent.
 */
export interface ExpandedEvent {
    /** For series instances: `{masterId}__{isoDate}`. For singles/exceptions: original id. */
    instanceId: string;
    /** The original CalendarEvent (master for series instances, the row itself for singles/exceptions). */
    event: CalendarEvent;
    /** The computed start time for THIS instance */
    start: Date;
    /** The computed end time for THIS instance */
    end: Date;
    /** Is this a virtual instance generated from an rrule? */
    isRecurrenceInstance: boolean;
    /** The master event ID if this is a series instance */
    masterEventId?: string;
}

// Re-export for backward compatibility
export { GOOGLE_COLOR_MAP, getEventColor };

/**
 * The main merge algorithm.
 *
 * Given all CalendarEvent rows from the DB and a visible date range,
 * produces a flat list of ExpandedEvent[] for rendering.
 *
 * Algorithm:
 * 1. Separate events into Masters (have rrule), Singles (no rrule, no parent), Exceptions (have parent_event_id)
 * 2. For each Master, expand rrule within range → generate virtual instances
 * 3. For each Master, collect its exceptions → build exDate set (dates to skip)
 * 4. Filter out generated instances that match exDates
 * 5. Include exception events (modified instances) directly as concrete events
 * 6. Include single events directly
 * 7. Merge and sort
 */
export function expandEventsForRange(
    events: CalendarEvent[],
    rangeStart: Date,
    rangeEnd: Date
): ExpandedEvent[] {
    const result: ExpandedEvent[] = [];

    // Categorize
    const masters: CalendarEvent[] = [];
    const singles: CalendarEvent[] = [];
    const exceptions: CalendarEvent[] = [];

    for (const ev of events) {
        if (ev.deleted_at && !ev.is_deleted_instance) continue; // soft-deleted, skip
        if (ev.parent_event_id) {
            exceptions.push(ev);
        } else if (ev.rrule) {
            masters.push(ev);
        } else {
            singles.push(ev);
        }
    }

    // Build exception lookup: parentId → Set of original-occurrence ISO strings
    const exDateMap = new Map<string, Set<string>>();
    // Also build exception event map for replacement instances
    const exceptionsByParent = new Map<string, CalendarEvent[]>();

    for (const ex of exceptions) {
        if (!ex.parent_event_id) continue;

        // Build exDate set
        if (ex.recurring_event_id) {
            if (!exDateMap.has(ex.parent_event_id)) {
                exDateMap.set(ex.parent_event_id, new Set());
            }
            exDateMap.get(ex.parent_event_id)!.add(ex.recurring_event_id);
        }

        // Group exceptions by parent
        if (!exceptionsByParent.has(ex.parent_event_id)) {
            exceptionsByParent.set(ex.parent_event_id, []);
        }
        exceptionsByParent.get(ex.parent_event_id)!.push(ex);
    }

    // 1. Expand Masters
    for (const master of masters) {
        const duration = new Date(master.end_at).getTime() - new Date(master.start_at).getTime();
        const exDates = exDateMap.get(master.id) || new Set<string>();

        try {
            // Parse the rrule string
            const rruleStr = master.rrule!;
            const dtstart = new Date(master.start_at);

            // Build RRule object
            const rule = buildRRule(rruleStr, dtstart);

            // Generate occurrences within the visible range
            // Add buffer: events before range might have duration extending into range
            const bufferStart = new Date(rangeStart.getTime() - duration);
            const occurrences = rule.between(bufferStart, rangeEnd, true);

            for (const occStart of occurrences) {
                const occEnd = new Date(occStart.getTime() + duration);

                // Check if this occurrence is within the visible range
                if (occEnd <= rangeStart || occStart >= rangeEnd) continue;

                // Check exDates — skip this occurrence if it has been replaced/deleted
                const occIso = occStart.toISOString();
                if (exDates.has(occIso)) continue;

                result.push({
                    instanceId: `${master.id}__${occIso}`,
                    event: master,
                    start: occStart,
                    end: occEnd,
                    isRecurrenceInstance: true,
                    masterEventId: master.id,
                });
            }
        } catch (err) {
            console.error(`[EventExpander] Failed to expand rrule for event ${master.id}:`, err);
            // Fallback: treat as single event
            const start = new Date(master.start_at);
            const end = new Date(master.end_at);
            if (end > rangeStart && start < rangeEnd) {
                result.push({
                    instanceId: master.id,
                    event: master,
                    start,
                    end,
                    isRecurrenceInstance: false,
                });
            }
        }
    }

    // 2. Include exception events (modified instances) — but NOT deleted ones
    for (const ex of exceptions) {
        if (ex.is_deleted_instance) continue;
        if (ex.deleted_at) continue;

        const start = new Date(ex.start_at);
        const end = new Date(ex.end_at);

        if (end > rangeStart && start < rangeEnd) {
            result.push({
                instanceId: ex.id,
                event: ex,
                start,
                end,
                isRecurrenceInstance: false, // It's a concrete DB row
                masterEventId: ex.parent_event_id || undefined,
            });
        }
    }

    // 3. Include single events
    for (const single of singles) {
        const start = new Date(single.start_at);
        const end = new Date(single.end_at);

        if (end > rangeStart && start < rangeEnd) {
            result.push({
                instanceId: single.id,
                event: single,
                start,
                end,
                isRecurrenceInstance: false,
            });
        }
    }

    // Sort by start time (all-day first within same start)
    result.sort((a, b) => {
        if (a.event.is_all_day && !b.event.is_all_day) return -1;
        if (!a.event.is_all_day && b.event.is_all_day) return 1;
        return a.start.getTime() - b.start.getTime();
    });

    return result;
}

/**
 * Build an RRule object from an RFC 5545 RRULE string and a dtstart.
 * Handles common formats like "FREQ=DAILY", "FREQ=WEEKLY;BYDAY=MO,WE,FR", etc.
 */
function buildRRule(rruleStr: string, dtstart: Date): RRule {
    // If the string already contains DTSTART, parse directly
    if (rruleStr.toUpperCase().includes('DTSTART')) {
        return RRule.fromString(rruleStr);
    }

    // Otherwise, prepend DTSTART and RRULE: prefix
    // The rrule library expects: "DTSTART:...\nRRULE:..."
    const dtstartStr = formatRRuleDate(dtstart);
    // Strip any existing RRULE: prefix to avoid double-prefix (RRULE:RRULE:...)
    const cleanRRule = rruleStr.replace(/^RRULE:/i, '');
    const fullStr = `DTSTART:${dtstartStr}\nRRULE:${cleanRRule}`;

    return RRule.fromString(fullStr);
}

/**
 * Format a Date to rrule DTSTART format: YYYYMMDDTHHMMSSZ
 */
function formatRRuleDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Convert a RecurringConfig (old format) to an RFC 5545 rrule string.
 * Used for migration from the old scheduler system.
 */
export function recurringConfigToRRule(config: {
    frequency: string;
    interval?: number;
    byWeekDays?: number[];
    byMonthDay?: number;
    endType?: string;
    endDate?: string;
    endCount?: number;
}): string {
    const parts: string[] = [];

    parts.push(`FREQ=${config.frequency.toUpperCase()}`);

    if (config.interval && config.interval > 1) {
        parts.push(`INTERVAL=${config.interval}`);
    }

    if (config.byWeekDays && config.byWeekDays.length > 0) {
        const dayMap: Record<number, string> = { 0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA' };
        const days = config.byWeekDays.map(d => dayMap[d]).filter(Boolean);
        if (days.length > 0) {
            parts.push(`BYDAY=${days.join(',')}`);
        }
    }

    if (config.byMonthDay) {
        parts.push(`BYMONTHDAY=${config.byMonthDay}`);
    }

    if (config.endType === 'date' && config.endDate) {
        const d = new Date(config.endDate);
        const until = formatRRuleDate(d);
        parts.push(`UNTIL=${until}`);
    } else if (config.endType === 'count' && config.endCount) {
        parts.push(`COUNT=${config.endCount}`);
    }

    return parts.join(';');
}

/**
 * Add an UNTIL clause to an existing rrule string.
 * Used when splitting a series ("this and following events").
 */
export function addUntilToRRule(rrule: string, untilDate: Date): string {
    // Remove any existing UNTIL or COUNT
    const parts = rrule.split(';').filter(p => {
        const key = p.split('=')[0].toUpperCase();
        return key !== 'UNTIL' && key !== 'COUNT';
    });

    // Add UNTIL (day before the split date, end of day)
    const until = new Date(untilDate);
    until.setDate(until.getDate() - 1);
    until.setHours(23, 59, 59, 0);
    parts.push(`UNTIL=${formatRRuleDate(until)}`);

    return parts.join(';');
}

/**
 * Convert FullCalendar event format for rrule plugin.
 * Returns the object shape that FullCalendar's rrule plugin expects.
 */
export function toFullCalendarEvent(expanded: ExpandedEvent): Record<string, unknown> {
    const ev = expanded.event;
    const color = getEventColor(ev.color_id);

    // For series masters, return rrule + exdate format for FullCalendar
    // For singles/exceptions, return simple start/end
    return {
        id: expanded.instanceId,
        title: ev.title,
        start: expanded.start,
        end: expanded.end,
        allDay: ev.is_all_day,
        backgroundColor: color,
        borderColor: color,
        textColor: '#ffffff',
        extendedProps: {
            eventId: ev.id,
            calendarEvent: ev,
            isRecurrenceInstance: expanded.isRecurrenceInstance,
            masterEventId: expanded.masterEventId,
            originalStart: expanded.isRecurrenceInstance ? expanded.start.toISOString() : undefined,
            location: ev.location,
            description: ev.description,
            attendees: ev.attendees,
            conferenceData: ev.conference_data,
            colorId: ev.color_id,
        },
    };
}

/**
 * Convert a series master directly to FullCalendar rrule format.
 * This lets FullCalendar's rrule plugin handle expansion natively.
 */
export function masterToFullCalendarRRule(
    master: CalendarEvent,
    exDates: string[]
): Record<string, unknown> {
    const color = getEventColor(master.color_id);
    const duration = new Date(master.end_at).getTime() - new Date(master.start_at).getTime();
    const durationMs = Math.max(duration, 30 * 60 * 1000); // min 30 min

    return {
        id: master.id,
        title: master.title,
        allDay: master.is_all_day,
        backgroundColor: color,
        borderColor: color,
        textColor: '#ffffff',
        rrule: `DTSTART:${formatRRuleDate(new Date(master.start_at))}\nRRULE:${(master.rrule || '').replace(/^RRULE:/i, '')}`,
        exdate: exDates,
        duration: durationMs,
        extendedProps: {
            eventId: master.id,
            calendarEvent: master,
            isRecurrenceInstance: true,
            masterEventId: master.id,
            location: master.location,
            description: master.description,
            attendees: master.attendees,
            conferenceData: master.conference_data,
            colorId: master.color_id,
        },
    };
}

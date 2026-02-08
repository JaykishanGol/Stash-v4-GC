/**
 * Event DB Adapter
 * Converts Supabase event rows to frontend CalendarEvent type.
 */

import type { CalendarEvent, EventAttendee, EventReminder, EventConferenceData, EventAttachment } from './types';

// The raw Supabase row shape for the events table
interface EventRow {
    id: string;
    user_id: string;
    title: string;
    description: string | null;
    start_at: string;
    end_at: string;
    is_all_day: boolean;
    rrule: string | null;
    parent_event_id: string | null;
    recurring_event_id: string | null;
    is_deleted_instance: boolean;
    location: string | null;
    color_id: string | null;
    visibility: string | null;
    transparency: string | null;
    timezone: string | null;
    attendees: unknown;
    conference_data: unknown;
    reminders: unknown;
    attachments: unknown;
    google_event_id: string | null;
    google_calendar_id: string | null;
    google_etag: string | null;
    remote_updated_at: string | null;
    // Google Task fields
    is_google_task?: boolean;
    google_task_id?: string | null;
    google_task_list_id?: string | null;
    is_completed?: boolean;
    completed_at?: string | null;
    sort_position?: string | null;
    // Source entity
    source_entity_type?: string | null;
    source_entity_id?: string | null;
    // Metadata
    created_at: string | null;
    updated_at: string | null;
    deleted_at: string | null;
    is_unsynced?: boolean;
}

function parseJsonArray<T>(value: unknown, fallback: T[] = []): T[] {
    if (Array.isArray(value)) return value as T[];
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return fallback; }
    }
    return fallback;
}

function parseJsonObject<T>(value: unknown, fallback: T | null = null): T | null {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object' && !Array.isArray(value)) return value as T;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return fallback; }
    }
    return fallback;
}

export function adaptEventRow(row: EventRow): CalendarEvent {
    return {
        id: row.id,
        user_id: row.user_id,
        title: row.title || '',
        description: row.description || '',
        start_at: row.start_at,
        end_at: row.end_at,
        is_all_day: row.is_all_day ?? false,
        rrule: row.rrule || null,
        parent_event_id: row.parent_event_id || null,
        recurring_event_id: row.recurring_event_id || null,
        is_deleted_instance: row.is_deleted_instance ?? false,
        location: row.location || '',
        color_id: row.color_id || '7',
        visibility: (row.visibility as CalendarEvent['visibility']) || 'default',
        transparency: (row.transparency as CalendarEvent['transparency']) || 'opaque',
        timezone: row.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        attendees: parseJsonArray<EventAttendee>(row.attendees),
        conference_data: parseJsonObject<EventConferenceData>(row.conference_data),
        reminders: parseJsonArray<EventReminder>(row.reminders, [{ method: 'popup', minutes: 10 }]),
        attachments: parseJsonArray<EventAttachment>(row.attachments),
        google_event_id: row.google_event_id || null,
        google_calendar_id: row.google_calendar_id || 'primary',
        google_etag: row.google_etag || null,
        remote_updated_at: row.remote_updated_at || null,
        // Google Task fields
        is_google_task: row.is_google_task ?? false,
        google_task_id: row.google_task_id ?? null,
        google_task_list_id: row.google_task_list_id ?? null,
        is_completed: row.is_completed ?? false,
        completed_at: row.completed_at ?? null,
        sort_position: row.sort_position ?? null,
        // Source entity
        source_entity_type: (row.source_entity_type as CalendarEvent['source_entity_type']) ?? null,
        source_entity_id: row.source_entity_id ?? null,
        // Metadata
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
        deleted_at: row.deleted_at || null,
        is_unsynced: row.is_unsynced,
    };
}

export function adaptEventRows(rows: EventRow[]): CalendarEvent[] {
    return rows.map(adaptEventRow);
}

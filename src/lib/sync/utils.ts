/**
 * Sync Module — Shared utilities
 * 
 * Dedup guards, conflict resolution helpers, date parsers,
 * payload builders, and Google error handling.
 */

import type { CalendarEvent, Item, ItemGoogleSyncMeta } from '../types';
import type {
  GoogleEvent,
  GoogleTask,
} from '../googleClient';
import { supabase } from '../supabase';

// ============ Constants ============

export const INITIAL_EVENT_PULL_DAYS = 365;
export const MANUAL_FULL_PULL_DAYS = 3650;
export const FALLBACK_EVENT_DURATION_MS = 60 * 60 * 1000;
export const FALLBACK_ITEM_EVENT_DURATION_MS = 30 * 60 * 1000;
export const MAX_PUSH_EVENTS_PER_CYCLE = 25;
export const MAX_PUSH_TASKS_PER_CYCLE = 50;
export const MAX_PUSH_ITEMS_PER_CYCLE = 50;
export const MAX_GOOGLE_REMINDER_MINUTES = 40320;
export const MIN_GOOGLE_REMINDER_MINUTES = 0;

// ============ Date Helpers ============

export function nowIso(): string {
  return new Date().toISOString();
}

export function safeDateMs(input?: string | null): number {
  if (!input) return Number.NaN;
  return new Date(input).getTime();
}

export function parseGoogleDate(value?: string): string | null {
  if (!value) return null;
  if (value.includes('T')) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function toDatePart(value?: string | null): string | null {
  if (!value) return null;
  const direct = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function addDaysToDatePart(datePart: string, days: number): string {
  const date = new Date(`${datePart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ============ Conflict Resolution ============

export function isRemoteStrictlyNewer(
  localUpdatedAt?: string | null,
  remoteUpdatedAt?: string | null
): boolean {
  const localMs = safeDateMs(localUpdatedAt);
  const remoteMs = safeDateMs(remoteUpdatedAt);
  if (Number.isNaN(remoteMs)) return false;
  if (Number.isNaN(localMs)) return true;
  return remoteMs > localMs;
}

export function isLocalStrictlyNewer(
  localUpdatedAt?: string | null,
  remoteUpdatedAt?: string | null
): boolean {
  const localMs = safeDateMs(localUpdatedAt);
  const remoteMs = safeDateMs(remoteUpdatedAt);
  if (Number.isNaN(localMs)) return false;
  if (Number.isNaN(remoteMs)) return true;
  return localMs > remoteMs;
}

export function getRemoteEventUpdatedAt(remote: GoogleEvent): string {
  return remote.updated || nowIso();
}

export function getRemoteTaskUpdatedAt(remote: GoogleTask): string {
  return remote.updated || nowIso();
}

// ============ Email Validation ============

function isValidEmail(email?: string | null): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ============ Payload Builders ============

function toEventReminderOverrides(event: CalendarEvent) {
  const overrides = (event.reminders || [])
    .map((r) => ({
      method: r.method === 'email' ? 'email' : 'popup',
      minutes: Math.min(
        MAX_GOOGLE_REMINDER_MINUTES,
        Math.max(MIN_GOOGLE_REMINDER_MINUTES, Math.round(Number(r.minutes) || 0))
      ),
    }))
    .filter((r) => Number.isFinite(r.minutes));

  if (!overrides.length) {
    return { useDefault: true as const };
  }
  return {
    useDefault: false as const,
    overrides,
  };
}

export function toGoogleEventPayload(
  event: CalendarEvent,
  options: { minimal?: boolean } = {}
): Record<string, unknown> {
  const minimal = !!options.minimal;
  const validAttendees = (event.attendees || [])
    .filter((a) => isValidEmail(a.email))
    .map((a) => ({
      email: a.email.trim(),
      displayName: a.displayName || undefined,
      responseStatus:
        a.responseStatus === 'accepted' ||
        a.responseStatus === 'declined' ||
        a.responseStatus === 'tentative' ||
        a.responseStatus === 'needsAction'
          ? a.responseStatus
          : undefined,
    }));

  const payload: Record<string, unknown> = {
    summary: event.title || '(No title)',
    description: event.description || '',
  };

  if (event.is_all_day) {
    const startDate = toDatePart(event.start_at) || nowIso().slice(0, 10);
    const rawEndDate = toDatePart(event.end_at) || startDate;
    const endDate = rawEndDate > startDate ? rawEndDate : addDaysToDatePart(startDate, 1);
    payload.start = { date: startDate };
    payload.end = { date: endDate };
  } else {
    const startMs = safeDateMs(event.start_at);
    const resolvedStartMs = Number.isNaN(startMs) ? Date.now() : startMs;
    const endMs = safeDateMs(event.end_at);
    const resolvedEndMs =
      Number.isNaN(endMs) || endMs <= resolvedStartMs
        ? resolvedStartMs + FALLBACK_EVENT_DURATION_MS
        : endMs;
    payload.start = {
      dateTime: new Date(resolvedStartMs).toISOString(),
      timeZone: event.timezone || undefined,
    };
    payload.end = {
      dateTime: new Date(resolvedEndMs).toISOString(),
      timeZone: event.timezone || undefined,
    };
  }

  if (minimal) return payload;

  payload.location = event.location || undefined;
  payload.colorId = event.color_id || undefined;
  payload.visibility = event.visibility === 'default' ? undefined : event.visibility;
  payload.transparency =
    event.transparency === 'transparent' || event.transparency === 'opaque'
      ? event.transparency
      : 'opaque';
  payload.attendees = validAttendees.length ? validAttendees : undefined;
  payload.reminders = toEventReminderOverrides(event);

  if (event.rrule && !event.parent_event_id) {
    const normalizedRrule = event.rrule.replace(/^RRULE:/i, '').trim();
    if (/(^|;)FREQ=/.test(normalizedRrule.toUpperCase())) {
      payload.recurrence = [`RRULE:${normalizedRrule}`];
    }
  }

  if (event.conference_data?.meetLink === 'pending') {
    payload.conferenceData = {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  return payload;
}

export function toGoogleTaskPayloadFromEvent(event: CalendarEvent): Record<string, unknown> {
  return {
    title: event.title || '(No title)',
    notes: event.description || '',
    due: event.start_at || undefined,
    status: event.is_completed ? 'completed' : 'needsAction',
  };
}

export function toGoogleEventPayloadFromItem(
  item: Item,
  options: { minimal?: boolean } = {}
): Record<string, unknown> {
  const minimal = !!options.minimal;
  const content = item.content && typeof item.content === 'object'
    ? (item.content as Record<string, unknown>)
    : {};
  const text = typeof content.text === 'string' ? content.text : '';
  const url = typeof content.url === 'string' ? content.url : '';
  const description = item.type === 'link' && url ? (text ? `${text}\n${url}` : url) : text;

  const startMs = safeDateMs(item.scheduled_at);
  const resolvedStartMs = Number.isNaN(startMs) ? Date.now() : startMs;
  const endMs = resolvedStartMs + FALLBACK_ITEM_EVENT_DURATION_MS;

  const payload: Record<string, unknown> = {
    summary: item.title || '(No title)',
    description,
    start: { dateTime: new Date(resolvedStartMs).toISOString() },
    end: { dateTime: new Date(endMs).toISOString() },
  };

  if (minimal) return payload;
  return payload;
}

export function toGoogleTaskPayloadFromItem(item: Item): Record<string, unknown> {
  const content = item.content && typeof item.content === 'object'
    ? (item.content as Record<string, unknown>)
    : {};
  const text = typeof content.text === 'string' ? content.text : '';
  const url = typeof content.url === 'string' ? content.url : '';
  const description = item.type === 'link' && url ? (text ? `${text}\n${url}` : url) : text;

  return {
    title: item.title || '(No title)',
    notes: description,
    due: item.scheduled_at || undefined,
    status: item.is_completed ? 'completed' : 'needsAction',
  };
}

// ============ Item Sync Meta Helpers ============

export function getItemSyncMeta(item: Item): ItemGoogleSyncMeta {
  const content = item.content;
  if (!content || typeof content !== 'object') return {};
  return content as ItemGoogleSyncMeta;
}

export function mergeItemSyncMeta(
  item: Item,
  patch: Partial<ItemGoogleSyncMeta>
): Item['content'] {
  const existing = item.content && typeof item.content === 'object' ? item.content : {};
  return { ...existing, ...patch } as Item['content'];
}

// ============ Google Error Helpers ============

interface GoogleRequestErrorLike {
  status?: number;
  details?: string;
}

export function getGoogleRequestStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const maybe = error as GoogleRequestErrorLike;
  return typeof maybe.status === 'number' ? maybe.status : null;
}

function getGoogleRequestReason(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const maybe = error as GoogleRequestErrorLike;
  if (!maybe.details || typeof maybe.details !== 'string') return null;
  try {
    const parsed = JSON.parse(maybe.details) as {
      error?: { errors?: Array<{ reason?: string }> };
    };
    return parsed?.error?.errors?.[0]?.reason || null;
  } catch {
    return null;
  }
}

export function isGoogleRateLimitError(error: unknown): boolean {
  const status = getGoogleRequestStatus(error);
  if (status === 429) return true;
  if (status !== 403) return false;
  const reason = (getGoogleRequestReason(error) || '').toLowerCase();
  return (
    reason === 'ratelimitexceeded' ||
    reason === 'userratelimitexceeded' ||
    reason === 'quotaexceeded' ||
    reason === 'dailylimitexceeded'
  );
}

// ============ Cursor Management ============

export async function getCursor(
  userId: string,
  resourceType: 'event' | 'task',
  scopeId: string
) {
  const { data, error } = await supabase
    .from('google_sync_cursors')
    .select('user_id, resource_type, scope_id, sync_token, last_pulled_at')
    .eq('user_id', userId)
    .eq('resource_type', resourceType)
    .eq('scope_id', scopeId)
    .maybeSingle();
  if (error) {
    console.warn('[Sync/Utils] Failed loading cursor:', error.message);
    return null;
  }
  return data as { sync_token: string | null; last_pulled_at: string | null } | null;
}

export async function upsertCursor(
  userId: string,
  resourceType: 'event' | 'task',
  scopeId: string,
  values: { sync_token?: string | null; last_pulled_at?: string | null }
) {
  const payload = {
    user_id: userId,
    resource_type: resourceType,
    scope_id: scopeId,
    sync_token: values.sync_token ?? null,
    last_pulled_at: values.last_pulled_at ?? nowIso(),
    updated_at: nowIso(),
  };
  const { error } = await supabase
    .from('google_sync_cursors')
    .upsert(payload, { onConflict: 'user_id,resource_type,scope_id' });
  if (error) {
    console.warn('[Sync/Utils] Failed saving cursor:', error.message);
  }
}

export async function clearCursor(
  userId: string,
  resourceType: 'event' | 'task',
  scopeId: string
) {
  const { error } = await supabase
    .from('google_sync_cursors')
    .delete()
    .eq('user_id', userId)
    .eq('resource_type', resourceType)
    .eq('scope_id', scopeId);
  if (error) {
    console.warn('[Sync/Utils] Failed clearing cursor:', error.message);
  }
}

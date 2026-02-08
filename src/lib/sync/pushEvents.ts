/**
 * Sync Module — Push local Calendar Events to Google Calendar API
 */

import { useAppStore } from '../../store/useAppStore';
import {
  GoogleClient,
  isNoGoogleAccessTokenError,
  type GoogleEvent,
} from '../googleClient';
import type { LinkRecord } from './types';
import { upsertLink, findEventLink, deleteLinkById } from './links';
import {
  nowIso,
  safeDateMs,
  toGoogleEventPayload,
  getGoogleRequestStatus,
  isGoogleRateLimitError,
  MAX_PUSH_EVENTS_PER_CYCLE,
} from './utils';

/**
 * Push unsynced local CalendarEvents (non-Google-Task) to Google Calendar.
 */
export async function pushLocalEvents(
  userId: string,
  links: LinkRecord[]
): Promise<{ pushed: number; errors: string[] }> {
  const state = useAppStore.getState();
  const errors: string[] = [];
  let pushed = 0;

  const unsyncedEvents = state.calendarEvents
    .filter(
      (e) =>
        e.user_id === userId &&
        e.is_unsynced &&
        !e.is_google_task &&
        e.google_calendar_id !== 'tasks'
    )
    .sort((a, b) => {
      const aNeedsCreate = !a.google_event_id;
      const bNeedsCreate = !b.google_event_id;
      if (aNeedsCreate !== bNeedsCreate) return aNeedsCreate ? -1 : 1;
      const aMs = safeDateMs(a.updated_at);
      const bMs = safeDateMs(b.updated_at);
      if (Number.isNaN(aMs) && Number.isNaN(bMs)) return 0;
      if (Number.isNaN(aMs)) return 1;
      if (Number.isNaN(bMs)) return -1;
      return bMs - aMs;
    })
    .slice(0, MAX_PUSH_EVENTS_PER_CYCLE);

  for (const event of unsyncedEvents) {
    const calendarId = event.google_calendar_id || 'primary';
    const linked = event.google_event_id
      ? findEventLink(links, calendarId, event.google_event_id)
      : links.find((l) => l.resource_type === 'event' && l.local_id === event.id) || null;

    try {
      // Handle deleted events
      if (event.deleted_at) {
        if (event.google_event_id) {
          try {
            await GoogleClient.deleteEvent(calendarId, event.google_event_id);
          } catch (deleteError) {
            if (isNoGoogleAccessTokenError(deleteError)) throw deleteError;
            const status = getGoogleRequestStatus(deleteError);
            if (status !== 404 && status !== 410) throw deleteError;
          }
        }
        if (linked) await deleteLinkById(linked.id);
        await patchLocalEvent(event.id, { is_unsynced: false, remote_updated_at: nowIso() });
        pushed++;
        continue;
      }

      // Push create or update
      const payload = toGoogleEventPayload(event);
      let remote: GoogleEvent;

      if (event.google_event_id) {
        try {
          remote = await GoogleClient.patchEvent(calendarId, event.google_event_id, payload);
        } catch (updateError) {
          if (isNoGoogleAccessTokenError(updateError)) throw updateError;
          const status = getGoogleRequestStatus(updateError);
          if (status === 404 || status === 410) {
            remote = await GoogleClient.createEvent(calendarId, payload);
          } else if (status === 400) {
            // Retry with minimal payload
            try {
              remote = await GoogleClient.patchEvent(
                calendarId,
                event.google_event_id,
                toGoogleEventPayload(event, { minimal: true })
              );
            } catch (fallbackError) {
              if (isNoGoogleAccessTokenError(fallbackError)) throw fallbackError;
              const fStatus = getGoogleRequestStatus(fallbackError);
              if (fStatus === 404 || fStatus === 410) {
                remote = await GoogleClient.createEvent(calendarId, toGoogleEventPayload(event, { minimal: true }));
              } else {
                throw fallbackError;
              }
            }
          } else {
            throw updateError;
          }
        }
      } else {
        try {
          remote = await GoogleClient.createEvent(calendarId, payload);
        } catch (createError) {
          if (isNoGoogleAccessTokenError(createError)) throw createError;
          const status = getGoogleRequestStatus(createError);
          if (status === 400) {
            remote = await GoogleClient.createEvent(calendarId, toGoogleEventPayload(event, { minimal: true }));
          } else {
            throw createError;
          }
        }
      }

      // Sync local event with remote response
      await upsertLink({
        user_id: userId,
        local_id: event.id,
        local_type: 'calendar_event',
        google_id: remote.id,
        resource_type: 'event',
        calendar_id: calendarId,
        remote_etag: remote.etag || null,
        remote_updated_at: remote.updated || null,
        direction: 'push',
      });

      await patchLocalEvent(event.id, {
        google_event_id: remote.id,
        google_calendar_id: calendarId,
        google_etag: remote.etag || null,
        remote_updated_at: remote.updated || nowIso(),
        updated_at: remote.updated || event.updated_at,
        is_unsynced: false,
        deleted_at: null,
      });

      pushed++;
    } catch (error) {
      if (isNoGoogleAccessTokenError(error)) throw error;
      if (isGoogleRateLimitError(error)) throw error;
      const message = error instanceof Error ? error.message : 'Event push failed';
      console.warn('[Sync/PushEvents] Failed:', message);
      errors.push(`Event "${event.title}": ${message}`);
    }
  }

  return { pushed, errors };
}

async function patchLocalEvent(eventId: string, updates: Partial<import('../types').CalendarEvent>) {
  const existing = useAppStore.getState().calendarEvents.find((e) => e.id === eventId);
  if (!existing) return;
  const merged = { ...existing, ...updates };
  useAppStore.setState((s) => ({
    calendarEvents: s.calendarEvents.map((e) => (e.id === eventId ? merged : e)),
  }));
  await useAppStore.getState().syncEventToDb(merged);
}

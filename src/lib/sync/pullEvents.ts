/**
 * Sync Module — Pull Google Calendar Events into local events table
 */

import { useAppStore } from '../../store/useAppStore';
import {
  GoogleClient,
  isNoGoogleAccessTokenError,
  type GoogleEvent,
} from '../googleClient';
import { generateId } from '../utils';
import type { CalendarEvent } from '../types';
import type { LinkRecord } from './types';
import { upsertLink, findEventLink, deleteLinkById } from './links';
import {
  nowIso,
  parseGoogleDate,
  isRemoteStrictlyNewer,
  isLocalStrictlyNewer,
  getRemoteEventUpdatedAt,
  getCursor,
  upsertCursor,
  clearCursor,
  INITIAL_EVENT_PULL_DAYS,
  MANUAL_FULL_PULL_DAYS,
  mergeItemSyncMeta,
} from './utils';

/**
 * Pull events from all Google Calendars using incremental sync tokens.
 */
export async function pullRemoteEvents(
  userId: string,
  links: LinkRecord[],
  forceFullPull: boolean
): Promise<{ pulled: number; errors: string[] }> {
  const errors: string[] = [];
  let pulled = 0;

  const calendars = await GoogleClient.listCalendars();
  console.log(
    `[Sync/PullEvents] ${calendars.length} calendar(s):`,
    calendars.map((c) => `${c.summary || c.id} (${c.id})`)
  );

  for (const calendar of calendars) {
    const cursor = forceFullPull ? null : await getCursor(userId, 'event', calendar.id);
    const initialTimeMin = new Date(
      Date.now() -
        (forceFullPull ? MANUAL_FULL_PULL_DAYS : INITIAL_EVENT_PULL_DAYS) * 24 * 60 * 60 * 1000
    ).toISOString();

    let pulledData: { items: GoogleEvent[]; nextSyncToken?: string };

    try {
      pulledData = await GoogleClient.listEventsPaginated(calendar.id, {
        syncToken: cursor?.sync_token || undefined,
        timeMin: cursor?.sync_token ? undefined : initialTimeMin,
        showDeleted: true,
        singleEvents: false,
      });
    } catch (error) {
      if (isNoGoogleAccessTokenError(error)) throw error;
      const message = error instanceof Error ? error.message : '';
      if (message.includes('410') || message.toLowerCase().includes('gone')) {
        await clearCursor(userId, 'event', calendar.id);
        pulledData = await GoogleClient.listEventsPaginated(calendar.id, {
          timeMin: initialTimeMin,
          showDeleted: true,
          singleEvents: false,
        });
      } else {
        console.warn('[Sync/PullEvents] Failed:', message);
        errors.push(`Calendar "${calendar.summary}": ${message}`);
        continue;
      }
    }

    // Process masters first, then instances
    const masters = pulledData.items.filter((e) => !e.recurringEventId);
    const instances = pulledData.items.filter((e) => !!e.recurringEventId);
    const ordered = [...masters, ...instances];

    for (const remote of ordered) {
      const currentStore = useAppStore.getState();
      const remoteUpdatedAt = getRemoteEventUpdatedAt(remote);
      const existingLink = findEventLink(links, calendar.id, remote.id);

      // Check if linked to an Item
      const linkedItem =
        existingLink?.local_type === 'item'
          ? currentStore.items.find((i) => i.id === existingLink.local_id)
          : undefined;

      // Find existing CalendarEvent
      const existing =
        (existingLink && existingLink.local_type === 'calendar_event'
          ? currentStore.calendarEvents.find((e) => e.id === existingLink.local_id)
          : undefined) ||
        currentStore.calendarEvents.find(
          (e) =>
            e.google_event_id === remote.id &&
            (e.google_calendar_id || 'primary') === calendar.id
        );

      const remoteStart = parseGoogleDate(remote.start?.dateTime || remote.start?.date);
      const remoteEnd = parseGoogleDate(remote.end?.dateTime || remote.end?.date);
      const isAllDay = !!remote.start?.date;

      // Resolve parent for recurring instances
      const parentLocalId = remote.recurringEventId
        ? links.find(
            (l) =>
              l.resource_type === 'event' &&
              l.local_type === 'calendar_event' &&
              l.google_id === remote.recurringEventId &&
              (l.calendar_id || 'primary') === calendar.id
          )?.local_id ||
          currentStore.calendarEvents.find(
            (e) =>
              e.google_event_id === remote.recurringEventId &&
              (e.google_calendar_id || 'primary') === calendar.id
          )?.id ||
          null
        : null;

      // Handle linked items
      if (linkedItem) {
        if (linkedItem.deleted_at) continue;
        const localIsNewer = isLocalStrictlyNewer(linkedItem.updated_at, remoteUpdatedAt);

        if (remote.status === 'cancelled') {
          if (!localIsNewer) {
            await patchLocalItem(linkedItem.id, {
              scheduled_at: null,
              updated_at: remoteUpdatedAt,
              is_unsynced: false,
              content: mergeItemSyncMeta(linkedItem, {
                google_sync_target: null,
                google_sync_calendar_id: null,
                google_sync_task_list_id: null,
              }),
            });
            if (existingLink) await deleteLinkById(existingLink.id);
          } else if (!linkedItem.is_unsynced) {
            await patchLocalItem(linkedItem.id, { is_unsynced: true });
          }
          continue;
        }

        if (!remoteStart) continue;

        if (isRemoteStrictlyNewer(linkedItem.updated_at, remoteUpdatedAt)) {
          await patchLocalItem(linkedItem.id, {
            title: remote.summary || linkedItem.title,
            scheduled_at: remoteStart,
            updated_at: remoteUpdatedAt,
            is_unsynced: false,
            content: mergeItemSyncMeta(linkedItem, {
              google_sync_target: 'event',
              google_sync_calendar_id: calendar.id,
              google_sync_task_list_id: null,
            }),
          });
        } else if (localIsNewer && !linkedItem.is_unsynced) {
          await patchLocalItem(linkedItem.id, { is_unsynced: true });
        } else if (!localIsNewer && linkedItem.is_unsynced) {
          await patchLocalItem(linkedItem.id, { is_unsynced: false, updated_at: remoteUpdatedAt });
        }
        continue;
      }

      // Handle cancelled events
      if (remote.status === 'cancelled') {
        if (remote.recurringEventId && parentLocalId) {
          await handleCancelledRecurringInstance(
            userId,
            remote,
            calendar.id,
            parentLocalId,
            remoteUpdatedAt,
            remoteStart,
            remoteEnd,
            isAllDay,
            currentStore,
            links
          );
        } else if (existing) {
          const localIsNewer = isLocalStrictlyNewer(existing.updated_at, remoteUpdatedAt);
          if (!localIsNewer) {
            await patchLocalEvent(existing.id, {
              deleted_at: nowIso(),
              remote_updated_at: remoteUpdatedAt,
              google_etag: remote.etag || null,
              updated_at: remoteUpdatedAt,
              is_unsynced: false,
            });
          } else if (!existing.is_unsynced) {
            await patchLocalEvent(existing.id, { is_unsynced: true });
          }
        }
        pulled++;
        continue;
      }

      if (!remoteStart || !remoteEnd) continue;

      // Parse recurrence and other fields
      const normalizedRrule =
        remote.recurrence?.find((r) => r.toUpperCase().startsWith('RRULE:'))?.replace(/^RRULE:/i, '') ||
        null;

      const reminders: CalendarEvent['reminders'] = remote.reminders?.overrides?.length
        ? remote.reminders.overrides.map((r) => ({
            method: r.method === 'email' ? 'email' : ('popup' as const),
            minutes: r.minutes,
          }))
        : [{ method: 'popup' as const, minutes: 10 }];

      const conferenceEntry = remote.conferenceData?.entryPoints?.find(
        (entry) => entry.entryPointType === 'video'
      );

      if (existing) {
        if (existing.deleted_at) continue; // Anti-resurrection

        if (isRemoteStrictlyNewer(existing.updated_at, remoteUpdatedAt)) {
          await patchLocalEvent(existing.id, {
            title: remote.summary || existing.title,
            description: remote.description || '',
            location: remote.location || '',
            start_at: remoteStart,
            end_at: remoteEnd,
            is_all_day: isAllDay,
            rrule: parentLocalId ? null : normalizedRrule,
            parent_event_id: parentLocalId,
            recurring_event_id:
              parseGoogleDate(remote.originalStartTime?.dateTime || remote.originalStartTime?.date) || null,
            is_deleted_instance: false,
            visibility: (remote.visibility as CalendarEvent['visibility']) || 'default',
            transparency: (remote.transparency as CalendarEvent['transparency']) || 'opaque',
            attendees:
              remote.attendees?.map((a) => ({
                email: a.email,
                responseStatus: (a.responseStatus as 'needsAction' | 'declined' | 'tentative' | 'accepted') || 'needsAction',
              })) || [],
            conference_data: conferenceEntry
              ? { meetLink: conferenceEntry.uri, entryPoints: remote.conferenceData?.entryPoints || [] }
              : null,
            reminders,
            google_event_id: remote.id,
            google_calendar_id: calendar.id,
            google_etag: remote.etag || null,
            remote_updated_at: remoteUpdatedAt,
            updated_at: remoteUpdatedAt,
            is_unsynced: false,
          });
        } else {
          const localIsNewer = isLocalStrictlyNewer(existing.updated_at, remoteUpdatedAt);
          if (localIsNewer && !existing.is_unsynced) {
            await patchLocalEvent(existing.id, { is_unsynced: true });
          } else if (!localIsNewer && existing.is_unsynced) {
            await patchLocalEvent(existing.id, {
              is_unsynced: false,
              remote_updated_at: remoteUpdatedAt,
              google_etag: remote.etag || existing.google_etag || null,
            });
          }
        }
      } else {
        // Create new local event
        const eventId = generateId();
        const newEvent: CalendarEvent = {
          id: eventId,
          user_id: userId,
          title: remote.summary || '(No title)',
          description: remote.description || '',
          start_at: remoteStart,
          end_at: remoteEnd,
          is_all_day: isAllDay,
          rrule: parentLocalId ? null : normalizedRrule,
          parent_event_id: parentLocalId,
          recurring_event_id:
            parseGoogleDate(remote.originalStartTime?.dateTime || remote.originalStartTime?.date) || null,
          is_deleted_instance: false,
          location: remote.location || '',
          color_id: remote.colorId || '7',
          visibility: (remote.visibility as CalendarEvent['visibility']) || 'default',
          transparency: (remote.transparency as CalendarEvent['transparency']) || 'opaque',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          attendees:
            remote.attendees?.map((a) => ({
              email: a.email,
              responseStatus: (a.responseStatus as 'needsAction' | 'declined' | 'tentative' | 'accepted') || 'needsAction',
            })) || [],
          conference_data: conferenceEntry
            ? { meetLink: conferenceEntry.uri, entryPoints: remote.conferenceData?.entryPoints || [] }
            : null,
          reminders,
          attachments: [],
          google_event_id: remote.id,
          google_calendar_id: calendar.id,
          google_etag: remote.etag || null,
          remote_updated_at: remoteUpdatedAt,
          created_at: remoteUpdatedAt,
          updated_at: remoteUpdatedAt,
          deleted_at: null,
          is_unsynced: false,
        };

        await createLocalEvent(newEvent);
        await upsertLink({
          user_id: userId,
          local_id: eventId,
          local_type: 'calendar_event',
          google_id: remote.id,
          resource_type: 'event',
          calendar_id: calendar.id,
          remote_etag: remote.etag || null,
          remote_updated_at: remoteUpdatedAt,
          direction: 'pull',
        });
      }

      pulled++;
    }

    await upsertCursor(userId, 'event', calendar.id, {
      sync_token: pulledData.nextSyncToken || cursor?.sync_token || null,
      last_pulled_at: nowIso(),
    });
  }

  return { pulled, errors };
}

async function handleCancelledRecurringInstance(
  userId: string,
  remote: GoogleEvent,
  calendarId: string,
  parentLocalId: string,
  remoteUpdatedAt: string,
  remoteStart: string | null,
  remoteEnd: string | null,
  isAllDay: boolean,
  currentStore: ReturnType<typeof useAppStore.getState>,
  links: LinkRecord[]
) {
  const recurringStart =
    parseGoogleDate(
      remote.originalStartTime?.dateTime || remote.originalStartTime?.date
    ) || remoteStart;

  const existingException = currentStore.calendarEvents.find(
    (e) => e.parent_event_id === parentLocalId && e.recurring_event_id === recurringStart
  );

  const baseEvent =
    existingException ||
    currentStore.calendarEvents.find((e) => e.id === parentLocalId) ||
    currentStore.calendarEvents.find(
      (e) =>
        e.google_event_id === remote.id &&
        (e.google_calendar_id || 'primary') === calendarId
    );

  if (!baseEvent || !remoteStart || !remoteEnd || !recurringStart) return;

  const cancelledException: CalendarEvent = {
    ...baseEvent,
    id: existingException?.id || generateId(),
    title: remote.summary || baseEvent.title,
    start_at: remoteStart,
    end_at: remoteEnd,
    is_all_day: isAllDay,
    rrule: null,
    parent_event_id: parentLocalId,
    recurring_event_id: recurringStart,
    is_deleted_instance: true,
    google_event_id: remote.id,
    google_calendar_id: calendarId,
    google_etag: remote.etag || null,
    remote_updated_at: remoteUpdatedAt,
    updated_at: remoteUpdatedAt,
    deleted_at: null,
    is_unsynced: false,
  };

  if (existingException) {
    await patchLocalEvent(existingException.id, cancelledException);
  } else {
    await createLocalEvent(cancelledException);
  }

  await upsertLink({
    user_id: userId,
    local_id: cancelledException.id,
    local_type: 'calendar_event',
    google_id: remote.id,
    resource_type: 'event',
    calendar_id: calendarId,
    remote_etag: remote.etag || null,
    remote_updated_at: remoteUpdatedAt,
    direction: 'pull',
  });

  void links; // suppress unused warning
}

async function createLocalEvent(event: CalendarEvent) {
  const storeEvents = useAppStore.getState().calendarEvents;

  // Dedup guard: existing event with same google_event_id
  if (event.google_event_id) {
    const dup = storeEvents.find((e) => e.google_event_id === event.google_event_id);
    if (dup) {
      await patchLocalEvent(dup.id, event);
      return;
    }
  }

  useAppStore.setState((s) => ({
    calendarEvents: [event, ...s.calendarEvents],
  }));
  await useAppStore.getState().syncEventToDb(event);
}

async function patchLocalEvent(eventId: string, updates: Partial<CalendarEvent>) {
  const existing = useAppStore.getState().calendarEvents.find((e) => e.id === eventId);
  if (!existing) return;
  const merged = { ...existing, ...updates };
  useAppStore.setState((s) => ({
    calendarEvents: s.calendarEvents.map((e) => (e.id === eventId ? merged : e)),
  }));
  await useAppStore.getState().syncEventToDb(merged);
}

async function patchLocalItem(itemId: string, updates: Partial<import('../types').Item>) {
  const existing = useAppStore.getState().items.find((i) => i.id === itemId);
  if (!existing) return;
  const merged = { ...existing, ...updates };
  useAppStore.setState((s) => ({
    items: s.items.map((i) => (i.id === itemId ? merged : i)),
  }));
  await useAppStore.getState().syncItemToDb(merged);
}

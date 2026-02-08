/**
 * Sync Module — Push local Google Task events to Google Tasks API
 * 
 * These are CalendarEvent rows where is_google_task = true.
 */

import { useAppStore } from '../../store/useAppStore';
import {
  GoogleClient,
  isNoGoogleAccessTokenError,
  type GoogleTask,
} from '../googleClient';
import type { LinkRecord } from './types';
import { upsertLink, deleteLinkById } from './links';
import {
  nowIso,
  toGoogleTaskPayloadFromEvent,
  getGoogleRequestStatus,
  isGoogleRateLimitError,
  MAX_PUSH_TASKS_PER_CYCLE,
} from './utils';

/**
 * Push unsynced Google Task events to Google Tasks API.
 */
export async function pushLocalGoogleTasks(
  userId: string,
  links: LinkRecord[]
): Promise<{ pushed: number; errors: string[] }> {
  const state = useAppStore.getState();
  const errors: string[] = [];
  let pushed = 0;

  const unsyncedTasks = state.calendarEvents
    .filter(
      (e) =>
        e.user_id === userId &&
        e.is_unsynced &&
        e.is_google_task === true
    )
    .slice(0, MAX_PUSH_TASKS_PER_CYCLE);

  for (const event of unsyncedTasks) {
    const taskListId = event.google_task_list_id || '@default';
    const existingLink = links.find(
      (l) =>
        l.resource_type === 'task' &&
        l.local_type === 'calendar_event' &&
        l.local_id === event.id
    ) || null;

    try {
      // Handle deleted events
      if (event.deleted_at) {
        if (existingLink?.google_id) {
          try {
            await GoogleClient.deleteTask(
              existingLink.task_list_id || taskListId,
              existingLink.google_id
            );
          } catch (deleteError) {
            if (isNoGoogleAccessTokenError(deleteError)) throw deleteError;
            const status = getGoogleRequestStatus(deleteError);
            if (status !== 404 && status !== 410) throw deleteError;
          }
        }
        if (existingLink) await deleteLinkById(existingLink.id);
        await patchLocalEvent(event.id, { is_unsynced: false, remote_updated_at: nowIso() });
        pushed++;
        continue;
      }

      const payload = toGoogleTaskPayloadFromEvent(event);
      let remote: GoogleTask;

      if (existingLink?.google_id) {
        const linkedListId = existingLink.task_list_id || taskListId;
        try {
          remote = await GoogleClient.patchTask(linkedListId, existingLink.google_id, payload);
        } catch (updateError) {
          if (isNoGoogleAccessTokenError(updateError)) throw updateError;
          const status = getGoogleRequestStatus(updateError);
          if (status === 404 || status === 410) {
            remote = await GoogleClient.createTask(taskListId, payload);
          } else {
            throw updateError;
          }
        }
      } else {
        try {
          remote = await GoogleClient.createTask(taskListId, payload);
        } catch (createError) {
          if (isNoGoogleAccessTokenError(createError)) throw createError;
          const status = getGoogleRequestStatus(createError);
          if (status === 400) {
            remote = await GoogleClient.createTask(taskListId, {
              title: event.title || '(No title)',
              status: event.is_completed ? 'completed' : 'needsAction',
              due: event.start_at || undefined,
            });
          } else {
            throw createError;
          }
        }
      }

      await upsertLink({
        user_id: userId,
        local_id: event.id,
        local_type: 'calendar_event',
        google_id: remote.id,
        resource_type: 'task',
        task_list_id: taskListId,
        remote_etag: remote.etag || null,
        remote_updated_at: remote.updated || null,
        direction: 'push',
      });

      await patchLocalEvent(event.id, {
        google_task_id: remote.id,
        google_etag: remote.etag || null,
        remote_updated_at: remote.updated || nowIso(),
        sort_position: remote.position || event.sort_position || null,
        is_unsynced: false,
        updated_at: remote.updated || event.updated_at,
      });

      pushed++;
    } catch (error) {
      if (isNoGoogleAccessTokenError(error)) throw error;
      if (isGoogleRateLimitError(error)) throw error;
      const message = error instanceof Error ? error.message : 'Google Task push failed';
      console.warn('[Sync/PushGoogleTasks] Failed:', message);
      errors.push(`Task "${event.title}": ${message}`);
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

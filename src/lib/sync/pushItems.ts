/**
 * Sync Module — Push local Items (scheduled as Google Event/Task) to Google
 */

import { supabase } from '../supabase';
import { useAppStore } from '../../store/useAppStore';
import {
  GoogleClient,
  isNoGoogleAccessTokenError,
  type GoogleEvent,
  type GoogleTask,
} from '../googleClient';
import type { LinkRecord } from './types';
import { upsertLink, deleteLinkById } from './links';
import {
  nowIso,
  parseGoogleDate,
  toGoogleEventPayloadFromItem,
  toGoogleTaskPayloadFromItem,
  getItemSyncMeta,
  mergeItemSyncMeta,
  getGoogleRequestStatus,
  isGoogleRateLimitError,
  MAX_PUSH_ITEMS_PER_CYCLE,
} from './utils';
import type { Item } from '../types';

/**
 * Push unsynced Items that are scheduled as Google Events or Tasks.
 */
export async function pushLocalItems(
  userId: string,
  links: LinkRecord[]
): Promise<{ pushed: number; errors: string[] }> {
  const state = useAppStore.getState();
  const errors: string[] = [];
  let pushed = 0;

  const unsyncedItems = state.items
    .filter((item) => item.user_id === userId && item.type !== 'event' && item.is_unsynced)
    .slice(0, MAX_PUSH_ITEMS_PER_CYCLE);

  for (const item of unsyncedItems) {
    const itemLinks = links.filter(
      (l) =>
        l.local_type === 'item' &&
        l.local_id === item.id &&
        (l.resource_type === 'event' || l.resource_type === 'task')
    );
    const meta = getItemSyncMeta(item);
    const target = meta.google_sync_target || itemLinks[0]?.resource_type || null;
    const shouldUnschedule = !!item.deleted_at || !item.scheduled_at || !target;

    try {
      if (shouldUnschedule) {
        await unscheduleItem(userId, item, itemLinks);
        pushed++;
        continue;
      }

      // Remove stale links pointing to wrong resource type
      const staleLinks = itemLinks.filter((l) => l.resource_type !== target);
      for (const stale of staleLinks) {
        try {
          if (stale.resource_type === 'event' && stale.google_id) {
            await GoogleClient.deleteEvent(stale.calendar_id || 'primary', stale.google_id);
          } else if (stale.resource_type === 'task' && stale.google_id) {
            await GoogleClient.deleteTask(stale.task_list_id || '@default', stale.google_id);
          }
        } catch (deleteError) {
          if (isNoGoogleAccessTokenError(deleteError)) throw deleteError;
          const status = getGoogleRequestStatus(deleteError);
          if (status !== 404 && status !== 410) throw deleteError;
        }
        await deleteLinkById(stale.id);
      }

      const link = itemLinks.find((l) => l.resource_type === target) || null;

      if (target === 'event') {
        await pushItemAsEvent(userId, item, meta, link, links);
      } else if (target === 'task') {
        await pushItemAsTask(userId, item, meta, link);
      }

      pushed++;
    } catch (error) {
      if (isNoGoogleAccessTokenError(error)) throw error;
      if (isGoogleRateLimitError(error)) throw error;
      const message = error instanceof Error ? error.message : 'Item push failed';
      console.warn('[Sync/PushItems] Failed:', message);
      errors.push(`Item "${item.title}": ${message}`);
    }
  }

  return { pushed, errors };
}

async function unscheduleItem(
  _userId: string,
  item: Item,
  itemLinks: LinkRecord[]
) {
  for (const link of itemLinks) {
    try {
      if (link.resource_type === 'event' && link.google_id) {
        await GoogleClient.deleteEvent(link.calendar_id || 'primary', link.google_id);
      } else if (link.resource_type === 'task' && link.google_id) {
        await GoogleClient.deleteTask(link.task_list_id || '@default', link.google_id);
      }
    } catch (deleteError) {
      if (isNoGoogleAccessTokenError(deleteError)) throw deleteError;
      const status = getGoogleRequestStatus(deleteError);
      if (status !== 404 && status !== 410) throw deleteError;
    }
    await deleteLinkById(link.id);
  }

  await patchLocalItem(item.id, {
    is_unsynced: false,
    updated_at: nowIso(),
    content: mergeItemSyncMeta(item, {
      google_sync_target: null,
      google_sync_calendar_id: null,
      google_sync_task_list_id: null,
    }),
  });
}

async function pushItemAsEvent(
  userId: string,
  item: Item,
  meta: import('../types').ItemGoogleSyncMeta,
  link: LinkRecord | null,
  _links: LinkRecord[]
) {
  const calendarId = meta.google_sync_calendar_id || link?.calendar_id || 'primary';
  const payload = toGoogleEventPayloadFromItem(item);
  let remote: GoogleEvent;

  if (link?.google_id) {
    try {
      remote = await GoogleClient.patchEvent(calendarId, link.google_id, payload);
    } catch (updateError) {
      if (isNoGoogleAccessTokenError(updateError)) throw updateError;
      const status = getGoogleRequestStatus(updateError);
      if (status === 404 || status === 410) {
        remote = await GoogleClient.createEvent(calendarId, payload);
      } else if (status === 400) {
        remote = await GoogleClient.patchEvent(
          calendarId,
          link.google_id,
          toGoogleEventPayloadFromItem(item, { minimal: true })
        );
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
        remote = await GoogleClient.createEvent(calendarId, toGoogleEventPayloadFromItem(item, { minimal: true }));
      } else {
        throw createError;
      }
    }
  }

  await upsertLink({
    user_id: userId,
    local_id: item.id,
    local_type: 'item',
    google_id: remote.id,
    resource_type: 'event',
    calendar_id: calendarId,
    remote_etag: remote.etag || null,
    remote_updated_at: remote.updated || null,
    direction: 'push',
  });

  // Clean stale links
  await supabase
    .from('google_resource_links')
    .delete()
    .eq('local_id', item.id)
    .eq('local_type', 'item')
    .eq('resource_type', 'event')
    .neq('google_id', remote.id);

  await patchLocalItem(item.id, {
    is_unsynced: false,
    updated_at: remote.updated || nowIso(),
    scheduled_at: parseGoogleDate(remote.start?.dateTime || remote.start?.date) || item.scheduled_at,
    content: mergeItemSyncMeta(item, {
      google_sync_target: 'event',
      google_sync_calendar_id: calendarId,
      google_sync_task_list_id: null,
    }),
  });
}

async function pushItemAsTask(
  userId: string,
  item: Item,
  meta: import('../types').ItemGoogleSyncMeta,
  link: LinkRecord | null
) {
  const taskListId = meta.google_sync_task_list_id || link?.task_list_id || '@default';
  const payload = toGoogleTaskPayloadFromItem(item);
  let remote: GoogleTask;

  if (link?.google_id) {
    try {
      remote = await GoogleClient.patchTask(taskListId, link.google_id, payload);
    } catch (updateError) {
      if (isNoGoogleAccessTokenError(updateError)) throw updateError;
      const status = getGoogleRequestStatus(updateError);
      if (status === 404 || status === 410) {
        remote = await GoogleClient.createTask(taskListId, payload);
      } else if (status === 400) {
        remote = await GoogleClient.patchTask(taskListId, link.google_id, {
          title: item.title || '(No title)',
          status: item.is_completed ? 'completed' : 'needsAction',
          due: item.scheduled_at || undefined,
        });
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
          title: item.title || '(No title)',
          status: item.is_completed ? 'completed' : 'needsAction',
          due: item.scheduled_at || undefined,
        });
      } else {
        throw createError;
      }
    }
  }

  await upsertLink({
    user_id: userId,
    local_id: item.id,
    local_type: 'item',
    google_id: remote.id,
    resource_type: 'task',
    task_list_id: taskListId,
    remote_etag: remote.etag || null,
    remote_updated_at: remote.updated || null,
    direction: 'push',
  });

  // Clean stale links
  await supabase
    .from('google_resource_links')
    .delete()
    .eq('local_id', item.id)
    .eq('local_type', 'item')
    .eq('resource_type', 'task')
    .neq('google_id', remote.id);

  await patchLocalItem(item.id, {
    is_unsynced: false,
    updated_at: remote.updated || nowIso(),
    is_completed: remote.status === 'completed',
    scheduled_at: parseGoogleDate(remote.due) || item.scheduled_at,
    content: mergeItemSyncMeta(item, {
      google_sync_target: 'task',
      google_sync_task_list_id: taskListId,
      google_sync_calendar_id: null,
    }),
  });
}

async function patchLocalItem(itemId: string, updates: Partial<Item>) {
  const existing = useAppStore.getState().items.find((i) => i.id === itemId);
  if (!existing) return;
  const merged = { ...existing, ...updates };
  useAppStore.setState((s) => ({
    items: s.items.map((i) => (i.id === itemId ? merged : i)),
  }));
  await useAppStore.getState().syncItemToDb(merged);
}

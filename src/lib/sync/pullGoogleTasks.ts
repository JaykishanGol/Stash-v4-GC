/**
 * Sync Module — Pull Google Tasks into local events table (is_google_task=true)
 */

import { useAppStore } from '../../store/useAppStore';
import {
  GoogleClient,
  isNoGoogleAccessTokenError,
  type GoogleTask,
  type GoogleTaskList,
} from '../googleClient';
import { generateId } from '../utils';
import { persistentSyncQueue } from '../persistentQueue';
import type { CalendarEvent, List } from '../types';
import type { LinkRecord } from './types';
import { upsertLink, findTaskLink, deleteLinkById } from './links';
import {
  nowIso,
  parseGoogleDate,
  isRemoteStrictlyNewer,
  isLocalStrictlyNewer,
  getRemoteTaskUpdatedAt,
  getCursor,
  upsertCursor,
  mergeItemSyncMeta,
} from './utils';

/**
 * Pull tasks from all Google Task Lists into CalendarEvent rows.
 */
export async function pullRemoteGoogleTasks(
  userId: string,
  links: LinkRecord[],
  forceFullPull: boolean
): Promise<{ pulled: number; errors: string[] }> {
  const errors: string[] = [];
  let pulled = 0;

  const taskLists = await GoogleClient.listAllTaskLists();
  console.log(`[Sync/PullGoogleTasks] ${taskLists.length} task list(s)`);

  for (const taskList of taskLists) {
    // Ensure local list exists for this Google Task List
    await ensureLocalListForGoogleTaskList(userId, taskList, links);

    const cursor = forceFullPull ? null : await getCursor(userId, 'task', taskList.id);
    const taskLinksForList = links.filter(
      (l) =>
        l.resource_type === 'task' &&
        (l.task_list_id || '@default') === taskList.id
    );
    const currentStore = useAppStore.getState();
    const localHasEventsForList = currentStore.calendarEvents.some(
      (e) => e.is_google_task && e.google_task_list_id === taskList.id && !e.deleted_at
    );
    const shouldDoFullPull = forceFullPull || (!taskLinksForList.length && !localHasEventsForList);
    const updatedMin = shouldDoFullPull ? undefined : cursor?.last_pulled_at || undefined;

    let remoteTasks: GoogleTask[];
    try {
      remoteTasks = await GoogleClient.listAllTasks(taskList.id, updatedMin);
    } catch (error) {
      if (isNoGoogleAccessTokenError(error)) throw error;
      const message = error instanceof Error ? error.message : 'Task pull failed';
      console.warn('[Sync/PullGoogleTasks] Failed:', message);
      errors.push(`List "${taskList.title}": ${message}`);
      continue;
    }

    console.log(`[Sync/PullGoogleTasks] List "${taskList.title}" -> ${remoteTasks.length} task(s)`);

    // Sort: non-subtasks first
    const sorted = [...remoteTasks].sort((a, b) => {
      if (!!a.parent === !!b.parent) return 0;
      return a.parent ? 1 : -1;
    });

    for (const remote of sorted) {
      const storeNow = useAppStore.getState();
      const remoteUpdatedAt = getRemoteTaskUpdatedAt(remote);
      const existingLink = findTaskLink(taskLinksForList, taskList.id, remote.id);

      // Check if linked to an Item
      const linkedItem =
        existingLink?.local_type === 'item'
          ? storeNow.items.find((i) => i.id === existingLink.local_id)
          : undefined;

      // Find existing CalendarEvent
      const existing =
        (existingLink && (existingLink.local_type === 'calendar_event' || existingLink.local_type === 'event')
          ? storeNow.calendarEvents.find((e) => e.id === existingLink.local_id)
          : undefined) ||
        storeNow.calendarEvents.find(
          (e) => e.google_task_id === remote.id && !!remote.id
        );

      // Handle linked items
      if (linkedItem) {
        if (linkedItem.deleted_at) continue;
        const localIsNewer = isLocalStrictlyNewer(linkedItem.updated_at, remoteUpdatedAt);

        if (remote.deleted) {
          if (!localIsNewer) {
            await patchLocalItem(linkedItem.id, {
              scheduled_at: null,
              updated_at: remoteUpdatedAt,
              is_unsynced: false,
              content: mergeItemSyncMeta(linkedItem, {
                google_sync_target: null,
                google_sync_task_list_id: null,
                google_sync_calendar_id: null,
              }),
            });
            if (existingLink) await deleteLinkById(existingLink.id);
          } else if (!linkedItem.is_unsynced) {
            await patchLocalItem(linkedItem.id, { is_unsynced: true });
          }
          continue;
        }

        if (isRemoteStrictlyNewer(linkedItem.updated_at, remoteUpdatedAt)) {
          await patchLocalItem(linkedItem.id, {
            title: remote.title || linkedItem.title,
            scheduled_at: parseGoogleDate(remote.due) || null,
            is_completed: remote.status === 'completed',
            updated_at: remoteUpdatedAt,
            is_unsynced: false,
            content: mergeItemSyncMeta(linkedItem, {
              google_sync_target: 'task',
              google_sync_task_list_id: taskList.id,
              google_sync_calendar_id: null,
            }),
          });
        } else if (localIsNewer && !linkedItem.is_unsynced) {
          await patchLocalItem(linkedItem.id, { is_unsynced: true });
        } else if (!localIsNewer && linkedItem.is_unsynced) {
          await patchLocalItem(linkedItem.id, { is_unsynced: false, updated_at: remoteUpdatedAt });
        }
        continue;
      }

      // Handle deleted tasks
      if (remote.deleted) {
        if (existing) {
          const localIsNewer = isLocalStrictlyNewer(existing.updated_at, remoteUpdatedAt);
          if (!localIsNewer) {
            await patchLocalEvent(existing.id, {
              deleted_at: nowIso(),
              google_etag: remote.etag || null,
              remote_updated_at: remoteUpdatedAt,
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

      // Update existing or create new
      if (existing) {
        if (existing.deleted_at) continue; // Anti-resurrection

        if (isRemoteStrictlyNewer(existing.updated_at, remoteUpdatedAt)) {
          const dueDate = parseGoogleDate(remote.due);
          const startAt = dueDate || existing.start_at;
          const endAt = dueDate
            ? new Date(new Date(dueDate).getTime() + 30 * 60 * 1000).toISOString()
            : existing.end_at;

          await patchLocalEvent(existing.id, {
            title: remote.title || existing.title,
            description: remote.notes || '',
            start_at: startAt,
            end_at: endAt,
            is_all_day: !!dueDate,
            is_google_task: true,
            google_task_id: remote.id,
            google_task_list_id: taskList.id,
            is_completed: remote.status === 'completed',
            completed_at: remote.status === 'completed' ? (remote.completed || remoteUpdatedAt) : null,
            sort_position: remote.position || null,
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
        // DEDUP GUARD: check store one more time
        const freshStore = useAppStore.getState();
        const alreadyExists = freshStore.calendarEvents.find(
          (e) => e.google_task_id === remote.id && !e.deleted_at
        );
        if (alreadyExists) {
          await upsertLink({
            user_id: userId,
            local_id: alreadyExists.id,
            local_type: 'calendar_event',
            google_id: remote.id,
            resource_type: 'task',
            task_list_id: taskList.id,
            remote_etag: remote.etag || null,
            remote_updated_at: remoteUpdatedAt,
            direction: 'pull',
          });
          continue;
        }

        // Create new CalendarEvent for this Google Task
        const dueDate = parseGoogleDate(remote.due);
        const startAt = dueDate || nowIso();
        const endAt = dueDate
          ? new Date(new Date(dueDate).getTime() + 30 * 60 * 1000).toISOString()
          : new Date(new Date(startAt).getTime() + 30 * 60 * 1000).toISOString();

        const eventId = generateId();
        const newEvent: CalendarEvent = {
          id: eventId,
          user_id: userId,
          title: remote.title || '(No title)',
          description: remote.notes || '',
          start_at: startAt,
          end_at: endAt,
          is_all_day: !!dueDate,
          rrule: null,
          parent_event_id: null,
          recurring_event_id: null,
          is_deleted_instance: false,
          location: '',
          color_id: '7',
          visibility: 'default',
          transparency: 'transparent',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          attendees: [],
          conference_data: null,
          reminders: [],
          attachments: [],
          google_event_id: null,
          google_calendar_id: 'tasks',
          google_etag: remote.etag || null,
          remote_updated_at: remoteUpdatedAt,
          is_google_task: true,
          google_task_id: remote.id,
          google_task_list_id: taskList.id,
          is_completed: remote.status === 'completed',
          completed_at: remote.status === 'completed' ? (remote.completed || remoteUpdatedAt) : null,
          sort_position: remote.position || null,
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
          resource_type: 'task',
          task_list_id: taskList.id,
          remote_etag: remote.etag || null,
          remote_updated_at: remoteUpdatedAt,
          direction: 'pull',
        });
      }

      pulled++;
    }

    await upsertCursor(userId, 'task', taskList.id, {
      sync_token: null,
      last_pulled_at: nowIso(),
    });
  }

  return { pulled, errors };
}

/**
 * Ensure a local List exists for a Google Task List. Creates one if needed.
 */
async function ensureLocalListForGoogleTaskList(
  userId: string,
  taskList: GoogleTaskList,
  links: LinkRecord[]
): Promise<string> {
  const store = useAppStore.getState();
  const linked = links.find(
    (l) => l.resource_type === 'task' && l.local_type === 'list' && l.google_id === taskList.id
  );

  if (linked) {
    const existing = store.lists.find((l) => l.id === linked.local_id);
    if (existing) {
      // Update name if changed
      if (existing.name !== taskList.title) {
        const updated = { ...existing, name: taskList.title };
        useAppStore.setState((s) => ({
          lists: s.lists.map((l) => (l.id === existing.id ? updated : l)),
        }));
        persistentSyncQueue.add('upsert-list', updated.id, updated);
      }
      return existing.id;
    }

    // Link exists but list was deleted — restore
    const restored: List = {
      id: linked.local_id,
      user_id: userId,
      name: taskList.title,
      color: '#10B981',
      order: store.lists.length,
      items: [],
      created_at: nowIso(),
    };
    useAppStore.setState((s) => ({ lists: [...s.lists, restored] }));
    persistentSyncQueue.add('upsert-list', restored.id, restored);
    return restored.id;
  }

  // DEDUP: Check if a list with the same name already exists
  const existingByName = store.lists.find(
    (l) => l.name === taskList.title && l.user_id === userId
  );
  if (existingByName) {
    await upsertLink({
      user_id: userId,
      local_id: existingByName.id,
      local_type: 'list',
      google_id: taskList.id,
      resource_type: 'task',
      task_list_id: taskList.id,
      remote_etag: taskList.etag || null,
      remote_updated_at: taskList.updated || null,
      direction: 'pull',
    });
    return existingByName.id;
  }

  // Create new local list
  const localList: List = {
    id: generateId(),
    user_id: userId,
    name: taskList.title,
    color: '#10B981',
    order: store.lists.length,
    items: [],
    created_at: nowIso(),
  };

  useAppStore.setState((s) => ({ lists: [...s.lists, localList] }));
  persistentSyncQueue.add('upsert-list', localList.id, localList);

  await upsertLink({
    user_id: userId,
    local_id: localList.id,
    local_type: 'list',
    google_id: taskList.id,
    resource_type: 'task',
    task_list_id: taskList.id,
    remote_etag: taskList.etag || null,
    remote_updated_at: taskList.updated || null,
    direction: 'pull',
  });

  return localList.id;
}

async function createLocalEvent(event: CalendarEvent) {
  const storeEvents = useAppStore.getState().calendarEvents;

  // Dedup: check google_task_id
  if (event.google_task_id) {
    const dup = storeEvents.find((e) => e.google_task_id === event.google_task_id);
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

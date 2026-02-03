/**
 * Google Pull Service - Two-Way Sync (Google Wins)
 * Fetches events/tasks from Google and creates/updates local items.
 */

import { GoogleClient, type GoogleEvent, type GoogleTask } from './googleClient';
import { supabase } from './supabase';
import type { Item, Task } from './types';
import { useAppStore } from '../store/useAppStore';

interface GoogleResourceLink {
    id: string;
    user_id: string;
    local_id: string;
    google_id: string;
    resource_type: 'event' | 'task';
    calendar_id?: string;
    task_list_id?: string;
    etag?: string;
}

export class GooglePullService {

    /**
     * Get all resource links for the current user
     */
    private static async getLinks(resourceType?: 'event' | 'task'): Promise<GoogleResourceLink[]> {
        let query = supabase.from('google_resource_links').select('*');

        if (resourceType) {
            query = query.eq('resource_type', resourceType);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[GooglePull] Error fetching links:', error);
            return [];
        }

        return data || [];
    }

    /**
     * Pull calendar events from Google and sync to local store
     * @param calendarId - Calendar to pull from (default: primary)
     * @param since - Only fetch events updated after this date
     */
    static async pullEvents(calendarId: string = 'primary', since?: string): Promise<number> {
        console.log('[GooglePull] Pulling events from Google...');

        try {
            const events = await GoogleClient.listEvents(calendarId, {
                timeMin: since || new Date().toISOString(),
                maxResults: 100
            });

            const links = await this.getLinks('event');
            let syncedCount = 0;

            for (const event of events) {
                if (!event.id) continue;

                const existingLink = links.find(l => l.google_id === event.id);

                if (existingLink) {
                    // Check if Google version is newer (using etag or updated date)
                    // Google wins - update local
                    await this.updateLocalFromGoogleEvent(existingLink.local_id, event);
                    syncedCount++;
                } else {
                    // New event from Google - create local item
                    await this.createLocalFromGoogleEvent(event, calendarId);
                    syncedCount++;
                }
            }

            console.log(`[GooglePull] Synced ${syncedCount} events`);
            return syncedCount;
        } catch (error) {
            console.error('[GooglePull] Failed to pull events:', error);
            return 0;
        }
    }

    /**
     * Pull tasks from Google Tasks and sync to local store
     */
    static async pullTasks(taskListId: string = '@default'): Promise<number> {
        console.log('[GooglePull] Pulling tasks from Google...');

        try {
            const tasks = await GoogleClient.listAllTasks(taskListId);
            const links = await this.getLinks('task');
            let syncedCount = 0;

            for (const task of tasks) {
                if (!task.id) continue;

                const existingLink = links.find(l => l.google_id === task.id);

                if (existingLink) {
                    // Google wins - update local
                    await this.updateLocalFromGoogleTask(existingLink.local_id, task);
                    syncedCount++;
                } else {
                    // New task from Google - create local task
                    await this.createLocalFromGoogleTask(task, taskListId);
                    syncedCount++;
                }
            }

            console.log(`[GooglePull] Synced ${syncedCount} tasks`);
            return syncedCount;
        } catch (error) {
            console.error('[GooglePull] Failed to pull tasks:', error);
            return 0;
        }
    }

    /**
     * Update local item from Google Event (Google Wins)
     */
    private static async updateLocalFromGoogleEvent(localId: string, event: GoogleEvent) {
        const store = useAppStore.getState();
        const item = store.items.find(i => i.id === localId);

        if (!item) return;

        const updates: Partial<Item> = {
            title: event.summary || item.title,
        };

        // Parse start time
        if (event.start?.dateTime) {
            updates.next_trigger_at = event.start.dateTime;
        } else if (event.start?.date) {
            updates.next_trigger_at = new Date(event.start.date).toISOString();
        }

        // Update content
        if (event.description || event.location) {
            updates.content = {
                ...item.content,
                text: event.description ?? (item.content as any).text ?? '',
                location: event.location ?? (item.content as any).location ?? ''
            };
        }

        store.updateItem(localId, updates);
    }

    /**
     * Create new local item from Google Event
     */
    private static async createLocalFromGoogleEvent(event: GoogleEvent, calendarId: string) {
        const store = useAppStore.getState();
        const user = store.user;
        if (!user) return;

        // Use store.addItem instead of directly creating Item to avoid type issues
        // The store will handle ID generation and default values
        const newItemId = crypto.randomUUID();
        const now = new Date().toISOString();

        await store.addItem({
            id: newItemId,
            user_id: user.id,
            type: 'note',
            title: event.summary || 'Untitled Event',
            content: {
                text: event.description || ''
            },
            file_meta: null,
            priority: 'none',
            tags: [],
            due_at: null,
            bg_color: '',
            remind_at: null,
            reminder_recurring: null,
            next_trigger_at: event.start?.dateTime || event.start?.date || null,
            reminder_type: 'one_time',
            folder_id: null,
            is_pinned: false,
            is_archived: false,
            is_completed: false,
            created_at: now,
            updated_at: now,
            deleted_at: null,
            one_time_at: null,
            recurring_config: null,
            last_acknowledged_at: null
        } as Item);

        // Create resource link
        await supabase.from('google_resource_links').insert({
            user_id: user.id,
            local_id: newItemId,
            google_id: event.id,
            resource_type: 'event',
            calendar_id: calendarId,
            etag: event.etag
        });
    }

    /**
     * Update local task from Google Task (Google Wins)
     */
    private static async updateLocalFromGoogleTask(localId: string, task: GoogleTask) {
        const store = useAppStore.getState();
        const localTask = store.tasks.find(t => t.id === localId);

        if (!localTask) return;

        const updates: Partial<Task> = {
            title: task.title || localTask.title,
            description: task.notes || localTask.description,
            is_completed: task.status === 'completed',
        };

        if (task.due) {
            updates.due_at = task.due;
        }

        store.updateTask(localId, updates);
    }

    /**
     * Create new local task from Google Task
     */
    private static async createLocalFromGoogleTask(task: GoogleTask, taskListId: string) {
        const store = useAppStore.getState();
        const user = store.user;
        if (!user) return;

        store.addTask({
            user_id: user.id,
            list_id: null,
            title: task.title || 'Untitled Task',
            description: task.notes || null,
            is_completed: task.status === 'completed',
            due_at: task.due || null,
            priority: 'none',
            item_ids: [],
            item_completion: {},
            color: '',
            remind_at: null,
            reminder_recurring: null,
            reminder_type: 'none',
            one_time_at: null,
            recurring_config: null,
            next_trigger_at: null,
            last_acknowledged_at: null
        });

        // Get the newly created task to get its ID
        const newTask = store.tasks[0]; // Most recent
        if (newTask) {
            await supabase.from('google_resource_links').insert({
                user_id: user.id,
                local_id: newTask.id,
                google_id: task.id,
                resource_type: 'task',
                task_list_id: taskListId,
                etag: task.etag
            });
        }
    }

    /**
     * Full sync - pull both events and tasks
     */
    static async fullSync(): Promise<{ events: number; tasks: number }> {
        const events = await this.pullEvents();
        const tasks = await this.pullTasks();

        return { events, tasks };
    }
}

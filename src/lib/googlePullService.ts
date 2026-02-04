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
     * Uses Incremental Sync (SyncToken) to be efficient and detect deletions
     */
    static async pullEvents(calendarId: string = 'primary'): Promise<number> {
        console.log('[GooglePull] Pulling events from Google...');
        const userId = useAppStore.getState().user?.id;
        if (!userId) return 0;

        // 1. Get stored Sync Token
        const { data: settings } = await supabase
            .from('user_settings')
            .select('google_calendar_sync_token')
            .eq('user_id', userId)
            .single();

        const syncToken = settings?.google_calendar_sync_token;
        let response;

        try {
            // 2. Fetch from Google
            response = await GoogleClient.listEvents(calendarId, {
                syncToken: syncToken || undefined,
                timeMin: !syncToken ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() : undefined // Default to 30 days back if fresh
            });
        } catch (error: any) {
            // Handle "410 Gone" - Token Invalid (Full Sync Required)
            if (error.message.includes('410') || error.message.includes('Gone')) {
                console.warn('[GooglePull] Sync token invalid. Performing full sync.');
                await supabase.from('user_settings').update({ google_calendar_sync_token: null }).eq('user_id', userId);
                return this.pullEvents(calendarId); // Recursive retry without token
            }
            console.error('[GooglePull] Failed to list events:', error);
            return 0;
        }

        const { items: events, nextSyncToken } = response;
        const links = await this.getLinks('event');
        let syncedCount = 0;

        // 3. Process Items
        for (const event of events) {
            if (!event.id) continue;
            const existingLink = links.find(l => l.google_id === event.id);

            // HANDLE DELETION
            if (event.status === 'cancelled') {
                if (existingLink) {
                    console.log(`[GooglePull] Event cancelled remotely: ${event.summary}`);
                    
                    // We'll Soft Delete the local item
                    await supabase.from('items').update({ deleted_at: new Date().toISOString() }).eq('id', existingLink.local_id);
                    await supabase.from('google_resource_links').delete().eq('id', existingLink.id);
                }
                continue;
            }

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

        // 4. Save new Sync Token
        if (nextSyncToken) {
            await supabase
                .from('user_settings')
                .update({ google_calendar_sync_token: nextSyncToken })
                .eq('user_id', userId);
        }

        console.log(`[GooglePull] Synced ${syncedCount} events`);
        return syncedCount;
    }

    /**
     * Pull tasks from Google Tasks and sync to local store
     * Uses 'updatedMin' for incremental sync
     */
    static async pullTasks(taskListId: string = '@default'): Promise<number> {
        console.log('[GooglePull] Pulling tasks from Google...');
        const userId = useAppStore.getState().user?.id;
        if (!userId) return 0;

        // 1. Get Last Sync Time (from user_settings or calculated)
        // We'll store a dedicated 'tasks_last_sync' in the sync_token field (repurposed string)
        const { data: settings } = await supabase
            .from('user_settings')
            .select('google_tasks_sync_token')
            .eq('user_id', userId)
            .single();
        
        const lastSync = settings?.google_tasks_sync_token; // ISO String stored here
        
        try {
            const tasks = await GoogleClient.listAllTasks(taskListId, lastSync || undefined);
            const links = await this.getLinks('task');
            let syncedCount = 0;
            const now = new Date().toISOString();

            for (const task of tasks) {
                if (!task.id) continue;
                const existingLink = links.find(l => l.google_id === task.id);

                // HANDLE DELETION (Google Tasks marks deleted/hidden)
                // Note: 'deleted' field might be present if we pass showDeleted=true
                if ((task as any).deleted === true || (task as any).hidden === true) {
                    if (existingLink) {
                         console.log(`[GooglePull] Task deleted remotely: ${task.title}`);
                         await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', existingLink.local_id);
                         await supabase.from('google_resource_links').delete().eq('id', existingLink.id);
                    }
                    continue;
                }

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

            // Save new Sync Time
            await supabase
                .from('user_settings')
                .update({ google_tasks_sync_token: now })
                .eq('user_id', userId);

            console.log(`[GooglePull] Synced ${syncedCount} tasks`);
            return syncedCount;
        } catch (error) {
            console.error('[GooglePull] Failed to pull tasks:', error);
            return 0;
        }
    }

    /**
     * Update local item from Google Event (Google Wins - UNLESS local has pending changes)
     */
    private static async updateLocalFromGoogleEvent(localId: string, event: GoogleEvent) {
        const store = useAppStore.getState();
        const item = store.items.find(i => i.id === localId);

        if (!item) return;

        // PROTECTION: Do not overwrite if we have local unsynced changes
        if (item.is_unsynced) {
            console.warn(`[GooglePull] Skipping update for ${localId} (Local changes pending)`);
            return;
        }

        const updates: Partial<Item> = {
            title: event.summary || item.title,
        };

        // Parse start time - use scheduled_at
        if (event.start?.dateTime) {
            updates.scheduled_at = event.start.dateTime;
        } else if (event.start?.date) {
            updates.scheduled_at = new Date(event.start.date).toISOString();
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
            scheduled_at: event.start?.dateTime || event.start?.date || null,
            remind_before: null,
            recurring_config: null,
            bg_color: '',
            folder_id: null,
            is_pinned: false,
            is_archived: false,
            is_completed: false,
            created_at: now,
            updated_at: now,
            deleted_at: null
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
     * Update local task from Google Task (Google Wins - UNLESS local has pending changes)
     */
    private static async updateLocalFromGoogleTask(localId: string, task: GoogleTask) {
        const store = useAppStore.getState();
        const localTask = store.tasks.find(t => t.id === localId);

        if (!localTask) return;

        // PROTECTION: Do not overwrite if we have local unsynced changes
        // Assuming tasks also have is_unsynced property (or we check sync queue)
        // Since Task interface doesn't explicitly have is_unsynced in some versions, we cast or check safely.
        if ((localTask as any).is_unsynced) {
            console.warn(`[GooglePull] Skipping task update for ${localId} (Local changes pending)`);
            return;
        }

        const updates: Partial<Task> = {
            title: task.title || localTask.title,
            description: task.notes || localTask.description,
            is_completed: task.status === 'completed',
        };

        if (task.due) {
            updates.scheduled_at = task.due;
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
            scheduled_at: task.due || null,
            remind_before: null,
            recurring_config: null,
            priority: 'none',
            item_ids: [],
            item_completion: {},
            color: ''
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

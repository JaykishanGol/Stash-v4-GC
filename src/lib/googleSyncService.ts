import { supabase } from './supabase';
import { GoogleClient } from './googleClient';
import { calculateNextOccurrence } from './schedulerEngine';
import type { Item, Task } from './types';

interface TaskSyncOptions {
    listId?: string;
    dueDate?: string;
    notes?: string;
    subtasks?: string[]; // New: List of subtask titles
}

interface EventSyncOptions {
    calendarId?: string;
    start: string;
    end: string;
    isAllDay?: boolean;
    description?: string;
    location?: string;
    colorId?: string;
    // New Fields
    attendees?: string[]; // List of emails
    addMeet?: boolean; // Generate Google Meet
    visibility?: 'default' | 'public' | 'private';
    transparency?: 'opaque' | 'transparent';
    timezone?: string;
    reminders?: { method: 'popup' | 'email'; minutes: number }[];
}

export class GoogleSyncService {

    /**
     * Pushes a local Item/Task to Google Tasks
     */
    static async syncToGoogleTask(localItem: Item | Task, options: TaskSyncOptions) {
        if (!localItem.user_id) return;

        const listId = options.listId || '@default';
        const notes = options.notes || GoogleSyncService.generateSyncNotes(localItem);
        const title = GoogleSyncService.generateSyncTitle(localItem);

        const localType = (localItem as any).type ? 'item' : 'task'; // Differentiate Item vs Task

        const link = await GoogleSyncService.getLink(localItem.id, 'task');

        const taskData: any = {
            title: title,
            notes: notes,
        };

        if (options.dueDate) {
            taskData.due = options.dueDate;
        }

        try {
            let parentTaskId = '';

            if (link) {
                if (link.task_list_id && link.task_list_id !== listId) {
                    await GoogleClient.deleteTask(link.task_list_id, link.google_id);
                    await GoogleSyncService.deleteLink(link.id);
                    // Create new below
                } else {
                    console.log(`[Sync] Updating Google Task ${link.google_id}`);
                    await GoogleClient.updateTask(listId, link.google_id, taskData);
                    await GoogleSyncService.updateLinkTimestamp(link.id);
                    parentTaskId = link.google_id;
                }
            }

            if (!parentTaskId) {
                console.log(`[Sync] Creating new Google Task for ${localItem.title}`);
                const gTask = await GoogleClient.createTask(listId, taskData);
                console.log('[Sync] Google Task Created:', gTask);
                await GoogleSyncService.createLink(localItem.id, localItem.user_id, localType, gTask.id, 'task', { task_list_id: listId });
                parentTaskId = gTask.id;
            }

            // Handle Subtasks (Naive Implementation: Just create them, don't sync updates yet)
            if (options.subtasks && options.subtasks.length > 0) {
                // We don't track subtask IDs in DB yet, so we just fire and forget for this version
                // Ideally, we'd have a 'subtask_links' table.
                for (const subTitle of options.subtasks) {
                    if (!subTitle.trim()) continue;
                    await GoogleClient.createTask(listId, {
                        title: subTitle,
                        parent: parentTaskId
                    });
                }
            }

        } catch (e) {
            console.error('[Sync] Failed to sync task:', e);
        }
    }

    /**
     * Pushes a local Item/Task to Google Calendar
     */
    static async syncToGoogleEvent(localItem: Item | Task, options: EventSyncOptions) {
        if (!localItem.user_id) return;

        const calendarId = options.calendarId || 'primary';
        const description = options.description || GoogleSyncService.generateSyncNotes(localItem);
        const title = GoogleSyncService.generateSyncTitle(localItem);
        const localType = (localItem as any).type ? 'item' : 'task';

        const eventData: any = {
            summary: title,
            description: description,
            location: options.location,
            colorId: options.colorId,
            visibility: options.visibility,
            transparency: options.transparency
        };

        // Time with optional timezone
        const tz = options.timezone;
        if (options.isAllDay) {
            eventData.start = { date: options.start.split('T')[0] };
            eventData.end = { date: options.end.split('T')[0] };
        } else {
            eventData.start = { dateTime: options.start, timeZone: tz };
            eventData.end = { dateTime: options.end, timeZone: tz };
        }

        // Attendees
        if (options.attendees && options.attendees.length > 0) {
            eventData.attendees = options.attendees.map(email => ({ email }));
        }

        // Google Meet
        if (options.addMeet) {
            eventData.conferenceData = {
                createRequest: {
                    requestId: crypto.randomUUID(), // Unique ID for this request
                    conferenceSolutionKey: { type: 'hangoutsMeet' }
                }
            };
        }

        // Reminders
        if (options.reminders && options.reminders.length > 0) {
            eventData.reminders = {
                useDefault: false,
                overrides: options.reminders.map(r => ({ method: r.method, minutes: r.minutes }))
            };
        }

        const link = await GoogleSyncService.getLink(localItem.id, 'event');

        try {
            if (link) {
                if (link.calendar_id && link.calendar_id !== calendarId) {
                    await GoogleClient.deleteEvent(link.calendar_id, link.google_id);
                    await GoogleSyncService.deleteLink(link.id);
                } else {
                    console.log(`[Sync] Updating Google Event ${link.google_id}`);
                    await GoogleClient.updateEvent(calendarId, link.google_id, eventData);
                    await GoogleSyncService.updateLinkTimestamp(link.id);
                    return;
                }
            }

            console.log(`[Sync] Creating new Google Event for ${localItem.title}`);
            const gEvent = await GoogleClient.createEvent(calendarId, eventData);
            await GoogleSyncService.createLink(localItem.id, localItem.user_id, localType, gEvent.id, 'event', { calendar_id: calendarId });

        } catch (e) {
            console.error('[Sync] Failed to sync event:', e);
        }
    }

    /**
     * Removes from Google
     */
    static async removeFromGoogle(localId: string, type: 'task' | 'event') {
        const link = await GoogleSyncService.getLink(localId, type);
        if (!link) return;

        try {
            if (type === 'task') {
                await GoogleClient.deleteTask(link.task_list_id || '@default', link.google_id);
            } else {
                await GoogleClient.deleteEvent(link.calendar_id || 'primary', link.google_id);
            }
        } catch (e) {
            console.warn('[Sync] Delete failed:', e);
        }

        await GoogleSyncService.deleteLink(link.id);
    }

    /**
     * Smart Completion Handler
     */
    static async handleCompletion(item: Item | Task) {
        const link = await GoogleSyncService.getLink(item.id, 'task');
        if (link) {
            try {
                await GoogleClient.updateTask(link.task_list_id || '@default', link.google_id, {
                    status: 'completed',
                    completed: new Date().toISOString()
                });

                if (item.recurring_config) {
                    await GoogleSyncService.deleteLink(link.id);
                }
            } catch (e) {
                console.error('[Sync] Failed to complete remote task:', e);
            }
        }

        if (item.recurring_config) {
            const nextDate = calculateNextOccurrence(item.recurring_config, new Date());
            if (nextDate) {
                return { shouldResync: true, nextDate };
            }
        }

        return { shouldResync: false };
    }

    // ============ HELPERS ============

    static generateSyncTitle(item: Item | Task): string {
        if (!('type' in item)) return item.title; // It's a Task

        // It's an Item
        switch (item.type) {
            case 'file': return `[File] ${item.title}`;
            case 'folder': return `[Folder] ${item.title}`;
            case 'link': return `[Link] ${item.title}`;
            case 'image': return `[Image] ${item.title}`;
            default: return item.title; // Notes don't need prefix
        }
    }

    static generateSyncNotes(item: Item | Task): string {
        let notes = '';

        // Base description
        if ('description' in item && item.description) {
            notes += item.description + '\n\n';
        }

        // Item-specific content
        if ('type' in item) {
            const i = item as Item;
            if (i.type === 'note' && i.content && 'text' in i.content) {
                notes += (i.content as any).text + '\n\n';
            }
            if (i.type === 'link' && i.content && 'url' in i.content) {
                notes += `🔗 Link: ${(i.content as any).url}\n\n`;
            }
            if (i.type === 'file' && i.file_meta) {
                notes += `📎 File: ${i.file_meta.originalName} (${(i.file_meta.size / 1024).toFixed(1)} KB)\n`;
            }
            if (i.type === 'folder' && i.content && 'itemCount' in i.content) {
                notes += `📂 Contains ${(i.content as any).itemCount} items\n`;
            }
        }

        // Universal Footer
        notes += `\n---\nSynced from Stash`;

        return notes.trim();
    }

    // ============ HELPERS ============

    static async getLink(localId: string, type: 'task' | 'event') {
        const { data } = await supabase
            .from('google_resource_links')
            .select('*')
            .eq('local_id', localId)
            .eq('resource_type', type)
            .single();
        return data;
    }

    static async createLink(localId: string, userId: string, localType: string, googleId: string, resourceType: string, extra: { calendar_id?: string, task_list_id?: string } = {}) {
        await supabase.from('google_resource_links').insert({
            user_id: userId,
            local_id: localId,
            local_type: localType,
            google_id: googleId,
            resource_type: resourceType,
            calendar_id: extra.calendar_id,
            task_list_id: extra.task_list_id
        });
    }

    static async deleteLink(linkId: string) {
        await supabase.from('google_resource_links').delete().eq('id', linkId);
    }

    static async updateLinkTimestamp(linkId: string) {
        await supabase.from('google_resource_links')
            .update({ last_synced_at: new Date().toISOString() })
            .eq('id', linkId);
    }
}

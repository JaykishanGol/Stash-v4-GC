import { supabase } from './supabase';
import { GoogleSyncService } from './googleSyncService';
import type { Item, Task } from './types';
import { useAppStore } from '../store/useAppStore';

type SyncOperationType = 'task' | 'event';

interface QueueItem {
    id: string; // local_id
    type: SyncOperationType;
    data: Item | Task; // The current state of the item
    options: any; // TaskSyncOptions | EventSyncOptions
    timestamp: number;
    retries: number;
}

const MAX_RETRIES = 3;
const DEBOUNCE_MS = 2000; // Wait 2s before syncing to allow typing to finish

export class GoogleSyncQueue {
    private queue: Map<string, QueueItem> = new Map();
    private processing: Set<string> = new Set();
    private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

    // Singleton instance
    private static instance: GoogleSyncQueue;

    public static getInstance(): GoogleSyncQueue {
        if (!GoogleSyncQueue.instance) {
            GoogleSyncQueue.instance = new GoogleSyncQueue();
        }
        return GoogleSyncQueue.instance;
    }

    /**
     * Add or Update an item in the sync queue (Debounced)
     */
    public enqueue(
        id: string,
        type: SyncOperationType,
        data: Item | Task,
        options: any
    ) {
        // 1. Clear existing timer if any (Debounce)
        if (this.debounceTimers.has(id)) {
            clearTimeout(this.debounceTimers.get(id));
        }

        // 2. Update the queue with the LATEST data
        this.queue.set(id, {
            id,
            type,
            data,
            options,
            timestamp: Date.now(),
            retries: this.queue.get(id)?.retries || 0
        });

        // 3. Mark as "Syncing" in UI (Optimistic)
        // We could dispatch a state update here if we had a specific 'is_google_syncing' flag

        // 4. Set new timer
        const timer = setTimeout(() => {
            this.processItem(id);
        }, DEBOUNCE_MS);

        this.debounceTimers.set(id, timer);
    }

    /**
     * Process a specific item from the queue
     */
    private async processItem(id: string) {
        const item = this.queue.get(id);
        if (!item || this.processing.has(id)) return;

        this.processing.add(id);
        this.debounceTimers.delete(id);

        try {
            console.log(`[GoogleSyncQueue] Processing ${item.type}: ${item.data.title}`);

            if (item.type === 'task') {
                await GoogleSyncService.syncToGoogleTask(item.data, item.options);
                // Clear unsynced flag in DB
                await supabase.from('tasks').update({ is_unsynced: false } as any).eq('id', id);
            } else {
                await GoogleSyncService.syncToGoogleEvent(item.data, item.options);
                // Clear unsynced flag in DB
                await supabase.from('items').update({ is_unsynced: false }).eq('id', id);
            }

            // Success!
            this.queue.delete(id);
            this.updateErrorStatus(id, null); // Clear error

        } catch (error: any) {
            console.error(`[GoogleSyncQueue] Failed to sync ${id}:`, error);

            if (item.retries < MAX_RETRIES) {
                // Retry with exponential backoff (not implemented in debounce, just simple re-queue)
                item.retries++;
                console.log(`[GoogleSyncQueue] Retrying ${id} (Attempt ${item.retries})`);
                
                // Re-queue with delay
                this.debounceTimers.set(id, setTimeout(() => {
                    this.processing.delete(id); // Allow re-processing
                    this.processItem(id);
                }, 2000 * item.retries));
                return; // Don't delete from processing yet
            } else {
                // Give up
                this.queue.delete(id);
                this.updateErrorStatus(id, error.message || 'Sync failed');
                
                // Notify user
                useAppStore.getState().addNotification(
                    'error',
                    'Google Sync Failed',
                    `Could not sync "${item.data.title}". Click to retry.`
                );
            }
        } finally {
            this.processing.delete(id);
        }
    }

    /**
     * Update error status in DB so UI can show a red icon
     */
    private async updateErrorStatus(localId: string, error: string | null) {
        // We update the link table to reflect status
        const { error: dbError } = await supabase
            .from('google_resource_links')
            .update({ 
                error: error,
                last_synced_at: error ? undefined : new Date().toISOString()
            })
            .eq('local_id', localId);

        if (dbError) console.error('[GoogleSyncQueue] Failed to update status:', dbError);
    }
}

export const googleSyncQueue = GoogleSyncQueue.getInstance();

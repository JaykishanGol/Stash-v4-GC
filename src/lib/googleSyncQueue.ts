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
const STORAGE_KEY = 'stash_google_sync_queue';

export class GoogleSyncQueue {
    private queue: Map<string, QueueItem> = new Map();
    private processing: Set<string> = new Set();
    private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

    // Singleton instance
    private static instance: GoogleSyncQueue;

    private constructor() {
        this.loadFromStorage();
        // Auto-resume queue processing when online
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                console.log('[GoogleSyncQueue] Back online. Resuming...');
                this.processQueue();
            });
        }
    }

    public static getInstance(): GoogleSyncQueue {
        if (!GoogleSyncQueue.instance) {
            GoogleSyncQueue.instance = new GoogleSyncQueue();
        }
        return GoogleSyncQueue.instance;
    }

    private saveToStorage() {
        try {
            const serializable = Array.from(this.queue.entries());
            localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
        } catch (e) {
            console.warn('[GoogleSyncQueue] Failed to save queue:', e);
        }
    }

    private loadFromStorage() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const entries: [string, QueueItem][] = JSON.parse(saved);
                this.queue = new Map(entries);
                console.log(`[GoogleSyncQueue] Restored ${this.queue.size} pending jobs.`);
                
                // Restart processing for all restored items immediately (no debounce needed for restored items)
                this.processQueue();
            }
        } catch (e) {
            console.error('[GoogleSyncQueue] Failed to load queue:', e);
        }
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
        
        this.saveToStorage();

        // 3. Set new timer
        const timer = setTimeout(() => {
            this.processItem(id);
        }, DEBOUNCE_MS);

        this.debounceTimers.set(id, timer);
    }

    /**
     * Process all items in the queue (e.g., on load or reconnect)
     */
    private async processQueue() {
        for (const id of this.queue.keys()) {
            if (!this.processing.has(id) && !this.debounceTimers.has(id)) {
                this.processItem(id);
            }
        }
    }

    /**
     * Process a specific item from the queue
     */
    private async processItem(id: string) {
        const item = this.queue.get(id);
        if (!item || this.processing.has(id)) return;

        // Check Google connection before attempting sync
        try {
            const { hasStoredGoogleConnection } = await import('./googleTokenService');
            const connected = await hasStoredGoogleConnection();
            if (!connected) {
                console.debug('[GoogleSyncQueue] No Google connection — skipping sync for', id);
                return;
            }
        } catch {
            // If we can't check, skip silently
            return;
        }

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
            this.saveToStorage();
            this.updateErrorStatus(id, null); // Clear error

        } catch (error: any) {
            console.error(`[GoogleSyncQueue] Failed to sync ${id}:`, error);

            if (item.retries < MAX_RETRIES) {
                // Retry with exponential backoff
                item.retries++;
                this.saveToStorage(); // Save retry count
                
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
                this.saveToStorage();
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
        try {
            // We update the link table to reflect status
            const { error: dbError } = await supabase
                .from('google_resource_links')
                .update({ 
                    error: error,
                    last_synced_at: error ? undefined : new Date().toISOString()
                })
                .eq('local_id', localId);

            // 406 = table doesn't exist yet, silently ignore
            if (dbError && dbError.code !== 'PGRST204' && !dbError.message?.includes('406')) {
                console.warn('[GoogleSyncQueue] Failed to update status:', dbError.message);
            }
        } catch (e) {
            // Table may not exist — non-critical, swallow error
            console.debug('[GoogleSyncQueue] google_resource_links not available:', e);
        }
    }
}

export const googleSyncQueue = GoogleSyncQueue.getInstance();

/**
 * Persistent Sync Queue Module
 * Ensures data operations are not lost on page refreshes or network failures.
 */

export type SyncActionType =
    | 'upsert-item'
    | 'delete-item'
    | 'upsert-task'
    | 'delete-task'
    | 'upsert-list'
    | 'delete-list';

interface SyncOperation {
    id: string; // The specific Item/Task/List ID
    type: SyncActionType;
    payload: any;
    timestamp: string;
    retries: number;
}

const STORAGE_KEY = 'stash_sync_queue';
const MAX_RETRIES = 5;

class PersistentQueue {
    private queue: SyncOperation[] = [];
    private isProcessing = false;

    constructor() {
        this.loadFromStorage();
        // Auto-resume when coming online
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                console.log('[Queue] Back online. Resuming process.');
                this.process();
            });
        }
    }

    private loadFromStorage() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                this.queue = JSON.parse(saved);
                console.log(`[Queue] Loaded ${this.queue.length} pending operations from storage.`);
            }
        } catch (e) {
            console.error('[Queue] Failed to load from storage:', e);
            this.queue = [];
        }
    }

    private saveToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
        } catch (e) {
            console.error('[Queue] Failed to save to storage:', e);
        }
    }

    /**
     * Add an operation to the queue
     */
    add(type: SyncActionType, id: string, payload: any) {
        // Remove existing operation for this specific ID and type to avoid redundant calls
        // (e.g., if you update an item twice, we only care about the latest version)
        this.queue = this.queue.filter(op => !(op.id === id && op.type === type));

        this.queue.push({
            id,
            type,
            payload,
            timestamp: new Date().toISOString(),
            retries: 0
        });

        this.saveToStorage();
        this.process();
    }

    /**
     * Process the queue
     */
    async process() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        console.log(`[Queue] Starting process. ${this.queue.length} items pending.`);

        const { supabase, isSupabaseConfigured } = await import('./supabase');

        if (!isSupabaseConfigured()) {
            console.warn('[Queue] Supabase not configured. Pausing queue.');
            this.isProcessing = false;
            return;
        }

        while (this.queue.length > 0) {
            const op = this.queue[0];

            try {
                await this.execute(op, supabase);

                // Success! Remove from queue
                this.queue.shift();
                this.saveToStorage();
                console.log(`[Queue] Operation ${op.type} for ${op.id} succeeded.`);
            } catch (error: any) {
                console.error(`[Queue] Operation ${op.type} failed (Attempt ${op.retries + 1}):`, error);

                // Handle both object error and string error formats
                const errorBody = error?.error || error || {};
                const errorMsg = errorBody.message || error.message || '';
                
                // Check if it's a permanent error (schema mismatch, 400 Bad Request)
                // Postgres Error 42703 is "undefined_column"
                const isSchemaError = errorMsg.includes('Could not find') && errorMsg.includes('column');
                const isBadRequest = error?.status === 400 || error?.code === 'PGRST204' || error?.code === '42703' || isSchemaError;

                if (isBadRequest) {
                     console.error(`[Queue] Permanent error for ${op.id}: ${errorMsg}. Removing from queue to prevent blockage.`);
                     
                     // ROLLBACK STRATEGY:
                     // Since we can't easily "undo" the specific Redux/Zustand change without complex history,
                     // the safest Enterprise strategy is to force a "Re-Sync" from the server.
                     // This overwrites the invalid local state with the true server state.
                     
                     // We access the store via the global hook (imported dynamically or via window/global ref if set)
                     // A cleaner way in a module:
                     import('../store/useAppStore').then(({ useAppStore }) => {
                         console.warn('[Queue] Triggering State Rollback due to sync failure.');
                         useAppStore.getState().loadUserData();
                     });

                     this.queue.shift();
                     this.saveToStorage();
                     continue; // Move to next item
                }

                if (op.retries >= MAX_RETRIES) {
                    console.error(`[Queue] Giving up on operation ${op.id} after ${MAX_RETRIES} attempts.`);
                    this.queue.shift();
                } else {
                    // Move to end of queue to try others first
                    this.queue.shift();
                    op.retries++; // Increment retries
                    this.queue.push(op);

                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, 2000 * op.retries));
                }

                this.saveToStorage();

                // If it was a network error, stop processing for a bit
                if ((error as any)?.message?.includes('Fetch')) {
                    console.warn('[Queue] Network error detected. Stopping processor.');
                    break;
                }
            }
        }

        this.isProcessing = false;
        console.log('[Queue] Process finished.');
    }

    private async execute(op: SyncOperation, supabase: any) {
        let { payload } = op;
        const { type, id } = op;

        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            // 1. Common Cleanup
            const entries = Object.entries(payload).filter(([, v]) => v !== undefined);
            
            const COMMON_FORBIDDEN = ['is_unsynced', 'temp_id', 'error'];
            
            // 2. Strict Whitelisting based on Table
            let ALLOWED_KEYS: string[] = [];
            
            if (type === 'upsert-list') {
                ALLOWED_KEYS = ['id', 'user_id', 'name', 'color', 'order', 'items', 'created_at', 'item_count'];
            } else if (type === 'upsert-task') {
                // Task fields
                ALLOWED_KEYS = ['id', 'user_id', 'list_id', 'title', 'description', 'color', 'priority', 'due_at', 'remind_at', 'reminder_recurring', 'reminder_type', 'one_time_at', 'recurring_config', 'next_trigger_at', 'last_acknowledged_at', 'item_ids', 'item_completion', 'is_completed', 'created_at', 'updated_at', 'deleted_at', 'tags'];
            } else if (type === 'upsert-item') {
                // Item fields
                ALLOWED_KEYS = ['id', 'user_id', 'folder_id', 'type', 'title', 'content', 'file_meta', 'priority', 'tags', 'due_at', 'remind_at', 'reminder_recurring', 'reminder_type', 'one_time_at', 'recurring_config', 'next_trigger_at', 'last_acknowledged_at', 'bg_color', 'position_x', 'position_y', 'width', 'height', 'is_pinned', 'is_archived', 'is_completed', 'created_at', 'updated_at', 'deleted_at', 'child_count'];
            }

            // Filter entries
            if (ALLOWED_KEYS.length > 0) {
                const cleanEntries = entries.filter(([k]) => 
                    !COMMON_FORBIDDEN.includes(k) && ALLOWED_KEYS.includes(k)
                );
                payload = Object.fromEntries(cleanEntries);
                console.log(`[Queue] Sanitized payload for ${type}:`, payload);
            } else {
                // Fallback for delete or unknown types
                const cleanEntries = entries.filter(([k]) => !COMMON_FORBIDDEN.includes(k));
                payload = Object.fromEntries(cleanEntries);
            }
        }

        switch (type) {
            case 'upsert-item': {
                const { error } = await supabase.from('items').upsert(payload, { onConflict: 'id' });
                if (error) throw error;
                break;
            }
            case 'delete-item': {
                const { error } = await supabase.from('items').delete().eq('id', id);
                if (error) throw error;
                break;
            }
            case 'upsert-task': {
                const { error } = await supabase.from('tasks').upsert(payload, { onConflict: 'id' });
                if (error) throw error;
                break;
            }
            case 'delete-task': {
                const { error } = await supabase.from('tasks').delete().eq('id', id);
                if (error) throw error;
                break;
            }
            case 'upsert-list': {
                const { error } = await supabase.from('lists').upsert(payload, { onConflict: 'id' });
                if (error) throw error;
                break;
            }
            case 'delete-list': {
                const { error } = await supabase.from('lists').delete().eq('id', id);
                if (error) throw error;
                break;
            }
        }
    }

    getPendingCount() {
        return this.queue.length;
    }

    getPendingItems() {
        return this.queue.filter(op => op.type === 'upsert-item').map(op => op.payload);
    }
}

export const persistentSyncQueue = new PersistentQueue();

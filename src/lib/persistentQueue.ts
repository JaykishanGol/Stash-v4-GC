/**
 * Persistent Sync Queue Module
 * Ensures data operations are not lost on page refreshes or network failures.
 * 
 * Features:
 * - Adaptive rate limiting to prevent 429 errors
 * - Exponential backoff on failures
 * - Queue analytics for observability
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

// Analytics tracking for sync queue observability
export interface SyncQueueStats {
    totalProcessed: number;
    totalFailed: number;
    avgProcessingTimeMs: number;
    lastProcessedAt: string | null;
    last429At: string | null;
    currentRateLimitMs: number;
}

const STORAGE_KEY = 'stash_sync_queue';
const STATS_KEY = 'stash_sync_stats';
const MAX_RETRIES = 5;

// Rate limiting configuration
const MIN_DELAY_MS = 50;        // Minimum delay between operations
const MAX_DELAY_MS = 5000;      // Maximum delay (5 seconds)
const DELAY_INCREASE_FACTOR = 2; // Multiply delay on 429
const DELAY_DECREASE_FACTOR = 0.9; // Gradually reduce delay on success
const BATCH_SIZE = 10;          // Process in batches before pausing

class PersistentQueue {
    private queue: SyncOperation[] = [];
    private isProcessing = false;
    private currentDelayMs = MIN_DELAY_MS;
    private stats: SyncQueueStats = {
        totalProcessed: 0,
        totalFailed: 0,
        avgProcessingTimeMs: 0,
        lastProcessedAt: null,
        last429At: null,
        currentRateLimitMs: MIN_DELAY_MS
    };
    private processingTimes: number[] = [];

    constructor() {
        this.loadFromStorage();
        this.loadStats();
        // Auto-resume when coming online
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                console.log('[Queue] Back online. Resuming process.');
                this.process();
            });
        }
    }

    private loadStats() {
        try {
            const saved = localStorage.getItem(STATS_KEY);
            if (saved) {
                this.stats = { ...this.stats, ...JSON.parse(saved) };
                this.currentDelayMs = this.stats.currentRateLimitMs;
            }
        } catch (e) {
            console.warn('[Queue] Failed to load stats:', e);
        }
    }

    private saveStats() {
        try {
            this.stats.currentRateLimitMs = this.currentDelayMs;
            localStorage.setItem(STATS_KEY, JSON.stringify(this.stats));
        } catch (e) {
            console.warn('[Queue] Failed to save stats:', e);
        }
    }

    private recordProcessingTime(ms: number) {
        this.processingTimes.push(ms);
        if (this.processingTimes.length > 100) {
            this.processingTimes.shift();
        }
        this.stats.avgProcessingTimeMs = 
            this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
    }

    /**
     * Get current queue statistics for observability
     */
    getStats(): SyncQueueStats & { pendingCount: number } {
        return { ...this.stats, pendingCount: this.queue.length };
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
     * Process the queue with adaptive rate limiting
     */
    async process() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        console.log(`[Queue] Starting process. ${this.queue.length} items pending. Rate limit: ${this.currentDelayMs}ms`);

        const { supabase, isSupabaseConfigured } = await import('./supabase');

        if (!isSupabaseConfigured()) {
            console.warn('[Queue] Supabase not configured. Pausing queue.');
            this.isProcessing = false;
            return;
        }

        let processedInBatch = 0;

        while (this.queue.length > 0) {
            const op = this.queue[0];
            const startTime = Date.now();

            try {
                await this.execute(op, supabase);

                // Success! Remove from queue
                this.queue.shift();
                this.saveToStorage();
                
                // Update stats
                this.stats.totalProcessed++;
                this.stats.lastProcessedAt = new Date().toISOString();
                this.recordProcessingTime(Date.now() - startTime);
                
                console.log(`[Queue] Operation ${op.type} for ${op.id} succeeded.`);

                // Gradually reduce delay on success (adaptive rate limiting)
                this.currentDelayMs = Math.max(
                    MIN_DELAY_MS,
                    Math.floor(this.currentDelayMs * DELAY_DECREASE_FACTOR)
                );

                processedInBatch++;

                // Batch processing: pause between batches to prevent overwhelming the API
                if (processedInBatch >= BATCH_SIZE && this.queue.length > 0) {
                    console.log(`[Queue] Batch complete. Pausing for ${this.currentDelayMs * 2}ms`);
                    await new Promise(resolve => setTimeout(resolve, this.currentDelayMs * 2));
                    processedInBatch = 0;
                } else if (this.queue.length > 0) {
                    // Normal delay between operations
                    await new Promise(resolve => setTimeout(resolve, this.currentDelayMs));
                }
            } catch (error: any) {
                console.error(`[Queue] Operation ${op.type} failed (Attempt ${op.retries + 1}):`, error);

                // Handle both object error and string error formats
                const errorBody = error?.error || error || {};
                const errorMsg = errorBody.message || error.message || '';
                const statusCode = error?.status || error?.code;

                // Check for 429 Too Many Requests
                if (statusCode === 429 || errorMsg.includes('Too Many Requests') || errorMsg.includes('rate limit')) {
                    console.warn(`[Queue] Rate limited! Increasing delay from ${this.currentDelayMs}ms`);
                    this.currentDelayMs = Math.min(MAX_DELAY_MS, this.currentDelayMs * DELAY_INCREASE_FACTOR);
                    this.stats.last429At = new Date().toISOString();
                    this.saveStats();
                    
                    // Wait with exponential backoff before retrying
                    await new Promise(resolve => setTimeout(resolve, this.currentDelayMs));
                    continue; // Retry the same operation
                }

                // Check if it's a permanent error (schema mismatch, 400 Bad Request)
                // Postgres Error 42703 is "undefined_column"
                const isSchemaError = errorMsg.includes('Could not find') && errorMsg.includes('column');
                const isBadRequest = statusCode === 400 || error?.code === 'PGRST204' || error?.code === '42703' || isSchemaError;

                if (isBadRequest) {
                    console.error(`[Queue] Permanent error for ${op.id}: ${errorMsg}. Removing from queue to prevent blockage.`);

                    // IMPROVED STRATEGY (Phase 1 Fix):
                    // Do NOT rollback entire state. Just drop the bad operation and notify user.
                    import('../store/useAppStore').then(({ useAppStore }) => {
                        useAppStore.getState().addNotification(
                            'error',
                            'Sync Failed',
                            `One change could not be saved: ${errorMsg}`
                        );
                    });

                    this.queue.shift();
                    this.stats.totalFailed++;
                    this.saveToStorage();
                    this.saveStats();
                    continue; // Move to next item
                }

                if (op.retries >= MAX_RETRIES) {
                    console.error(`[Queue] Giving up on operation ${op.id} after ${MAX_RETRIES} attempts.`);
                    this.queue.shift();
                    this.stats.totalFailed++;
                } else {
                    // Move to end of queue to try others first
                    this.queue.shift();
                    op.retries++; // Increment retries
                    this.queue.push(op);

                    // Wait before retrying with exponential backoff
                    const backoffDelay = Math.min(MAX_DELAY_MS, 1000 * Math.pow(2, op.retries));
                    await new Promise(resolve => setTimeout(resolve, backoffDelay));
                }

                this.saveToStorage();
                this.saveStats();

                // If it was a network error, stop processing for a bit
                if ((error as any)?.message?.includes('Fetch')) {
                    console.warn('[Queue] Network error detected. Stopping processor.');
                    break;
                }
            }
        }

        this.saveStats();
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
                // Task fields (simplified scheduler)
                ALLOWED_KEYS = ['id', 'user_id', 'list_id', 'title', 'description', 'color', 'priority', 'scheduled_at', 'remind_before', 'recurring_config', 'item_ids', 'item_completion', 'is_completed', 'created_at', 'updated_at', 'deleted_at', 'tags'];
            } else if (type === 'upsert-item') {
                // Item fields (simplified scheduler)
                ALLOWED_KEYS = ['id', 'user_id', 'folder_id', 'type', 'title', 'content', 'file_meta', 'priority', 'tags', 'scheduled_at', 'remind_before', 'recurring_config', 'bg_color', 'position_x', 'position_y', 'width', 'height', 'is_pinned', 'is_archived', 'is_completed', 'created_at', 'updated_at', 'deleted_at', 'child_count'];
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

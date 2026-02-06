/**
 * Share Handler
 * 
 * Handles the main-thread side of the share-target Web Share API flow.
 * 
 * TWO-STEP FILE HANDLING ARCHITECTURE:
 * 
 * Step 1 (sw.js - Service Worker):
 *   - Intercepts POST requests to share-target URL
 *   - Reads shared files from FormData
 *   - Stores raw ArrayBuffer data in IndexedDB (stash-share-db)
 *   - Redirects to /?share_target=true
 * 
 * Step 2 (shareHandler.ts - Main Thread):
 *   - App.tsx detects ?share_target URL param
 *   - Calls getPendingShares() to read from IndexedDB
 *   - processShare() converts ArrayBuffer → File → Item
 *   - Files are uploaded to Supabase storage
 *   - clearPendingShares() cleans up IndexedDB
 * 
 * WHY THIS PATTERN:
 *   - Service workers cannot directly access the main app state
 *   - IndexedDB provides reliable cross-context data transfer
 *   - Allows offline share capture with deferred processing
 * 
 * SHARED CONSTANTS:
 *   Database config is centralized in ./shareDbConfig.ts
 *   Both sw.js and this file import from there.
 */

import { type Item } from './types';
import { generateId } from './utils';
import { SHARE_DB_NAME, SHARE_STORE_NAME, SHARE_DB_VERSION } from './shareDbConfig';

export interface ShareData {
    id?: number;
    title: string;
    text: string;
    url: string;
    files: {
        name: string;
        type: string;
        buffer: ArrayBuffer;
    }[];
    timestamp: number;
}

function openShareDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);

        // CRITICAL: Create object store if it doesn't exist
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(SHARE_STORE_NAME)) {
                db.createObjectStore(SHARE_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                console.log('[ShareHandler] Created share object store');
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            console.error('[ShareHandler] Failed to open share DB:', request.error);
            reject(request.error);
        };
    });
}

export async function getPendingShares(): Promise<ShareData[]> {
    const db = await openShareDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(SHARE_STORE_NAME, 'readonly');
        const store = tx.objectStore(SHARE_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function clearPendingShares() {
    const db = await openShareDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SHARE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(SHARE_STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Converts raw share data into Stash Items
 */
export function processShare(share: ShareData, userId: string): Item[] {
    const now = new Date().toISOString();
    const items: Item[] = [];

    // 1. Files
    if (share.files && share.files.length > 0) {
        for (const file of share.files) {
            const blob = new Blob([file.buffer], { type: file.type });
            const objectUrl = URL.createObjectURL(blob);

            items.push({
                id: generateId(),
                user_id: userId,
                folder_id: null,
                type: file.type.startsWith('image/') ? 'image' : 'file',
                title: share.title || file.name,
                content: {
                    url: objectUrl,
                    preview: objectUrl
                },
                file_meta: {
                    size: file.buffer.byteLength,
                    mime: file.type,
                    path: objectUrl,
                    originalName: file.name
                },
                priority: 'none',
                tags: ['shared'],
                scheduled_at: null,
                remind_before: null,
                recurring_config: null,
                bg_color: '',
                is_pinned: false,
                is_archived: false,
                is_completed: false,
                is_unsynced: true,
                created_at: now,
                updated_at: now,
                deleted_at: null
            } as Item);
        }
        return items;
    }

    // 2. Link
    if (share.url) {
        items.push({
            id: generateId(),
            user_id: userId,
            folder_id: null,
            type: 'link',
            title: share.title || share.url,
            content: {
                url: share.url,
                description: share.text
            },
            file_meta: null,
            priority: 'none',
            tags: ['shared'],
            scheduled_at: null,
            remind_before: null,
            recurring_config: null,
            bg_color: '',
            is_pinned: false,
            is_archived: false,
            is_completed: false,
            is_unsynced: true,
            created_at: now,
            updated_at: now,
            deleted_at: null
        });
        return items;
    }

    // 3. Text Note
    if (share.text || share.title) {
        items.push({
            id: generateId(),
            user_id: userId,
            folder_id: null,
            type: 'note',
            title: share.title || 'Shared Note',
            content: {
                text: share.text
            },
            file_meta: null,
            priority: 'none',
            tags: ['shared'],
            scheduled_at: null,
            remind_before: null,
            recurring_config: null,
            bg_color: '',
            is_pinned: false,
            is_archived: false,
            is_completed: false,
            is_unsynced: true,
            created_at: now,
            updated_at: now,
            deleted_at: null
        });
        return items;
    }

    return [];
}
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
 *   - Sends SHARE_RECEIVED postMessage to existing window, or
 *   - Redirects to /?share_target=true if no window is open
 * 
 * Step 2 (shareHandler.ts - Main Thread):
 *   - App.tsx detects SHARE_RECEIVED message or ?share_target URL param
 *   - Calls getPendingShares() to read from IndexedDB
 *   - processShare() converts ArrayBuffer → Item with _rawBlob attached
 *   - ShareIntentModal uploads _rawBlob directly (no blob URL round-trip)
 *   - clearPendingShares() cleans up IndexedDB
 * 
 * KEY DESIGN: Files are kept as raw Blob objects on item._rawBlob
 * rather than creating blob: URLs. This avoids GC/serialization issues
 * where blob URLs become invalid before upload.
 * 
 * SHARED CONSTANTS:
 *   Database config is centralized in ./shareDbConfig.ts
 *   Both sw.js and this file import from there.
 */

import { type Item } from './types';
import { generateId } from './utils';
import { SHARE_DB_NAME, SHARE_STORE_NAME, SHARE_DB_VERSION } from './shareDbConfig';

/** Raw file data stored in IndexedDB by the service worker */
export interface ShareFileData {
    name: string;
    type: string;
    buffer: ArrayBuffer;
}

export interface ShareData {
    id?: number;
    title: string;
    text: string;
    url: string;
    files: ShareFileData[];
    timestamp: number;
}

/**
 * Transient blob attachment for share items.
 * NOT serializable — lives only in memory until upload completes.
 */
export interface RawBlobAttachment {
    blob: Blob;
    name: string;
    mime: string;
    size: number;
}

/**
 * Extended Item type with transient blob data for share uploads.
 * The _rawBlob field is never persisted to store/IDB.
 */
export type ShareItem = Item & {
    _rawBlob?: RawBlobAttachment;
};

function openShareDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);

        // NON-DESTRUCTIVE: create only if missing
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
    try {
        const db = await openShareDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(SHARE_STORE_NAME, 'readonly');
            const store = tx.objectStore(SHARE_STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                db.close();
                resolve(request.result || []);
            };
            request.onerror = () => {
                db.close();
                reject(request.error);
            };
        });
    } catch (err) {
        console.error('[ShareHandler] getPendingShares failed:', err);
        return [];
    }
}

export async function clearPendingShares() {
    try {
        const db = await openShareDB();
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(SHARE_STORE_NAME, 'readwrite');
            const store = tx.objectStore(SHARE_STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => {
                db.close();
                resolve();
            };
            request.onerror = () => {
                db.close();
                reject(request.error);
            };
        });
    } catch (err) {
        console.error('[ShareHandler] clearPendingShares failed:', err);
    }
}

// --- Smart URL Detection ---

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/**
 * Extract a URL from text if the text field contains one but the url field is empty.
 * Common when sharing from apps that put everything in the text field.
 */
function extractUrlFromText(text: string): string | null {
    const matches = text.match(URL_REGEX);
    return matches ? matches[0] : null;
}

/**
 * Auto-detect tags based on URL patterns.
 */
function autoTagUrl(url: string): string[] {
    const tags = ['shared'];
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace('www.', '').replace('m.', '');

        if (host.includes('youtube.com') || host.includes('youtu.be')) tags.push('youtube');
        else if (host.includes('twitter.com') || host.includes('x.com')) tags.push('twitter');
        else if (host.includes('reddit.com')) tags.push('reddit');
        else if (host.includes('github.com')) tags.push('github');
        else if (host.includes('instagram.com')) tags.push('instagram');
        else if (host.includes('linkedin.com')) tags.push('linkedin');
        else if (host.includes('medium.com')) tags.push('article');
        else if (host.includes('stackoverflow.com')) tags.push('stackoverflow');
        else if (host.includes('notion.so') || host.includes('notion.site')) tags.push('notion');
    } catch {
        // Invalid URL, just use default tags
    }
    return tags;
}

/**
 * Converts raw share data into Stash Items.
 * 
 * Files are attached as _rawBlob (direct Blob reference) instead of blob: URLs.
 * This avoids the GC/serialization bug where blob URLs become invalid.
 */
export function processShare(share: ShareData, userId: string): ShareItem[] {
    const now = new Date().toISOString();
    const items: ShareItem[] = [];

    // 1. Files — keep raw Blob, no blob: URL
    if (share.files && share.files.length > 0) {
        for (const file of share.files) {
            if (!file.buffer || file.buffer.byteLength === 0) continue;

            const blob = new Blob([file.buffer], { type: file.type });
            const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(blob) : '';

            items.push({
                id: generateId(),
                user_id: userId,
                folder_id: null,
                type: file.type.startsWith('image/') ? 'image' : 'file',
                title: share.title || file.name,
                content: {
                    ...(previewUrl ? { preview: previewUrl } : {})
                },
                file_meta: {
                    size: file.buffer.byteLength,
                    mime: file.type,
                    path: '', // Will be set after Supabase upload
                    originalName: file.name
                },
                // Transient: raw blob for direct upload — NOT serialized
                _rawBlob: {
                    blob,
                    name: file.name,
                    mime: file.type,
                    size: file.buffer.byteLength
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
            } as ShareItem);
        }
        return items;
    }

    // 2. Link — check both share.url and extract from text
    const sharedUrl = share.url || extractUrlFromText(share.text || '');
    if (sharedUrl) {
        const tags = autoTagUrl(sharedUrl);
        // If URL was extracted from text, remove it from the description
        const description = share.url
            ? share.text
            : (share.text || '').replace(sharedUrl, '').trim();

        items.push({
            id: generateId(),
            user_id: userId,
            folder_id: null,
            type: 'link',
            title: share.title || sharedUrl,
            content: {
                url: sharedUrl,
                description: description || undefined
            },
            file_meta: null,
            priority: 'none',
            tags,
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
        } as ShareItem);
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
        } as ShareItem);
        return items;
    }

    return [];
}
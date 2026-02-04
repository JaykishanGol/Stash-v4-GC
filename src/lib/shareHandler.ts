import { type Item } from './types';
import { generateId } from './utils';

const SHARE_DB_NAME = 'stash-share-db';
const SHARE_STORE_NAME = 'shares';
const DB_VERSION = 2; // Must match sw.js

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
        const request = indexedDB.open(SHARE_DB_NAME, DB_VERSION);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
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
 * Converts raw share data into a Stash Item
 */
export function processShare(share: ShareData, userId: string): Item | null {
    const now = new Date().toISOString();

    // 1. Files
    if (share.files && share.files.length > 0) {
        const file = share.files[0];
        const blob = new Blob([file.buffer], { type: file.type });
        const objectUrl = URL.createObjectURL(blob);

        return {
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
            created_at: now,
            updated_at: now,
            deleted_at: null
        } as Item;
    }

    // 2. Link
    if (share.url) {
        return {
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
            created_at: now,
            updated_at: now,
            deleted_at: null
        };
    }

    // 3. Text Note
    if (share.text || share.title) {
        return {
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
            created_at: now,
            updated_at: now,
            deleted_at: null
        };
    }

    return null;
}
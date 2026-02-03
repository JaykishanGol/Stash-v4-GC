import { createDefaultItem } from './types';
import type { Item, ItemType } from './types';

const SHARE_DB_NAME = 'stash-share-db';
const SHARE_STORE_NAME = 'shares';
const DB_VERSION = 2; // Sync with Service Worker

function openShareDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(SHARE_DB_NAME, DB_VERSION);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        // We don't handle upgrade here usually, as SW does it, but for robustness:
        request.onupgradeneeded = (event) => {
             const db = (event.target as IDBOpenDBRequest).result;
             if (!db.objectStoreNames.contains(SHARE_STORE_NAME)) {
                 db.createObjectStore(SHARE_STORE_NAME, { keyPath: 'id', autoIncrement: true });
             }
        };
    });
}

export async function getPendingShares(): Promise<any[]> {
    try {
        const db = await openShareDB();
        return new Promise<any[]>((resolve, reject) => {
            const tx = db.transaction(SHARE_STORE_NAME, 'readwrite');
            const store = tx.objectStore(SHARE_STORE_NAME);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const shares = request.result;
                // DO NOT clear here. We clear only after successful processing in UI.
                resolve(shares);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('Error reading shares:', e);
        return [];
    }
}

export async function clearPendingShares(): Promise<void> {
    try {
        const db = await openShareDB();
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(SHARE_STORE_NAME, 'readwrite');
            const store = tx.objectStore(SHARE_STORE_NAME);
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('Error clearing shares:', e);
    }
}

export function processShare(share: any, userId: string): Item | null {
    // 1. Files
    if (share.files && share.files.length > 0) {
        const file = share.files[0]; // Handle first file for now
        const blob = new Blob([file.buffer], { type: file.type });
        const url = URL.createObjectURL(blob);
        
        const type: ItemType = file.type.startsWith('image/') ? 'image' : 'file';
        
        return createDefaultItem(userId, type, {
            title: share.title || file.name || 'Shared File',
            file_meta: {
                size: file.buffer.byteLength,
                mime: file.type,
                path: url, // Temporary Blob URL
                originalName: file.name
            },
            content: { description: share.text || '' }
        });
    }

    // 2. URL
    if (share.url) {
        return createDefaultItem(userId, 'link', {
            title: share.title || share.url,
            content: { 
                url: share.url,
                description: share.text 
            }
        });
    }

    // 3. Text
    if (share.text) {
        // Check if text is a URL
        if (share.text.startsWith('http')) {
             return createDefaultItem(userId, 'link', {
                title: share.title || share.text,
                content: { url: share.text }
            });
        }

        return createDefaultItem(userId, 'note', {
            title: share.title || 'Shared Note',
            content: { text: share.text }
        });
    }

    return null;
}

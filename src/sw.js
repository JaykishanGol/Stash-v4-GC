import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

// Immediately claim all clients
self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Log SW lifecycle for debugging
self.addEventListener('install', (event) => {
  console.log('[SW] Service worker installing...');
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activated');
});

// --- Share Target Handler ---

const SHARE_DB_NAME = 'stash-share-db';
const SHARE_STORE_NAME = 'shares';
const DB_VERSION = 2; // Bumped to ensure clean migration

// Open DB helper
function openShareDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (db.objectStoreNames.contains(SHARE_STORE_NAME)) {
          db.deleteObjectStore(SHARE_STORE_NAME);
      }
      db.createObjectStore(SHARE_STORE_NAME, { keyPath: 'id', autoIncrement: true });
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
        console.warn('[SW] Share DB blocked. Closing other tabs might fix this.');
        reject(new Error('DB_BLOCKED'));
    };
  });
}

// Store share data helper
async function storeShare(data) {
  const db = await openShareDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SHARE_STORE_NAME);
    const request = store.add(data);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const title = formData.get('title') || '';
          const text = formData.get('text') || '';
          const urlStr = formData.get('url') || '';
          const mediaFiles = formData.getAll('media');

          const shareData = {
            title,
            text,
            url: urlStr,
            files: [],
            timestamp: Date.now()
          };

          // Handle Files
          if (mediaFiles && mediaFiles.length > 0) {
            shareData.files = await Promise.all(mediaFiles.map(async (file) => {
              if (file.size > 0) {
                return {
                  name: file.name,
                  type: file.type,
                  buffer: await file.arrayBuffer()
                };
              }
              return null;
            }));
            shareData.files = shareData.files.filter(f => f !== null);
          }

          // Save to IDB
          await storeShare(shareData);

          // Redirect to app
          return Response.redirect('/?share_target=true', 303);
        } catch (err) {
          console.error('[SW] Share target error:', err);
          return Response.redirect('/?error=share_failed', 303);
        }
      })()
    );
  }
});

// --- Push Notification Handler ---
self.addEventListener('push', (event) => {
  console.log('[SW] 🔔 Push event received!', event);

  let data = { title: 'Stash Reminder', body: 'You have a reminder' };

  if (event.data) {
    try {
      data = event.data.json();
      console.log('[SW] Push data parsed:', data);
    } catch (e) {
      console.log('[SW] Push data as text:', event.data.text());
      data.body = event.data.text();
    }
  } else {
    console.log('[SW] Push event has no data');
  }

  const options = {
    body: data.body || 'Tap to view details',
    icon: data.icon || '/vite.svg',
    badge: '/vite.svg',
    tag: data.tag || 'stash-reminder',
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: data.data || {},
    // Ensure notification shows even when app is focused
    silent: false,
    renotify: true
  };

  console.log('[SW] Showing notification with options:', options);

  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(() => console.log('[SW] ✅ Notification displayed successfully'))
      .catch(err => console.error('[SW] ❌ Failed to show notification:', err))
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { clientsClaim } from 'workbox-core'
import { SHARE_DB_NAME, SHARE_STORE_NAME, SHARE_DB_VERSION } from './lib/shareDbConfig'

// Immediately claim all clients
self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// ============ Runtime Caching Strategies ============

// Cache Google Fonts stylesheets (StaleWhileRevalidate)
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({
    cacheName: 'google-fonts-stylesheets',
  })
)

// Cache Google Fonts webfonts (CacheFirst, long-lived)
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }), // 1 year
    ],
  })
)

// Cache Supabase Storage images (CacheFirst with size limit)
registerRoute(
  ({ url }) => url.hostname.endsWith('.supabase.co') && url.pathname.includes('/storage/'),
  new CacheFirst({
    cacheName: 'supabase-images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }), // 30 days
    ],
  })
)

// Cache external link preview images (StaleWhileRevalidate with limit)
registerRoute(
  ({ request, url }) =>
    request.destination === 'image' &&
    url.origin !== self.location.origin,
  new StaleWhileRevalidate({
    cacheName: 'external-images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 }), // 7 days
    ],
  })
)

// Cache Supabase API responses (NetworkFirst with short cache for offline)
registerRoute(
  ({ url }) =>
    url.hostname.endsWith('.supabase.co') &&
    url.pathname.startsWith('/rest/'),
  new NetworkFirst({
    cacheName: 'supabase-api',
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 }), // 1 minute - keep fresh for realtime sync
    ],
  })
)

// Log SW lifecycle for debugging
self.addEventListener('install', (event) => {
  console.log('[SW] Service worker installing...');
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activated');
});

// --- Share Target Handler ---

// Open DB helper
function openShareDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);
    
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
    icon: data.icon || '/icon.png',
    badge: data.badge || '/icon.png',
    tag: data.tag || 'stash-reminder',
    requireInteraction: data.requireInteraction || false,
    vibrate: [200, 100, 200],
    data: data.data || {},
    silent: false,
    renotify: true,
    timestamp: data.data?.scheduledAt ? new Date(data.data.scheduledAt).getTime() : Date.now(),
  };

  // Add action buttons if provided
  if (data.actions && data.actions.length > 0) {
    options.actions = data.actions;
  }

  console.log('[SW] Showing notification with options:', options);

  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(() => console.log('[SW] ✅ Notification displayed successfully'))
      .catch(err => console.error('[SW] ❌ Failed to show notification:', err))
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag, 'action:', event.action);
  event.notification.close();

  const notifData = event.notification.data || {};
  let targetUrl = '/';

  // Handle action buttons
  if (event.action === 'complete') {
    // Navigate to app with completion intent
    targetUrl = `/?action=complete&type=${notifData.type || 'item'}&id=${notifData.itemId || ''}`;
  } else if (event.action === 'snooze') {
    // Navigate to app with snooze intent (10 min)
    targetUrl = `/?action=snooze&type=${notifData.type || 'item'}&id=${notifData.itemId || ''}&minutes=10`;
  } else if (event.action === 'view' || !event.action) {
    // Default click or view action - navigate to the item
    if (notifData.url) {
      targetUrl = notifData.url;
    } else if (notifData.itemId) {
      targetUrl = `/?open=${notifData.type || 'item'}&id=${notifData.itemId}`;
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, navigate and focus it
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_ACTION',
            action: event.action || 'click',
            data: notifData,
            url: targetUrl
          });
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

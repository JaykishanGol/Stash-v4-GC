/**
 * Push Notifications Utilities
 * Handles Web Push subscription and communication with backend
 */

import { supabase } from './supabase';

// VAPID Public Key - must match the one in Netlify env vars
const VAPID_PUBLIC_KEY = 'BFNddOZXhvk91TUAzciUyfeub-bxSmjgeF_lwIO-xUWwsS7_fHYKeINwEw292sIYrqCewZ-vI5EsUNWO8ge7lR8';

/**
 * Convert VAPID key from base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * Check if push notifications are supported
 */
export function isPushSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Get current push subscription
 */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
    if (!isPushSupported()) return null;

    try {
        const registration = await navigator.serviceWorker.ready;
        return await registration.pushManager.getSubscription();
    } catch (error) {
        console.error('[PushNotifications] Error getting subscription:', error);
        return null;
    }
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
    if (!isPushSupported()) {
        console.warn('[PushNotifications] Push not supported');
        return null;
    }

    try {
        // Request notification permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('[PushNotifications] Permission denied');
            return null;
        }

        // Get service worker registration
        const registration = await navigator.serviceWorker.ready;

        // Check for existing subscription
        let subscription = await registration.pushManager.getSubscription();

        // If no subscription, create one
        if (!subscription) {
            console.log('[PushNotifications] Creating new subscription...');
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource
            });
            console.log('[PushNotifications] ✅ New subscription created');
        } else {
            console.log('[PushNotifications] Found existing subscription, ensuring it is saved to backend...');
        }

        console.log('[PushNotifications] Subscription endpoint:', subscription.endpoint.slice(-40));

        // Always send subscription to backend (in case previous save failed)
        await saveSubscriptionToBackend(subscription);

        return subscription;

    } catch (error) {
        console.error('[PushNotifications] Subscribe error:', error);
        return null;
    }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
    try {
        const subscription = await getExistingSubscription();
        if (!subscription) return true;

        // Unsubscribe locally
        await subscription.unsubscribe();

        // Remove from backend
        await removeSubscriptionFromBackend(subscription);

        console.log('[PushNotifications] Unsubscribed successfully');
        return true;

    } catch (error) {
        console.error('[PushNotifications] Unsubscribe error:', error);
        return false;
    }
}

/**
 * Save subscription to backend
 */
async function saveSubscriptionToBackend(subscription: PushSubscription): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
        console.error('[PushNotifications] No auth session - cannot save subscription');
        return;
    }

    const subscriptionJSON = subscription.toJSON();
    console.log('[PushNotifications] Saving subscription to backend...');

    try {
        const response = await fetch('/.netlify/functions/subscribe-push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                endpoint: subscriptionJSON.endpoint,
                keys: subscriptionJSON.keys
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[PushNotifications] Backend save failed:', response.status, errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        console.log('[PushNotifications] ✅ Subscription saved to backend successfully');

    } catch (error) {
        console.error('[PushNotifications] ❌ Error saving subscription:', error);
    }
}

/**
 * Remove subscription from backend
 */
async function removeSubscriptionFromBackend(subscription: PushSubscription): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    try {
        await fetch('/.netlify/functions/subscribe-push', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                endpoint: subscription.endpoint
            })
        });

        console.log('[PushNotifications] Subscription removed from backend');

    } catch (error) {
        console.error('[PushNotifications] Error removing subscription:', error);
    }
}

/**
 * Check if user is subscribed to push
 */
export async function isSubscribedToPush(): Promise<boolean> {
    const subscription = await getExistingSubscription();
    return subscription !== null;
}

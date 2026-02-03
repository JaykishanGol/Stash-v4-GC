import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useToast } from '../../hooks/useToast';
import { subscribeToPush, isPushSupported } from '../../lib/pushNotifications';

export function ToastListener() {
    const notifications = useAppStore(state => state.notifications);
    const user = useAppStore(state => state.user);
    const { showToast } = useToast();
    const lastNotifiedId = useRef<string | null>(null);
    const hasSubscribed = useRef(false);

    // Subscribe to push notifications when user is authenticated
    useEffect(() => {
        if (user && isPushSupported() && !hasSubscribed.current) {
            hasSubscribed.current = true;

            // Delay to not block initial render
            const timer = setTimeout(async () => {
                if (Notification.permission === 'granted') {
                    console.log('[ToastListener] Auto-subscribing to push...');
                    const subscription = await subscribeToPush();
                    if (subscription) {
                        console.log('[ToastListener] ✅ Push subscription active');
                    }
                }
            }, 5000);

            return () => clearTimeout(timer);
        }
    }, [user]);

    // Permission Prompt
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            const timer = setTimeout(() => {
                showToast(
                    'Enable notifications to get scheduled reminders?',
                    'info',
                    {
                        duration: 8000,
                        actionLabel: 'Enable',
                        undoAction: async () => {
                            const permission = await Notification.requestPermission();
                            if (permission === 'granted') {
                                showToast('Notifications enabled!', 'success');
                                // Subscribe to push after permission granted
                                const subscription = await subscribeToPush();
                                if (subscription) {
                                    console.log('[ToastListener] Push subscription registered');
                                }
                            }
                        }
                    }
                );
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [showToast]);


    useEffect(() => {
        if (notifications.length > 0) {
            const latest = notifications[0];
            console.log('[ToastListener] New notification detected:', { id: latest.id, title: latest.title, type: latest.type });

            if (latest.id !== lastNotifiedId.current) {
                lastNotifiedId.current = latest.id;

                // Trigger toast
                showToast(latest.message, latest.type as any, {
                    duration: latest.type === 'error' ? 6000 : 4000
                });

                // Trigger Browser Notification for Reminders
                const isReminder = latest.title.startsWith('Reminder:') || latest.title.startsWith('Task Due:');
                console.log('[ToastListener] Browser notification check:', {
                    hasNotificationAPI: 'Notification' in window,
                    permission: 'Notification' in window ? Notification.permission : 'N/A',
                    isReminder,
                    titleStartsWith: latest.title.substring(0, 15)
                });

                if (
                    'Notification' in window &&
                    Notification.permission === 'granted' &&
                    isReminder
                ) {
                    console.log('[ToastListener] 🔔 Triggering browser push notification!');

                    // Use Notification API directly (more reliable than SW)
                    try {
                        const notif = new Notification(latest.title, {
                            body: latest.message,
                            icon: '/vite.svg',
                            tag: latest.id,
                            requireInteraction: true // Keep notification visible
                        });
                        console.log('[ToastListener] ✅ Notification created successfully');

                        notif.onclick = () => {
                            window.focus();
                            notif.close();
                        };
                    } catch (e) {
                        console.error('[ToastListener] Direct notification failed, trying SW:', e);
                        // Fallback to service worker
                        if ('serviceWorker' in navigator) {
                            navigator.serviceWorker.ready.then(registration => {
                                registration.showNotification(latest.title, {
                                    body: latest.message,
                                    icon: '/vite.svg',
                                    tag: latest.id
                                });
                            }).catch(err => console.error('[ToastListener] SW notification also failed:', err));
                        }
                    }
                }
            }
        }
    }, [notifications, showToast]);

    return null;
}

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

            if (latest.id !== lastNotifiedId.current) {
                lastNotifiedId.current = latest.id;

                // Trigger in-app toast only — browser push notifications
                // are handled by the service worker via web-push from the server.
                // Creating Notification() here would cause duplicates.
                showToast(latest.message, latest.type as any, {
                    duration: latest.type === 'error' ? 6000 : 4000
                });
            }
        }
    }, [notifications, showToast]);

    return null;
}

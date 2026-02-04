import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * Local Scheduler Hook (In-Page Notification Scheduler)
 * Uses Web Notifications API for scheduled reminders
 * Updated to use simplified scheduled_at / remind_before fields
 */
export function useLocalScheduler() {
    const { items, tasks } = useAppStore();
    const scheduledTimers = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        // Request permission for notifications
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const scheduleLocalNotification = (id: string, title: string, scheduledAt: string, remindBefore: number | null, type: 'item' | 'task') => {
            // Calculate when to trigger the notification
            const scheduledTime = new Date(scheduledAt).getTime();
            const reminderOffset = remindBefore ? remindBefore * 60 * 1000 : 0;
            const triggerTime = scheduledTime - reminderOffset;
            const now = Date.now();
            const delay = triggerTime - now;

            if (delay > 0 && delay < 86400000) { // Only if within 24 hours
                // Clear existing timer for this ID
                if (scheduledTimers.current.has(id)) {
                    clearTimeout(scheduledTimers.current.get(id)!);
                }

                const timerId = setTimeout(() => {
                    if (Notification.permission === 'granted') {
                        new Notification(title, {
                            body: `Scheduled ${type === 'task' ? 'task' : 'item'} reminder`,
                            icon: '/icon.png',
                            tag: `stash-${id}`,
                            data: { id, type }
                        });
                    }
                }, delay);

                scheduledTimers.current.set(id, timerId);
            }
        };

        // Scan Items - use scheduled_at and remind_before
        items.forEach(item => {
            if (item.scheduled_at && !item.is_completed && !item.deleted_at) {
                scheduleLocalNotification(item.id, item.title, item.scheduled_at, item.remind_before, 'item');
            }
        });

        // Scan Tasks - use scheduled_at and remind_before
        tasks.forEach(task => {
            if (task.scheduled_at && !task.is_completed && !task.deleted_at) {
                scheduleLocalNotification(task.id, task.title, task.scheduled_at, task.remind_before, 'task');
            }
        });

        // Cleanup on unmount
        return () => {
            scheduledTimers.current.forEach(timer => clearTimeout(timer));
            scheduledTimers.current.clear();
        };

    }, [items, tasks]); // Re-run whenever items/tasks change (e.g. sync or edit)
}

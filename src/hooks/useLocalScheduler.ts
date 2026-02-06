import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * Local Scheduler Hook (In-Page Notification Scheduler)
 * Uses Web Notifications API for scheduled reminders
 * Provides rich, actionable notifications matching Google Calendar quality
 */
export function useLocalScheduler() {
    const { items, tasks } = useAppStore();
    const scheduledTimers = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        // Request permission for notifications
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const formatRelativeTime = (scheduledAt: string): string => {
            const scheduled = new Date(scheduledAt);
            const now = new Date();
            const diffMs = scheduled.getTime() - now.getTime();
            const diffMin = Math.round(diffMs / 60000);

            if (diffMin <= 0) return 'now';
            if (diffMin < 60) return `in ${diffMin} min`;
            const hours = Math.floor(diffMin / 60);
            const mins = diffMin % 60;
            if (hours < 24) return mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`;
            return `on ${scheduled.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        };

        const formatTime = (dateStr: string): string => {
            const d = new Date(dateStr);
            return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        };

        const getPriorityEmoji = (priority: string | undefined): string => {
            switch (priority) {
                case 'high': return '🔴 ';
                case 'medium': return '🟡 ';
                case 'low': return '🔵 ';
                default: return '';
            }
        };

        const scheduleLocalNotification = (
            id: string,
            title: string,
            scheduledAt: string,
            remindBefore: number | null,
            type: 'item' | 'task',
            extra?: { priority?: string; description?: string; itemType?: string }
        ) => {
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
                        const priorityPrefix = getPriorityEmoji(extra?.priority);
                        const timeStr = formatTime(scheduledAt);
                        const relativeStr = formatRelativeTime(scheduledAt);

                        // Build rich notification body
                        const bodyParts: string[] = [];

                        if (type === 'task') {
                            bodyParts.push(`📋 Task due ${relativeStr} at ${timeStr}`);
                        } else {
                            const typeEmoji = extra?.itemType === 'link' ? '🔗' : extra?.itemType === 'file' ? '📎' : extra?.itemType === 'image' ? '🖼️' : '📝';
                            bodyParts.push(`${typeEmoji} Scheduled ${relativeStr} at ${timeStr}`);
                        }

                        if (extra?.description) {
                            bodyParts.push(extra.description.substring(0, 100));
                        }

                        if (remindBefore && remindBefore > 0) {
                            bodyParts.push(`⏰ ${remindBefore}min early reminder`);
                        }

                        new Notification(`${priorityPrefix}${title}`, {
                            body: bodyParts.join('\n'),
                            icon: '/icon.png',
                            badge: '/icon.png',
                            tag: `stash-${id}`,
                            data: { id, type },
                            requireInteraction: extra?.priority === 'high',
                        } as NotificationOptions);
                    }
                }, delay);

                scheduledTimers.current.set(id, timerId);
            }
        };

        // Scan Items - use scheduled_at and remind_before
        items.forEach(item => {
            if (item.scheduled_at && !item.is_completed && !item.deleted_at) {
                scheduleLocalNotification(
                    item.id,
                    item.title,
                    item.scheduled_at,
                    item.remind_before,
                    'item',
                    {
                        priority: item.priority,
                        description: item.type === 'note' ? (item.content as any)?.text?.substring(0, 100) : undefined,
                        itemType: item.type
                    }
                );
            }
        });

        // Scan Tasks - use scheduled_at and remind_before
        tasks.forEach(task => {
            if (task.scheduled_at && !task.is_completed && !task.deleted_at) {
                scheduleLocalNotification(
                    task.id,
                    task.title,
                    task.scheduled_at,
                    task.remind_before,
                    'task',
                    {
                        priority: task.priority,
                        description: task.description || undefined
                    }
                );
            }
        });

        // Cleanup on unmount
        return () => {
            scheduledTimers.current.forEach(timer => clearTimeout(timer));
            scheduledTimers.current.clear();
        };

    }, [items, tasks]); // Re-run whenever items/tasks change (e.g. sync or edit)
}

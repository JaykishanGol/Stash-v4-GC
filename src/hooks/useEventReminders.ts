/**
 * useEventReminders — In-app popup notifications for upcoming events
 * 
 * Periodically checks calendarEvents for reminders that should fire.
 * Shows browser Notification API popups (with permission) and/or
 * in-app toast notifications.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { CalendarEvent } from '../lib/types';

/** Track which reminders we've already fired so we don't double-notify.
 *  Uses a Map with timestamp for proper eviction instead of clearing all at once. */
const firedReminders = new Map<string, number>();

export function useEventReminders() {
    const calendarEvents = useAppStore((s) => s.calendarEvents);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Request notification permission on mount
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    const checkReminders = useCallback(() => {
        const now = Date.now();

        for (const event of calendarEvents) {
            if (!event.reminders || event.reminders.length === 0) continue;
            if (event.deleted_at || event.is_deleted_instance) continue;

            const eventStart = new Date(event.start_at).getTime();

            for (const reminder of event.reminders) {
                const reminderTime = eventStart - reminder.minutes * 60 * 1000;
                const key = `${event.id}:${reminder.minutes}`;

                // Fire if we're within 30s of the reminder time and haven't fired yet
                if (
                    reminderTime <= now &&
                    reminderTime > now - 30000 &&
                    !firedReminders.has(key)
                ) {
                    firedReminders.set(key, now);
                    showNotification(event, reminder.minutes);
                }
            }
        }

        // Evict entries older than 1 hour (instead of clearing everything)
        if (firedReminders.size > 200) {
            const oneHourAgo = now - 60 * 60 * 1000;
            for (const [key, timestamp] of firedReminders) {
                if (timestamp < oneHourAgo) {
                    firedReminders.delete(key);
                }
            }
        }
    }, [calendarEvents]);

    useEffect(() => {
        // Check every 15 seconds
        intervalRef.current = setInterval(checkReminders, 15000);
        // Also check immediately
        checkReminders();

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [checkReminders]);
}

function showNotification(event: CalendarEvent, minutesBefore: number) {
    const title = event.title || '(No title)';
    const timeStr = new Date(event.start_at).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
    });

    const body = minutesBefore === 0
        ? `Starting now at ${timeStr}`
        : `In ${formatMinutes(minutesBefore)} at ${timeStr}`;

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            const n = new Notification(title, {
                body,
                icon: '/favicon.ico',
                tag: `event-${event.id}`,
                requireInteraction: false,
            });
            // Auto-close after 10 seconds
            setTimeout(() => n.close(), 10000);
        } catch {
            // Notifications may not be available in all contexts
        }
    }

    // Also add to the in-app notification store
    try {
        const store = useAppStore.getState();
        if (store.addNotification) {
            store.addNotification('info', `📅 ${title}`, body);
        }
    } catch {
        // Store might not have addNotification
    }
}

function formatMinutes(mins: number): string {
    if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''}`;
    const hours = Math.floor(mins / 60);
    const remaining = mins % 60;
    if (remaining === 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
    return `${hours}h ${remaining}m`;
}

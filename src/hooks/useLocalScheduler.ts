import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * OFFLINE WATCHDOG
 * 
 * This hook runs locally in the browser.
 * It scans for upcoming reminders (next 24h) and schedules local timers.
 * This ensures that if the user goes offline, they still get the "ding" 
 * as long as the app tab is open.
 */
export function useLocalScheduler() {
    const { items, tasks } = useAppStore();
    const scheduledTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    useEffect(() => {
        // Clear all existing timers to avoid duplicates on re-render
        scheduledTimers.current.forEach(timer => clearTimeout(timer));
        scheduledTimers.current.clear();

        if (!('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;

        const now = new Date().getTime();
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

        const scheduleLocalNotification = (id: string, title: string, triggerAt: string, type: 'item' | 'task') => {
            const triggerTime = new Date(triggerAt).getTime();
            const delay = triggerTime - now;

            // Only schedule if it's in the future AND within 24 hours
            if (delay > 0 && delay < TWENTY_FOUR_HOURS) {
                // console.log(`[LocalScheduler] Scheduling "${title}" in ${Math.round(delay/1000)}s`);
                
                const timerId = setTimeout(() => {
                    // Double check permission at trigger time
                    if (Notification.permission === 'granted') {
                        // Fire Local Browser Notification
                        new Notification(type === 'task' ? `Task Due: ${title}` : `Reminder: ${title}`, {
                            body: 'You have a scheduled item due now (Offline Backup)',
                            icon: '/vite.svg',
                            tag: id // Prevents duplicate if server push arrives same time
                        });
                        
                        // Optional: Play sound
                        // const audio = new Audio('/notification.mp3');
                        // audio.play().catch(e => console.log('Audio play failed', e));
                    }
                }, delay);

                scheduledTimers.current.set(id, timerId);
            }
        };

        // Scan Items
        items.forEach(item => {
            if (item.next_trigger_at && !item.is_completed && !item.deleted_at) {
                // Check if already acknowledged for this time
                const lastAck = item.last_acknowledged_at ? new Date(item.last_acknowledged_at).getTime() : 0;
                const nextTrig = new Date(item.next_trigger_at).getTime();
                
                if (lastAck < nextTrig) {
                    scheduleLocalNotification(item.id, item.title, item.next_trigger_at, 'item');
                }
            }
        });

        // Scan Tasks
        tasks.forEach(task => {
            if (task.next_trigger_at && !task.is_completed && !task.deleted_at) {
                const lastAck = task.last_acknowledged_at ? new Date(task.last_acknowledged_at).getTime() : 0;
                const nextTrig = new Date(task.next_trigger_at).getTime();
                
                if (lastAck < nextTrig) {
                    scheduleLocalNotification(task.id, task.title, task.next_trigger_at, 'task');
                }
            }
        });

        // Cleanup on unmount
        return () => {
            scheduledTimers.current.forEach(timer => clearTimeout(timer));
            scheduledTimers.current.clear();
        };

    }, [items, tasks]); // Re-run whenever items/tasks change (e.g. sync or edit)
}

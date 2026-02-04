import { useState, useEffect, useCallback } from 'react';
import { startOfMonth, startOfWeek, isSameDay } from 'date-fns';
import { useAppStore } from '../store/useAppStore';
import { GoogleClient, type GoogleEvent, type GoogleTask } from '../lib/googleClient';
import { supabase } from '../lib/supabase';
import type { Item, Task } from '../lib/types';

export interface CalendarEntry {
    id: string;
    title: string;
    start: Date;
    end?: Date;
    allDay: boolean;
    type: 'item' | 'task' | 'google-event' | 'google-task';
    color?: string;
    sourceType?: string; // note, file, image etc for items
    originalData?: Item | Task | GoogleEvent | GoogleTask;
    isGhost?: boolean; // True if not in local DB
}

export function useGoogleCalendar(viewDate: Date) {
    const { items, tasks } = useAppStore();
    const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([]);
    const [googleTasks, setGoogleTasks] = useState<GoogleTask[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchGoogleData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session?.provider_token) {
                setGoogleEvents([]);
                setGoogleTasks([]);
                return;
            }

            // Calculate range for current view (Month view buffer)
            const monthStart = startOfMonth(viewDate);
            const start = startOfWeek(monthStart).toISOString();

            // Fetch Events (Ghost Events)
            const { items: events } = await GoogleClient.listEvents('primary', {
                timeMin: start,
                maxResults: 250
            });
            setGoogleEvents(events);

            // Fetch Tasks (Ghost Tasks)
            // Note: Google Tasks API doesn't support date filtering easily, so we fetch default list
            const tasks = await GoogleClient.listAllTasks('@default');
            setGoogleTasks(tasks);

        } catch (err: any) {
            console.error('[useGoogleCalendar] Fetch failed:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [viewDate]);

    // Initial Fetch
    useEffect(() => {
        fetchGoogleData();
    }, [fetchGoogleData]);

    /**
     * Get unified entries for a specific date
     */
    const getEntriesForDate = useCallback((date: Date): CalendarEntry[] => {
        const entries: CalendarEntry[] = [];

        // 1. Local Items
        items.forEach(item => {
            if (item.deleted_at) return;
            const dateStr = item.scheduled_at;
            if (dateStr && isSameDay(new Date(dateStr), date)) {
                entries.push({
                    id: item.id,
                    title: item.title,
                    start: new Date(dateStr),
                    allDay: !dateStr.includes('T') || dateStr.endsWith('T00:00:00'),
                    type: 'item',
                    sourceType: item.type,
                    color: getItemColor(item.type),
                    originalData: item
                });
            }
        });

        // 2. Local Tasks
        tasks.forEach(task => {
            if (task.deleted_at) return;
            const dateStr = task.scheduled_at;
            if (dateStr && isSameDay(new Date(dateStr), date)) {
                entries.push({
                    id: task.id,
                    title: task.title,
                    start: new Date(dateStr),
                    allDay: true, // Default to all day unless time specified
                    type: 'task',
                    color: '#10B981', // Emerald
                    originalData: task
                });
            }
        });

        // 3. Google Calendar Events (Ghost)
        googleEvents.forEach(event => {
            const startStr = event.start.dateTime || event.start.date;
            const endStr = event.end.dateTime || event.end.date;

            if (!startStr) return;

            const eventStart = new Date(startStr);
            const eventEnd = endStr ? new Date(endStr) : undefined;

            // Simple check: does it start on this day?
            // (For multi-day events, this needs fancier logic, but good for MVP)
            if (isSameDay(eventStart, date)) {
                entries.push({
                    id: event.id,
                    title: event.summary || '(No Title)',
                    start: eventStart,
                    end: eventEnd,
                    allDay: !!event.start.date, // If date-only, it's all day
                    type: 'google-event',
                    color: '#4285F4', // Google Blue
                    isGhost: true,
                    originalData: event
                });
            }
        });

        // 4. Google Tasks (Ghost)
        googleTasks.forEach(task => {
            if (!task.due) return;
            const taskDate = new Date(task.due);

            if (isSameDay(taskDate, date)) {
                entries.push({
                    id: task.id,
                    title: task.title,
                    start: taskDate,
                    allDay: true,
                    type: 'google-task',
                    color: '#4285F4',
                    isGhost: true,
                    originalData: task
                });
            }
        });

        // Sort by time
        return entries.sort((a, b) => {
            if (a.allDay && !b.allDay) return -1;
            if (!a.allDay && b.allDay) return 1;
            return a.start.getTime() - b.start.getTime();
        });
    }, [items, tasks, googleEvents, googleTasks]);

    return {
        isLoading,
        error,
        refresh: fetchGoogleData,
        getEntriesForDate
    };
}

function getItemColor(type: string) {
    switch (type) {
        case 'note': return '#F87171'; // Red
        case 'file': return '#60A5FA'; // Blue
        case 'image': return '#FBBF24'; // Amber
        case 'link': return '#A78BFA'; // Purple
        case 'folder': return '#6366F1'; // Indigo
        default: return '#6B7280'; // Gray
    }
}

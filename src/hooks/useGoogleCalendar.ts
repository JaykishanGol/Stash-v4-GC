import { useState, useEffect, useCallback } from 'react';
import { startOfMonth, startOfWeek, isSameDay, isWithinInterval, startOfDay } from 'date-fns';
import { useAppStore } from '../store/useAppStore';
import { GoogleClient, isNoGoogleAccessTokenError, type GoogleEvent, type GoogleTask } from '../lib/googleClient';
import { hasStoredGoogleConnection } from '../lib/googleTokenService';
import type { Item, Task, EventContent } from '../lib/types';

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
    // Rich metadata for Google events
    location?: string;
    description?: string;
    meetLink?: string;
    attendees?: { email: string; responseStatus?: string }[];
    status?: string; // confirmed, tentative, cancelled
    isCompleted?: boolean;
    priority?: string;
    remindBefore?: number | null;
    htmlLink?: string; // Link to open in Google Calendar
    source?: 'local' | 'google';
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
        console.log('[useGoogleCalendar] Starting fetch for viewDate:', viewDate);

        try {
            // Check if user has Google connected (stored refresh token in DB)
            const hasConnection = await hasStoredGoogleConnection();
            console.log('[useGoogleCalendar] hasConnection:', hasConnection);

            if (!hasConnection) {
                console.log('[useGoogleCalendar] No Google connection found - skipping fetch');
                setGoogleEvents([]);
                setGoogleTasks([]);
                return;
            }

            // Calculate range for current view (Month view buffer)
            const monthStart = startOfMonth(viewDate);
            const start = startOfWeek(monthStart).toISOString();
            console.log('[useGoogleCalendar] Fetching events from:', start);

            // Fetch Events (Ghost Events)
            const { items: events } = await GoogleClient.listEvents('primary', {
                timeMin: start,
                maxResults: 250
            });
            console.log('[useGoogleCalendar] Fetched', events.length, 'Google events');
            setGoogleEvents(events);

            // Fetch Tasks (Ghost Tasks)
            // Note: Google Tasks API doesn't support date filtering easily, so we fetch default list
            const fetchedTasks = await GoogleClient.listAllTasks('@default');
            console.log('[useGoogleCalendar] Fetched', fetchedTasks.length, 'Google tasks');
            setGoogleTasks(fetchedTasks);

        } catch (err: unknown) {
            if (!isNoGoogleAccessTokenError(err)) {
                console.error('[useGoogleCalendar] Fetch failed:', err);
            }
            setError(err instanceof Error ? err.message : 'Google calendar fetch failed');
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

        // 1. Local Items (including events)
        items.forEach(item => {
            if (item.deleted_at) return;
            const dateStr = item.scheduled_at;
            if (!dateStr) return;

            // Handle event-type items specially (they have end_time and event metadata)
            if (item.type === 'event') {
                const eventContent = item.content as EventContent;
                const eventStart = new Date(dateStr);
                const eventEnd = eventContent.end_time ? new Date(eventContent.end_time) : undefined;
                const isAllDay = eventContent.is_all_day || (!dateStr.includes('T') || dateStr.endsWith('T00:00:00'));

                // Multi-day support
                let showOnDate = false;
                if (eventEnd && eventEnd.getTime() > eventStart.getTime()) {
                    const effectiveEnd = isAllDay
                        ? new Date(eventEnd.getTime() - 86400000)
                        : eventEnd;
                    showOnDate = isWithinInterval(startOfDay(date), {
                        start: startOfDay(eventStart),
                        end: startOfDay(effectiveEnd)
                    });
                } else {
                    showOnDate = isSameDay(eventStart, date);
                }

                if (showOnDate) {
                    entries.push({
                        id: item.id,
                        title: item.title,
                        start: eventStart,
                        end: eventEnd,
                        allDay: isAllDay,
                        type: 'item',
                        sourceType: 'event',
                        color: eventContent.color_id ? getGoogleColor(eventContent.color_id) : '#4285F4',
                        originalData: item,
                        isCompleted: item.is_completed,
                        priority: item.priority,
                        remindBefore: item.remind_before,
                        description: eventContent.description,
                        location: eventContent.location,
                        meetLink: eventContent.meet_link,
                        attendees: eventContent.attendees?.map(email => ({ email })),
                        source: 'local'
                    });
                }
                return;
            }

            // Regular items (note, link, file, image, folder)
            if (isSameDay(new Date(dateStr), date)) {
                entries.push({
                    id: item.id,
                    title: item.title,
                    start: new Date(dateStr),
                    allDay: !dateStr.includes('T') || dateStr.endsWith('T00:00:00'),
                    type: 'item',
                    sourceType: item.type,
                    color: getItemColor(item.type),
                    originalData: item,
                    isCompleted: item.is_completed,
                    priority: item.priority,
                    remindBefore: item.remind_before,
                    description: item.type === 'note' ? (item.content as any)?.text : undefined,
                    source: 'local'
                });
            }
        });

        // 2. Local Tasks
        tasks.forEach(task => {
            if (task.deleted_at) return;
            const dateStr = task.scheduled_at;
            if (dateStr && isSameDay(new Date(dateStr), date)) {
                const hasTime = dateStr.includes('T') && !dateStr.endsWith('T00:00:00');
                entries.push({
                    id: task.id,
                    title: task.title,
                    start: new Date(dateStr),
                    allDay: !hasTime,
                    type: 'task',
                    color: '#10B981', // Emerald
                    originalData: task,
                    isCompleted: task.is_completed,
                    priority: task.priority,
                    remindBefore: task.remind_before,
                    description: task.description || undefined,
                    source: 'local'
                });
            }
        });

        // 3. Google Calendar Events (Ghost) - with multi-day support
        googleEvents.forEach(event => {
            if (event.status === 'cancelled') return;

            const startStr = event.start.dateTime || event.start.date;
            const endStr = event.end.dateTime || event.end.date;

            if (!startStr) return;

            const eventStart = new Date(startStr);
            const eventEnd = endStr ? new Date(endStr) : undefined;
            const isAllDay = !!event.start.date;

            // Multi-day support: check if event spans this date
            let showOnDate = false;
            if (eventEnd && eventEnd.getTime() > eventStart.getTime()) {
                // For all-day events, Google uses exclusive end date
                const effectiveEnd = isAllDay
                    ? new Date(eventEnd.getTime() - 86400000) // subtract 1 day for exclusive end
                    : eventEnd;
                showOnDate = isWithinInterval(startOfDay(date), {
                    start: startOfDay(eventStart),
                    end: startOfDay(effectiveEnd)
                });
            } else {
                showOnDate = isSameDay(eventStart, date);
            }

            if (showOnDate) {
                // Extract Google Meet link
                let meetLink: string | undefined;
                if (event.conferenceData?.entryPoints) {
                    const videoEntry = event.conferenceData.entryPoints.find(
                        ep => ep.entryPointType === 'video'
                    );
                    meetLink = videoEntry?.uri;
                }

                entries.push({
                    id: event.id,
                    title: event.summary || '(No Title)',
                    start: eventStart,
                    end: eventEnd,
                    allDay: isAllDay,
                    type: 'google-event',
                    color: '#4285F4', // Google Blue
                    isGhost: true,
                    originalData: event,
                    location: event.location,
                    description: event.description,
                    meetLink,
                    attendees: event.attendees,
                    status: event.status,
                    source: 'google',
                    htmlLink: event.htmlLink || `https://calendar.google.com/calendar/event?eid=${btoa(event.id + ' primary')}`,
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
                    originalData: task,
                    isCompleted: task.status === 'completed',
                    description: task.notes,
                    source: 'google'
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
        case 'event': return '#4285F4'; // Google Blue
        default: return '#6B7280'; // Gray
    }
}

const GOOGLE_COLOR_MAP: Record<string, string> = {
    '1': '#7986cb', '2': '#33b679', '3': '#8e24aa',
    '4': '#e67c73', '5': '#f6c026', '6': '#f5511d',
    '7': '#039be5', '8': '#616161', '9': '#3f51b5',
    '10': '#0b8043', '11': '#d60000'
};

function getGoogleColor(colorId: string): string {
    return GOOGLE_COLOR_MAP[colorId] || '#4285F4';
}

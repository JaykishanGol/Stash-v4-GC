/**
 * Event Slice
 *
 * Manages CalendarEvent state for the Google Calendar clone.
 * Handles CRUD with RFC 5545 recurrence edit modes:
 *   - 'all': Update/delete the series master directly
 *   - 'this': Create an exception row (modified/deleted instance)
 *   - 'following': Split the series (old series gets UNTIL, new master starts)
 */
import type { StateCreator } from 'zustand';
import type { AppState } from '../types';
import type { CalendarEvent, RecurrenceEditMode } from '../../lib/types';
import { addUntilToRRule } from '../../lib/eventExpander';
import { scheduleSync } from '../../lib/sync';

export interface EventSlice {
    // State
    calendarEvents: CalendarEvent[];
    isEventsLoading: boolean;

    // CRUD
    loadEvents: () => Promise<void>;
    addEvent: (event: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>) => Promise<CalendarEvent>;
    updateEvent: (
        id: string,
        updates: Partial<CalendarEvent>,
        mode: RecurrenceEditMode,
        /** For 'this'/'following' mode: the original occurrence date ISO string */
        originalStart?: string
    ) => Promise<void>;
    deleteEvent: (
        id: string,
        mode: RecurrenceEditMode,
        /** For 'this'/'following' mode: the original occurrence date ISO string */
        originalStart?: string
    ) => Promise<void>;
    syncEventToDb: (event: CalendarEvent) => Promise<void>;
    deleteEventFromDb: (id: string) => Promise<void>;
}

export const createEventSlice: StateCreator<AppState, [], [], EventSlice> = (set, get) => ({
    calendarEvents: [],
    isEventsLoading: false,

    loadEvents: async () => {
        const { user } = get();
        if (!user) return;

        set({ isEventsLoading: true });

        try {
            const { supabase, isSupabaseConfigured } = await import('../../lib/supabase');
            if (!isSupabaseConfigured()) {
                // In demo mode, keep any locally-created events intact
                set({ isEventsLoading: false });
                console.log('[EventSlice] Demo mode — preserving', get().calendarEvents.length, 'local events');
                return;
            }

            // Paginate to load ALL events (Supabase default limit is 1000)
            const PAGE_SIZE = 1000;
            let allData: any[] = [];
            let from = 0;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('events')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('start_at', { ascending: true })
                    .range(from, from + PAGE_SIZE - 1);

                if (error) {
                    console.error('[EventSlice] Load error:', error);
                    set({ isEventsLoading: false });
                    return;
                }

                allData = allData.concat(data || []);
                hasMore = (data?.length ?? 0) === PAGE_SIZE;
                from += PAGE_SIZE;
            }

            const { adaptEventRows } = await import('../../lib/eventAdapters');
            const events = adaptEventRows(allData);

            // Smart merge: preserve unsynced local events
            const local = get().calendarEvents.filter(e => e.is_unsynced);
            const serverIds = new Set(events.map(e => e.id));
            const merged = [...events];
            for (const localEv of local) {
                if (!serverIds.has(localEv.id)) {
                    merged.push(localEv);
                }
            }

            set({ calendarEvents: merged, isEventsLoading: false });
            console.log(`[EventSlice] Loaded ${events.length} events from DB, ${merged.length} after merge`);
        } catch (err) {
            console.error('[EventSlice] Load failed:', err);
            set({ isEventsLoading: false });
            get().addNotification?.('error', 'Calendar Error', 'Could not load calendar events.');
        }
    },

    addEvent: async (eventData) => {
        const { generateId } = await import('../../lib/utils');
        const now = new Date().toISOString();

        const newEvent: CalendarEvent = {
            id: generateId(),
            created_at: now,
            updated_at: now,
            ...eventData,
            is_unsynced: true,
        };

        set(state => ({
            calendarEvents: [newEvent, ...state.calendarEvents],
        }));

        get().syncEventToDb(newEvent);
        scheduleSync();
        return newEvent;
    },

    updateEvent: async (id, updates, mode, originalStart) => {
        const events = get().calendarEvents;
        const target = events.find(e => e.id === id);

        if (!target) {
            console.warn('[EventSlice] Event not found:', id);
            return;
        }

        switch (mode) {
            case 'all': {
                // Update the event (or master) directly
                const masterId = target.parent_event_id || target.id;
                const master = events.find(e => e.id === masterId) || target;

                const updated: CalendarEvent = {
                    ...master,
                    ...updates,
                    updated_at: new Date().toISOString(),
                    is_unsynced: true,
                };

                set(state => ({
                    calendarEvents: state.calendarEvents.map(e =>
                        e.id === masterId ? updated : e
                    ),
                }));

                get().syncEventToDb(updated);
                scheduleSync();
                break;
            }

            case 'this': {
                // Create an exception row
                if (!originalStart) {
                    console.error('[EventSlice] originalStart required for "this" mode');
                    return;
                }

                const masterId = target.parent_event_id || target.id;
                const master = events.find(e => e.id === masterId) || target;
                const { generateId } = await import('../../lib/utils');
                const now = new Date().toISOString();

                // If the target is already an exception, just update it
                if (target.parent_event_id) {
                    const updated: CalendarEvent = {
                        ...target,
                        ...updates,
                        updated_at: now,
                        is_unsynced: true,
                    };
                    set(state => ({
                        calendarEvents: state.calendarEvents.map(e =>
                            e.id === target.id ? updated : e
                        ),
                    }));
                    get().syncEventToDb(updated);
                    scheduleSync();
                    return;
                }

                // Create new exception event
                const exception: CalendarEvent = {
                    ...master,
                    ...updates,
                    id: generateId(),
                    parent_event_id: masterId,
                    recurring_event_id: originalStart,
                    rrule: null, // Exceptions don't recur
                    is_deleted_instance: false,
                    created_at: now,
                    updated_at: now,
                    is_unsynced: true,
                };

                set(state => ({
                    calendarEvents: [...state.calendarEvents, exception],
                }));

                get().syncEventToDb(exception);
                scheduleSync();
                break;
            }

            case 'following': {
                // Split the series:
                // 1. Old master gets UNTIL = day before originalStart
                // 2. New master starts at originalStart with updates

                if (!originalStart) {
                    console.error('[EventSlice] originalStart required for "following" mode');
                    return;
                }

                const masterId = target.parent_event_id || target.id;
                const master = events.find(e => e.id === masterId) || target;

                if (!master.rrule) {
                    // Not recurring — just update directly
                    const updated: CalendarEvent = {
                        ...master,
                        ...updates,
                        updated_at: new Date().toISOString(),
                        is_unsynced: true,
                    };
                    set(state => ({
                        calendarEvents: state.calendarEvents.map(e =>
                            e.id === masterId ? updated : e
                        ),
                    }));
                    get().syncEventToDb(updated);
                    scheduleSync();
                    return;
                }

                const { generateId } = await import('../../lib/utils');
                const now = new Date().toISOString();
                const splitDate = new Date(originalStart);

                // 1. Stop old series
                const oldRRule = addUntilToRRule(master.rrule, splitDate);
                const updatedMaster: CalendarEvent = {
                    ...master,
                    rrule: oldRRule,
                    updated_at: now,
                    is_unsynced: true,
                };

                // 2. Create new master starting from split date
                const duration = new Date(master.end_at).getTime() - new Date(master.start_at).getTime();
                const newEnd = new Date(splitDate.getTime() + duration);

                const newMaster: CalendarEvent = {
                    ...master,
                    ...updates,
                    id: generateId(),
                    start_at: splitDate.toISOString(),
                    end_at: newEnd.toISOString(),
                    rrule: master.rrule, // Keep original rrule (without UNTIL)
                    parent_event_id: null,
                    recurring_event_id: null,
                    is_deleted_instance: false,
                    created_at: now,
                    updated_at: now,
                    is_unsynced: true,
                };

                set(state => ({
                    calendarEvents: [
                        ...state.calendarEvents.map(e =>
                            e.id === masterId ? updatedMaster : e
                        ),
                        newMaster,
                    ],
                }));

                get().syncEventToDb(updatedMaster);
                get().syncEventToDb(newMaster);
                scheduleSync();
                break;
            }
        }
    },

    deleteEvent: async (id, mode, originalStart) => {
        const events = get().calendarEvents;
        const target = events.find(e => e.id === id);

        if (!target) return;

        switch (mode) {
            case 'all': {
                const masterId = target.parent_event_id || target.id;
                const now = new Date().toISOString();

                set(state => ({
                    calendarEvents: state.calendarEvents.map(e => {
                        if (e.id === masterId || e.parent_event_id === masterId) {
                            return {
                                ...e,
                                deleted_at: now,
                                updated_at: now,
                                is_unsynced: true,
                            };
                        }
                        return e;
                    }),
                }));

                const affected = get().calendarEvents.filter(e => e.id === masterId || e.parent_event_id === masterId);
                affected.forEach(ev => {
                    get().syncEventToDb(ev);
                });
                scheduleSync();
                break;
            }

            case 'this': {
                if (!originalStart) return;

                const masterId = target.parent_event_id || target.id;

                // If target is already an exception, just remove it and mark as deleted
                if (target.parent_event_id) {
                    const updated: CalendarEvent = {
                        ...target,
                        is_deleted_instance: true,
                        updated_at: new Date().toISOString(),
                        is_unsynced: true,
                    };
                    set(state => ({
                        calendarEvents: state.calendarEvents.map(e =>
                            e.id === target.id ? updated : e
                        ),
                    }));
                    get().syncEventToDb(updated);
                    scheduleSync();
                    return;
                }

                // Create a "deleted instance" exception
                const { generateId } = await import('../../lib/utils');
                const now = new Date().toISOString();
                const master = events.find(e => e.id === masterId) || target;

                const deletedException: CalendarEvent = {
                    ...master,
                    id: generateId(),
                    parent_event_id: masterId,
                    recurring_event_id: originalStart,
                    rrule: null,
                    is_deleted_instance: true,
                    created_at: now,
                    updated_at: now,
                    is_unsynced: true,
                };

                set(state => ({
                    calendarEvents: [...state.calendarEvents, deletedException],
                }));

                get().syncEventToDb(deletedException);
                scheduleSync();
                break;
            }

            case 'following': {
                if (!originalStart) return;

                const masterId = target.parent_event_id || target.id;
                const master = events.find(e => e.id === masterId) || target;

                if (!master.rrule) {
                    // Not recurring — just delete it
                    set(state => ({
                        calendarEvents: state.calendarEvents.filter(e => e.id !== masterId),
                    }));
                    get().deleteEventFromDb(masterId);
                    return;
                }

                // Add UNTIL to stop the series before this date
                const splitDate = new Date(originalStart);
                const oldRRule = addUntilToRRule(master.rrule, splitDate);

                const updatedMaster: CalendarEvent = {
                    ...master,
                    rrule: oldRRule,
                    updated_at: new Date().toISOString(),
                    is_unsynced: true,
                };

                // Also remove any exceptions that are on or after the split date
                set(state => ({
                    calendarEvents: state.calendarEvents
                        .map(e => (e.id === masterId ? updatedMaster : e))
                        .filter(e => {
                            if (e.parent_event_id === masterId && e.recurring_event_id) {
                                return new Date(e.recurring_event_id) < splitDate;
                            }
                            return true;
                        }),
                }));

                get().syncEventToDb(updatedMaster);
                scheduleSync();
                break;
            }
        }
    },

    syncEventToDb: async (event) => {
        try {
            const { isSupabaseConfigured } = await import('../../lib/supabase');
            if (!isSupabaseConfigured()) return;

            const { persistentSyncQueue } = await import('../../lib/persistentQueue');
            const payload = {
                id: event.id,
                user_id: event.user_id,
                title: event.title,
                description: event.description,
                start_at: event.start_at,
                end_at: event.end_at,
                is_all_day: event.is_all_day,
                rrule: event.rrule,
                parent_event_id: event.parent_event_id,
                recurring_event_id: event.recurring_event_id,
                is_deleted_instance: event.is_deleted_instance,
                location: event.location,
                color_id: event.color_id,
                visibility: event.visibility,
                transparency: event.transparency,
                timezone: event.timezone,
                attendees: event.attendees,
                conference_data: event.conference_data,
                reminders: event.reminders,
                attachments: event.attachments,
                google_event_id: event.google_event_id,
                google_calendar_id: event.google_calendar_id,
                google_etag: event.google_etag ?? null,
                remote_updated_at: event.remote_updated_at ?? null,
                // Google Task fields
                is_google_task: event.is_google_task ?? false,
                google_task_id: event.google_task_id ?? null,
                google_task_list_id: event.google_task_list_id ?? null,
                is_completed: event.is_completed ?? false,
                completed_at: event.completed_at ?? null,
                sort_position: event.sort_position ?? null,
                // Source entity tracking
                source_entity_type: event.source_entity_type ?? null,
                source_entity_id: event.source_entity_id ?? null,
                is_unsynced: event.is_unsynced ?? true,
                created_at: event.created_at,
                updated_at: event.updated_at,
                deleted_at: event.deleted_at,
            };

            persistentSyncQueue.add('upsert-event', event.id, payload);

            // NOTE: Do NOT clear is_unsynced here.
            // The flag should only be cleared after sync succeeds
            // (via loadEvents() or Realtime reconciliation).
        } catch (err) {
            console.error('[EventSlice] Sync failed:', err);
        }
    },

    deleteEventFromDb: async (id) => {
        try {
            const { isSupabaseConfigured } = await import('../../lib/supabase');
            if (!isSupabaseConfigured()) return;

            const { persistentSyncQueue } = await import('../../lib/persistentQueue');
            persistentSyncQueue.add('delete-event', id, { id });
        } catch (err) {
            console.error('[EventSlice] Delete failed:', err);
        }
    },
});

import { useEffect, useRef } from 'react';
import type { RealtimePostgresChangesPayload, RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import type { Tables } from '../lib/database.types';
import { adaptItemRow, adaptTaskRow, adaptListRow } from '../lib/dbAdapters';
import { tombstoneManager } from '../lib/tombstones';

type ItemRow = Tables<'items'>;
type TaskRow = Tables<'tasks'>;
type ListRow = Tables<'lists'>;

/** Max reconnection attempts before giving up */
const MAX_RETRIES = 10;
/** Base delay for exponential backoff (ms) */
const BASE_DELAY = 1000;

export function useRealtimeSubscription() {
    const user = useAppStore((s) => s.user);
    const retryCount = useRef(0);
    const channelRef = useRef<RealtimeChannel | null>(null);

    useEffect(() => {
        if (!user || user.id === 'demo') return;

        function subscribe() {
            // Clean up previous channel if any
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }

            const channel = supabase.channel('db-changes')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'items',
                        filter: `user_id=eq.${user!.id}`
                    },
                    (payload: RealtimePostgresChangesPayload<ItemRow>) => {
                        const { eventType, new: newItem, old: oldItem } = payload;
                        const store = useAppStore.getState();

                        if (eventType === 'INSERT') {
                            // Prevent resurrection of tombstoned items
                            if (tombstoneManager.has(newItem.id)) return;
                            const exists = store.items.some(i => i.id === newItem.id);
                            if (!exists) {
                                const adaptedItem = adaptItemRow(newItem);
                                useAppStore.setState(state => ({
                                    items: [adaptedItem, ...state.items]
                                }));
                                store.calculateStats();
                            }
                        } else if (eventType === 'UPDATE') {
                            const adaptedItem = adaptItemRow(newItem);
                            useAppStore.setState(state => ({
                                items: state.items.map(i => i.id === newItem.id ? adaptedItem : i)
                            }));
                            store.calculateStats();
                        } else if (eventType === 'DELETE') {
                            useAppStore.setState(state => ({
                                items: state.items.filter(i => i.id !== oldItem.id),
                                trashedItems: state.trashedItems.filter(i => i.id !== oldItem.id)
                            }));
                            store.calculateStats();
                        }
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'tasks',
                        filter: `user_id=eq.${user!.id}`
                    },
                    (payload: RealtimePostgresChangesPayload<TaskRow>) => {
                        const { eventType, new: newTask, old: oldTask } = payload;
                        const store = useAppStore.getState();

                        if (eventType === 'INSERT') {
                            const exists = store.tasks.some(t => t.id === newTask.id);
                            if (!exists) {
                                const adaptedTask = adaptTaskRow(newTask);
                                useAppStore.setState(state => ({
                                    tasks: [adaptedTask, ...state.tasks]
                                }));
                                store.calculateStats();
                            }
                        } else if (eventType === 'UPDATE') {
                            const adaptedTask = adaptTaskRow(newTask);
                            useAppStore.setState(state => ({
                                tasks: state.tasks.map(t => t.id === newTask.id ? adaptedTask : t)
                            }));
                            store.calculateStats();
                        } else if (eventType === 'DELETE') {
                            useAppStore.setState(state => ({
                                tasks: state.tasks.filter(t => t.id !== oldTask.id)
                            }));
                            store.calculateStats();
                        }
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'lists',
                        filter: `user_id=eq.${user!.id}`
                    },
                    (payload: RealtimePostgresChangesPayload<ListRow>) => {
                        const { eventType, new: newList, old: oldList } = payload;

                        if (eventType === 'INSERT') {
                            const adaptedList = adaptListRow(newList);
                            useAppStore.setState(state => ({
                                lists: [...state.lists, adaptedList]
                            }));
                        } else if (eventType === 'UPDATE') {
                            const adaptedList = adaptListRow(newList);
                            useAppStore.setState(state => ({
                                lists: state.lists.map(l => l.id === newList.id ? adaptedList : l)
                            }));
                        } else if (eventType === 'DELETE') {
                            useAppStore.setState(state => ({
                                lists: state.lists.filter(l => l.id !== oldList.id)
                            }));
                        }
                    }
                )
                .subscribe((status, err) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('[Realtime] Connected');
                        retryCount.current = 0; // reset on success
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        console.warn('[Realtime] Channel error/timeout:', status, err);
                        attemptReconnect();
                    } else if (status === 'CLOSED') {
                        console.log('[Realtime] Channel closed');
                    }
                });

            channelRef.current = channel;
        }

        function attemptReconnect() {
            if (retryCount.current >= MAX_RETRIES) {
                console.error('[Realtime] Max retries reached, giving up');
                return;
            }
            const delay = Math.min(
                BASE_DELAY * Math.pow(2, retryCount.current) + Math.random() * 500,
                30000
            );
            retryCount.current++;
            console.log(`[Realtime] Reconnecting in ${Math.round(delay)}ms (attempt ${retryCount.current}/${MAX_RETRIES})`);
            setTimeout(subscribe, delay);
        }

        // Also reconnect when coming back online
        const handleOnline = () => {
            console.log('[Realtime] Network online -- reconnecting');
            retryCount.current = 0;
            subscribe();
        };
        window.addEventListener('online', handleOnline);

        subscribe();

        return () => {
            window.removeEventListener('online', handleOnline);
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [user]);
}
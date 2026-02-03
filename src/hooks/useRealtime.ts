import { useEffect } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import type { Tables } from '../lib/database.types';

type ItemRow = Tables<'items'>;
type TaskRow = Tables<'tasks'>;
type ListRow = Tables<'lists'>;

export function useRealtimeSubscription() {
    const { 
        user 
    } = useAppStore();

    useEffect(() => {
        if (!user || user.id === 'demo') return;

        console.log('[Realtime] Subscribing to changes for user:', user.id);

        const channel = supabase.channel('db-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'items',
                    filter: `user_id=eq.${user.id}`
                },
                (payload: RealtimePostgresChangesPayload<ItemRow>) => {
                    console.log('[Realtime] Item Change:', payload);
                    const { eventType, new: newItem, old: oldItem } = payload;
                    
                    const store = useAppStore.getState();

                    if (eventType === 'INSERT') {
                        const exists = store.items.some(i => i.id === newItem.id);
                        if (!exists) {
                            // Cast to any because DB JSON types don't perfectly match frontend strict interfaces
                            // but at least we know 'newItem' has the correct shape from the DB
                            useAppStore.setState(state => ({
                                items: [newItem as any, ...state.items]
                            }));
                            store.calculateStats();
                        }
                    } else if (eventType === 'UPDATE') {
                        useAppStore.setState(state => ({
                            items: state.items.map(i => i.id === newItem.id ? (newItem as any) : i)
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
                    filter: `user_id=eq.${user.id}`
                },
                (payload: RealtimePostgresChangesPayload<TaskRow>) => {
                     console.log('[Realtime] Task Change:', payload);
                     const { eventType, new: newTask, old: oldTask } = payload;
                     const store = useAppStore.getState();

                     if (eventType === 'INSERT') {
                         const exists = store.tasks.some(t => t.id === newTask.id);
                         if (!exists) {
                             useAppStore.setState(state => ({
                                 tasks: [newTask as any, ...state.tasks]
                             }));
                             store.calculateStats();
                         }
                     } else if (eventType === 'UPDATE') {
                         useAppStore.setState(state => ({
                             tasks: state.tasks.map(t => t.id === newTask.id ? (newTask as any) : t)
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
                    filter: `user_id=eq.${user.id}`
                },
                (payload: RealtimePostgresChangesPayload<ListRow>) => {
                     console.log('[Realtime] List Change:', payload);
                     const { eventType, new: newList, old: oldList } = payload;
                     
                     if (eventType === 'INSERT') {
                         useAppStore.setState(state => ({
                             lists: [...state.lists, newList as any]
                         }));
                     } else if (eventType === 'UPDATE') {
                         useAppStore.setState(state => ({
                             lists: state.lists.map(l => l.id === newList.id ? (newList as any) : l)
                         }));
                     } else if (eventType === 'DELETE') {
                         useAppStore.setState(state => ({
                             lists: state.lists.filter(l => l.id !== oldList.id)
                         }));
                     }
                }
            )
            .subscribe((status) => {
                console.log('[Realtime] Status:', status);
            });

        return () => {
            console.log('[Realtime] Unsubscribing...');
            supabase.removeChannel(channel);
        };
    }, [user]); 
}

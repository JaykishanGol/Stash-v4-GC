/**
 * Task Slice
 * 
 * Manages all task-related state and actions, extracted from the monolithic dataSlice.
 * Tasks have their own lifecycle: CRUD, completion, item associations.
 */
import type { StateCreator } from 'zustand';
import type { AppState } from '../types';
import type { Task } from '../../lib/types';
import { persistentSyncQueue } from '../../lib/persistentQueue';
import { scheduleSync } from '../../lib/sync';

export interface TaskSlice {
    // Task State (owned by DataSlice, referenced here for actions)
    // Note: The actual `tasks` array lives in DataSlice to avoid duplication.
    // This slice only defines task-specific actions.

    // Task Actions
    addTask: (task: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'list_id' | 'deleted_at'> & { list_id?: string | null }) => void;
    updateTask: (id: string, updates: Partial<Task>) => void;
    deleteTask: (id: string) => void;
    completeTask: (id: string) => void;
    toggleTaskCompletion: (id: string) => void;
    addItemsToTask: (taskId: string, itemIds: string[]) => void;
    removeItemFromTask: (taskId: string, itemId: string) => void;
    toggleTaskItemCompletion: (taskId: string, itemId: string) => void;

    // Task Sync
    syncTaskToDb: (task: Task) => Promise<void>;
}

export const createTaskSlice: StateCreator<AppState, [], [], TaskSlice> = (set, get) => ({
    addTask: async (taskData) => {
        const now = new Date().toISOString();
        const { generateId } = await import('../../lib/utils');

        const newTask: Task = {
            id: generateId(),
            created_at: now,
            updated_at: now,
            deleted_at: null,
            list_id: taskData.list_id || null,
            parent_task_id: taskData.parent_task_id || null,
            sort_position: taskData.sort_position || null,
            is_unsynced: true,
            // CRITICAL: Initialize arrays to prevent drag-drop failures
            ...taskData,
            item_ids: taskData.item_ids || [],
            item_completion: taskData.item_completion || {}
        };
        set(state => ({ tasks: [newTask, ...state.tasks] }));
        get().syncTaskToDb(newTask);
        get().calculateStats();
        scheduleSync();
    },

    updateTask: (id, updates) => {
        const now = new Date().toISOString();
        set(state => ({
            tasks: state.tasks.map(t => t.id === id ? { ...t, ...updates, is_unsynced: true, updated_at: now } : t)
        }));
        const task = get().tasks.find(t => t.id === id);
        if (task) {
            get().syncTaskToDb(task);
        }
        get().calculateStats();
        scheduleSync();
    },

    deleteTask: (id) => {
        const now = new Date().toISOString();
        set(state => ({
            tasks: state.tasks.map(t => (
                t.id === id
                    ? { ...t, deleted_at: now, updated_at: now, is_unsynced: true }
                    : t
            ))
        }));
        const task = get().tasks.find(t => t.id === id);
        if (task) {
            get().syncTaskToDb(task);
        }
        get().calculateStats();
        scheduleSync();
    },

    completeTask: (id) => {
        const task = get().tasks.find(t => t.id === id);
        if (task) {
            get().updateTask(id, { is_completed: !task.is_completed });
        }
    },

    toggleTaskCompletion: (id) => {
        get().completeTask(id);
    },

    addItemsToTask: (taskId, itemIds) => {
        const task = get().tasks.find(t => t.id === taskId);
        if (!task) return;

        const newIds = [...new Set([...task.item_ids, ...itemIds])];
        get().updateTask(taskId, { item_ids: newIds });
    },

    removeItemFromTask: (taskId, itemId) => {
        const task = get().tasks.find(t => t.id === taskId);
        if (!task) return;

        const newIds = task.item_ids.filter(id => id !== itemId);
        const newCompletion = { ...task.item_completion };
        delete newCompletion[itemId];

        get().updateTask(taskId, { item_ids: newIds, item_completion: newCompletion });
    },

    toggleTaskItemCompletion: (taskId, itemId) => {
        const task = get().tasks.find(t => t.id === taskId);
        if (!task) return;

        const current = task.item_completion[itemId] || false;
        get().updateTask(taskId, {
            item_completion: { ...task.item_completion, [itemId]: !current }
        });
    },

    syncTaskToDb: async (task) => {
        persistentSyncQueue.add('upsert-task', task.id, task);
    },
});

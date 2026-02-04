/**
 * Undo Stack Module
 * Provides undo/redo functionality for item operations
 * 
 * Supports:
 * - Delete/Restore items
 * - Move items between folders
 * - Edit item content
 * - Bulk operations
 */

import type { Item, Task } from './types';

// Types of operations that can be undone
export type UndoableActionType = 
    | 'delete-items'
    | 'move-items'
    | 'edit-item'
    | 'delete-task'
    | 'edit-task'
    | 'bulk-archive'
    | 'bulk-unarchive'
    | 'complete-task';

interface BaseUndoAction {
    id: string;
    type: UndoableActionType;
    timestamp: string;
    description: string;
}

interface DeleteItemsAction extends BaseUndoAction {
    type: 'delete-items';
    items: Item[];
}

interface MoveItemsAction extends BaseUndoAction {
    type: 'move-items';
    itemIds: string[];
    fromFolderId: string | null;
    toFolderId: string | null;
}

interface EditItemAction extends BaseUndoAction {
    type: 'edit-item';
    itemId: string;
    previousState: Partial<Item>;
    newState: Partial<Item>;
}

interface DeleteTaskAction extends BaseUndoAction {
    type: 'delete-task';
    task: Task;
}

interface EditTaskAction extends BaseUndoAction {
    type: 'edit-task';
    taskId: string;
    previousState: Partial<Task>;
    newState: Partial<Task>;
}

interface BulkArchiveAction extends BaseUndoAction {
    type: 'bulk-archive' | 'bulk-unarchive';
    itemIds: string[];
}

interface CompleteTaskAction extends BaseUndoAction {
    type: 'complete-task';
    taskId: string;
    wasCompleted: boolean;
}

export type UndoAction = 
    | DeleteItemsAction 
    | MoveItemsAction 
    | EditItemAction 
    | DeleteTaskAction
    | EditTaskAction
    | BulkArchiveAction
    | CompleteTaskAction;

const MAX_UNDO_STACK_SIZE = 50;
const STORAGE_KEY = 'stash_undo_stack';

class UndoStack {
    private undoStack: UndoAction[] = [];
    private redoStack: UndoAction[] = [];

    constructor() {
        this.loadFromStorage();
    }

    private loadFromStorage() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                this.undoStack = data.undo || [];
                this.redoStack = data.redo || [];
                console.log(`[UndoStack] Loaded ${this.undoStack.length} undo, ${this.redoStack.length} redo actions`);
            }
        } catch (e) {
            console.warn('[UndoStack] Failed to load from storage:', e);
        }
    }

    private saveToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                undo: this.undoStack.slice(-MAX_UNDO_STACK_SIZE),
                redo: this.redoStack.slice(-MAX_UNDO_STACK_SIZE),
            }));
        } catch (e) {
            console.warn('[UndoStack] Failed to save to storage:', e);
        }
    }

    /**
     * Push an action onto the undo stack
     */
    push(action: Omit<UndoAction, 'id' | 'timestamp'>) {
        const fullAction: UndoAction = {
            ...action,
            id: `undo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            timestamp: new Date().toISOString(),
        } as UndoAction;

        this.undoStack.push(fullAction);
        
        // Clear redo stack when new action is pushed
        this.redoStack = [];
        
        // Limit stack size
        if (this.undoStack.length > MAX_UNDO_STACK_SIZE) {
            this.undoStack.shift();
        }

        this.saveToStorage();
        console.log(`[UndoStack] Pushed: ${action.type} - ${action.description}`);
    }

    /**
     * Pop and return the last action for undo
     */
    popUndo(): UndoAction | null {
        const action = this.undoStack.pop() || null;
        if (action) {
            this.redoStack.push(action);
            this.saveToStorage();
        }
        return action;
    }

    /**
     * Pop and return the last undone action for redo
     */
    popRedo(): UndoAction | null {
        const action = this.redoStack.pop() || null;
        if (action) {
            this.undoStack.push(action);
            this.saveToStorage();
        }
        return action;
    }

    /**
     * Check if undo is available
     */
    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    /**
     * Check if redo is available
     */
    canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    /**
     * Get the description of the next undo action
     */
    getUndoDescription(): string | null {
        const action = this.undoStack[this.undoStack.length - 1];
        return action?.description || null;
    }

    /**
     * Get the description of the next redo action
     */
    getRedoDescription(): string | null {
        const action = this.redoStack[this.redoStack.length - 1];
        return action?.description || null;
    }

    /**
     * Clear all undo/redo history
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this.saveToStorage();
    }

    /**
     * Get stack state for debugging
     */
    getState() {
        return {
            undoCount: this.undoStack.length,
            redoCount: this.redoStack.length,
            lastUndo: this.getUndoDescription(),
            lastRedo: this.getRedoDescription(),
        };
    }
}

// Singleton instance
export const undoStack = new UndoStack();

/**
 * Helper to create delete items action
 */
export function createDeleteItemsAction(items: Item[], description?: string): Omit<DeleteItemsAction, 'id' | 'timestamp'> {
    return {
        type: 'delete-items',
        items,
        description: description || `Delete ${items.length} item${items.length > 1 ? 's' : ''}`,
    };
}

/**
 * Helper to create move items action
 */
export function createMoveItemsAction(
    itemIds: string[],
    fromFolderId: string | null,
    toFolderId: string | null,
    description?: string
): Omit<MoveItemsAction, 'id' | 'timestamp'> {
    return {
        type: 'move-items',
        itemIds,
        fromFolderId,
        toFolderId,
        description: description || `Move ${itemIds.length} item${itemIds.length > 1 ? 's' : ''}`,
    };
}

/**
 * Helper to create edit item action
 */
export function createEditItemAction(
    itemId: string,
    previousState: Partial<Item>,
    newState: Partial<Item>,
    description?: string
): Omit<EditItemAction, 'id' | 'timestamp'> {
    return {
        type: 'edit-item',
        itemId,
        previousState,
        newState,
        description: description || 'Edit item',
    };
}

/**
 * Helper to create delete task action
 */
export function createDeleteTaskAction(task: Task): Omit<DeleteTaskAction, 'id' | 'timestamp'> {
    return {
        type: 'delete-task',
        task,
        description: `Delete task "${task.title}"`,
    };
}

/**
 * Helper to create archive action
 */
export function createBulkArchiveAction(
    itemIds: string[],
    archive: boolean
): Omit<BulkArchiveAction, 'id' | 'timestamp'> {
    return {
        type: archive ? 'bulk-archive' : 'bulk-unarchive',
        itemIds,
        description: `${archive ? 'Archive' : 'Unarchive'} ${itemIds.length} item${itemIds.length > 1 ? 's' : ''}`,
    };
}

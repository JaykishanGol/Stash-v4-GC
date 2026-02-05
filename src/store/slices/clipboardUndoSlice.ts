/**
 * Clipboard & Undo/Redo Slice
 * 
 * Manages clipboard (cut/copy/paste) and undo/redo operations.
 * These are cross-cutting concerns that access the full store via get().
 */
import type { StateCreator } from 'zustand';
import type { AppState } from '../types';
import type { Item } from '../../lib/types';
import { persistentSyncQueue } from '../../lib/persistentQueue';
import { undoStack } from '../../lib/undoStack';

export interface ClipboardUndoSlice {
    // Undo/Redo State
    canUndo: boolean;
    canRedo: boolean;
    undoDescription: string | null;
    redoDescription: string | null;

    // Clipboard Actions
    cutItems: (ids?: string[]) => void;
    copyItems: (ids?: string[]) => void;
    pasteItems: (targetFolderId?: string | null) => void;

    // Undo/Redo Actions
    undo: () => void;
    redo: () => void;
    updateUndoState: () => void;
}

export const createClipboardUndoSlice: StateCreator<AppState, [], [], ClipboardUndoSlice> = (set, get) => ({
    // Undo/Redo State
    canUndo: undoStack.canUndo(),
    canRedo: undoStack.canRedo(),
    undoDescription: undoStack.getUndoDescription(),
    redoDescription: undoStack.getRedoDescription(),

    // Clipboard
    cutItems: (ids) => {
        const { selectedItemIds, items } = get();
        const targetIds = ids || selectedItemIds;
        const itemsToCut = items.filter((i: Item) => targetIds.includes(i.id));
        if (itemsToCut.length > 0) {
            set({ clipboard: { items: itemsToCut, operation: 'cut' } });
        }
    },

    copyItems: (ids) => {
        const { selectedItemIds, items } = get();
        const targetIds = ids || selectedItemIds;
        const itemsToCopy = items.filter((i: Item) => targetIds.includes(i.id));
        if (itemsToCopy.length > 0) {
            set({ clipboard: { items: itemsToCopy, operation: 'copy' } });
        }
    },

    pasteItems: async (targetFolderId = null) => {
        const { clipboard, user } = get();
        if (!clipboard.items.length || !clipboard.operation) return;

        const now = new Date().toISOString();

        if (clipboard.operation === 'cut') {
            // Move items
            await get().moveItems(clipboard.items.map((i: Item) => i.id), targetFolderId);
            set({ clipboard: { items: [], operation: null } });
        } else {
            // COPY OPERATION
            const { supabase, isSupabaseConfigured } = await import('../../lib/supabase');

            // Separate folders from items
            const foldersToCopy = clipboard.items.filter((i: Item) => i.type === 'folder');
            const itemsToCopy = clipboard.items.filter((i: Item) => i.type !== 'folder');

            // 1. Handle Folders (Deep Copy via RPC)
            if (foldersToCopy.length > 0 && isSupabaseConfigured()) {
                for (const folder of foldersToCopy) {
                    try {
                        const { error } = await supabase.rpc('copy_folder_recursive', {
                            source_folder_id: folder.id,
                            target_folder_id: targetFolderId,
                            new_user_id: user?.id
                        });

                        if (error) throw error;
                        console.log(`[ClipboardSlice] Deep copied folder: ${folder.title}`);
                    } catch (err) {
                        console.error('[ClipboardSlice] RPC copy failed, falling back to shallow copy', err);
                        const newFolder = {
                            ...folder,
                            id: crypto.randomUUID(),
                            folder_id: targetFolderId,
                            title: `${folder.title} (Copy)`,
                            created_at: now,
                            updated_at: now,
                            user_id: user?.id || folder.user_id
                        };
                        get().addItem(newFolder);
                    }
                }
            } else if (foldersToCopy.length > 0) {
                // Offline fallback (Shallow copy only)
                foldersToCopy.forEach((folder: Item) => {
                    const newFolder = {
                        ...folder,
                        id: crypto.randomUUID(),
                        folder_id: targetFolderId,
                        title: `${folder.title} (Copy)`,
                        created_at: now,
                        updated_at: now,
                        user_id: user?.id || folder.user_id
                    };
                    get().addItem(newFolder);
                });
                get().addNotification?.('warning', 'Deep Copy Unavailable', 'Only empty folders were copied while offline.');
            }

            // 2. Handle Regular Items (Client-side Duplicate)
            itemsToCopy.forEach((item: Item) => {
                const newItem = {
                    ...item,
                    id: crypto.randomUUID(),
                    folder_id: targetFolderId,
                    created_at: now,
                    updated_at: now,
                    user_id: user?.id || item.user_id
                };
                get().addItem(newItem);
            });

            // Refresh to see new server-generated items
            if (isSupabaseConfigured()) {
                setTimeout(() => get().loadUserData(), 1000);
            }

            set({ clipboard: { items: [], operation: null } });
        }
    },

    // Undo/Redo Implementation
    updateUndoState: () => {
        set({
            canUndo: undoStack.canUndo(),
            canRedo: undoStack.canRedo(),
            undoDescription: undoStack.getUndoDescription(),
            redoDescription: undoStack.getRedoDescription(),
        });
    },

    undo: () => {
        const action = undoStack.popUndo();
        if (!action) return;

        console.log('[Undo] Executing:', action.type, action.description);

        switch (action.type) {
            case 'delete-items': {
                const itemsToRestore = action.items;
                const now = new Date().toISOString();

                itemsToRestore.forEach(item => {
                    const restoredItem = { ...item, deleted_at: null, updated_at: now };

                    set(state => ({
                        trashedItems: state.trashedItems.filter(i => i.id !== item.id),
                        items: [...state.items, restoredItem]
                    }));

                    get().syncItemToDb(restoredItem);
                });
                break;
            }

            case 'move-items': {
                const { itemIds, fromFolderId } = action;
                const now = new Date().toISOString();

                set(state => ({
                    items: state.items.map(i =>
                        itemIds.includes(i.id)
                            ? { ...i, folder_id: fromFolderId, updated_at: now }
                            : i
                    )
                }));

                itemIds.forEach(id => {
                    const item = get().items.find(i => i.id === id);
                    if (item) get().syncItemToDb(item);
                });
                break;
            }

            case 'delete-task': {
                const { task } = action;
                const restoredTask = { ...task, deleted_at: null, updated_at: new Date().toISOString() };

                set(state => ({ tasks: [restoredTask, ...state.tasks] }));
                get().syncTaskToDb(restoredTask);
                break;
            }

            case 'bulk-archive': {
                const { itemIds } = action;
                itemIds.forEach(id => get().unarchiveItem(id));
                break;
            }

            case 'bulk-unarchive': {
                const { itemIds } = action;
                itemIds.forEach(id => get().archiveItem(id));
                break;
            }
        }

        get().calculateStats();
        get().refreshFolderCounts();
        get().updateUndoState();

        const state = get();
        state.addNotification?.('info', 'Undone', action.description);
    },

    redo: () => {
        const action = undoStack.popRedo();
        if (!action) return;

        console.log('[Redo] Executing:', action.type, action.description);

        switch (action.type) {
            case 'delete-items': {
                const itemIds = action.items.map(i => i.id);
                const now = new Date().toISOString();

                set(state => {
                    const itemsToTrash = state.items.filter(i => itemIds.includes(i.id));
                    const remainingItems = state.items.filter(i => !itemIds.includes(i.id));

                    const trashedWithTimestamp = itemsToTrash.map(i => ({
                        ...i,
                        deleted_at: now,
                        updated_at: now
                    }));

                    trashedWithTimestamp.forEach(item => {
                        get().syncItemToDb(item);
                    });

                    return {
                        items: remainingItems,
                        trashedItems: [...state.trashedItems, ...trashedWithTimestamp],
                    };
                });
                break;
            }

            case 'move-items': {
                const { itemIds, toFolderId } = action;
                const now = new Date().toISOString();

                set(state => ({
                    items: state.items.map(i =>
                        itemIds.includes(i.id)
                            ? { ...i, folder_id: toFolderId, updated_at: now }
                            : i
                    )
                }));

                itemIds.forEach(id => {
                    const item = get().items.find(i => i.id === id);
                    if (item) get().syncItemToDb(item);
                });
                break;
            }

            case 'delete-task': {
                const { task } = action;
                set(state => ({
                    tasks: state.tasks.filter(t => t.id !== task.id)
                }));
                persistentSyncQueue.add('delete-task', task.id, null);
                break;
            }

            case 'bulk-archive': {
                const { itemIds } = action;
                itemIds.forEach(id => get().archiveItem(id));
                break;
            }

            case 'bulk-unarchive': {
                const { itemIds } = action;
                itemIds.forEach(id => get().unarchiveItem(id));
                break;
            }
        }

        get().calculateStats();
        get().refreshFolderCounts();
        get().updateUndoState();

        const state = get();
        state.addNotification?.('info', 'Redone', action.description);
    }
});

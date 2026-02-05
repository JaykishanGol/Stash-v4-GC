/**
 * Store Types
 * 
 * Centralized type definitions for cross-slice access.
 * This file exists to avoid circular imports between slices and useAppStore.
 * 
 * USAGE:
 * When a slice needs to access state/actions from other slices, use AppState
 * in the StateCreator generic:
 * 
 *   StateCreator<MySlice, [], [], AppState>
 * 
 * This allows `get()` to return the full combined state with proper typing.
 * 
 * NOTE: Each slice interface is still defined in its own file.
 * Only the combined type is exported here.
 */

import type { AuthSlice } from './slices/authSlice';
import type { UISlice } from './slices/uiSlice';
import type { DataSlice } from './slices/dataSlice';
import type { SelectionSlice } from './slices/selectionSlice';
import type { TaskSlice } from './slices/taskSlice';
import type { ClipboardUndoSlice } from './slices/clipboardUndoSlice';
import type { Item, Task } from '../lib/types';

/**
 * Combined application state type.
 * Use this when a slice needs typed access to the full store.
 */
export type AppState = AuthSlice & UISlice & DataSlice & SelectionSlice & TaskSlice & ClipboardUndoSlice & {
    // Computed (Selectors)
    getFilteredItems: (overrideListId?: string | null) => Item[];
    getFilteredTasks: () => Task[];
    loadUserData: () => Promise<void>;
};

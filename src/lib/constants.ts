/**
 * Application-wide constants
 * 
 * Centralizes magic strings and configuration values to prevent drift.
 */

/**
 * LocalStorage key for Zustand persisted state.
 * Used by useAppStore persist middleware and authSlice signOut.
 */
export const STORAGE_KEY = 'stash-storage';

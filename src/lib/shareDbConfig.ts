/**
 * Share Database Configuration
 * 
 * Shared constants for the IndexedDB used by share-target functionality.
 * Used by both sw.js (service worker) and shareHandler.ts (main thread).
 * 
 * IMPORTANT: Both files must use the same values to access the database correctly.
 * Modifying these values requires updating both consumers and may require
 * DB migration handling.
 */

/** IndexedDB database name for share target data */
export const SHARE_DB_NAME = 'stash-share-db';

/** Object store name within the share database */
export const SHARE_STORE_NAME = 'shares';

/** Database version - bump this when schema changes */
export const SHARE_DB_VERSION = 2;

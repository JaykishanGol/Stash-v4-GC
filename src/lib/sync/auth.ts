/**
 * Sync Module — Auth helpers
 * 
 * Handles Supabase session freshness, Google token checks,
 * kill switch, and abort mechanism.
 */

import { supabase } from '../supabase';
import { GoogleClient } from '../googleClient';

const SYNC_KILL_SWITCH_KEY = 'stash_google_sync_disabled';
const MAX_CONSECUTIVE_AUTH_ERRORS = 3;

/** Custom error thrown after N consecutive Supabase auth failures */
export class SupabaseAuthAbortError extends Error {
  constructor() {
    super('SUPABASE_AUTH_ABORT');
    this.name = 'SupabaseAuthAbortError';
  }
}

let consecutiveAuthErrors = 0;

/** Reset the consecutive auth error counter (call on success) */
export function resetAuthErrorCount() {
  consecutiveAuthErrors = 0;
}

/** Increment and check consecutive auth errors. Throws if exceeded limit. */
export function recordAuthError(): void {
  consecutiveAuthErrors++;
  if (consecutiveAuthErrors >= MAX_CONSECUTIVE_AUTH_ERRORS) {
    console.error(
      `[Sync/Auth] ${consecutiveAuthErrors} consecutive Supabase auth errors — ABORTING sync cycle`
    );
    throw new SupabaseAuthAbortError();
  }
}

/**
 * Refresh Supabase session so RLS policies pass. Returns true if session is valid.
 */
export async function ensureFreshSupabaseSession(): Promise<boolean> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.error('[Sync/Auth] Failed to refresh Supabase session:', refreshError.message);
      return false;
    }
  }
  return true;
}

/**
 * Ensure Google access token is fresh. Returns true if token is usable.
 */
export async function ensureGoogleToken(): Promise<boolean> {
  try {
    await GoogleClient.ensureAccessToken();
    return true;
  } catch {
    return false;
  }
}

/** Check if sync is disabled via kill switch */
export function isSyncDisabled(): boolean {
  try {
    return localStorage.getItem(SYNC_KILL_SWITCH_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Enable or disable Google sync */
export function setSyncDisabled(disabled: boolean): void {
  try {
    if (disabled) {
      localStorage.setItem(SYNC_KILL_SWITCH_KEY, 'true');
      console.warn('[Sync] *** SYNC DISABLED via kill switch ***');
    } else {
      localStorage.removeItem(SYNC_KILL_SWITCH_KEY);
      console.info('[Sync] Sync re-enabled.');
    }
  } catch { /* */ }
}

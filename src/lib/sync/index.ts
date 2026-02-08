/**
 * Sync Module — Public API
 *
 * Manages the sync scheduler and exposes simple start/stop/runNow controls.
 * All consumers import from this file.
 */

export { runSyncCycle, isSyncRunning } from './engine';
export { isSyncDisabled, setSyncDisabled, resetAuthErrorCount } from './auth';
export { SupabaseAuthAbortError } from './auth';
export type { SyncResult, SyncPhase, LinkRecord } from './types';

// ─── Scheduler ───────────────────────────────────────────────────
import { runSyncCycle, isSyncRunning } from './engine';
import { isSyncDisabled } from './auth';

const DEFAULT_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
let _intervalId: ReturnType<typeof setInterval> | null = null;
let _visibilityHandler: (() => void) | null = null;
let _onlineHandler: (() => void) | null = null;

/**
 * Start the background sync scheduler.
 * Sets up periodic sync + visibility/online triggers.
 */
export function startSync(intervalMs = DEFAULT_INTERVAL_MS): void {
  if (_intervalId) return; // Already running

  console.log(`[Sync] Starting scheduler (interval=${intervalMs}ms)`);

  // Initial sync after short delay
  setTimeout(() => {
    if (!isSyncDisabled()) void runSyncCycle();
  }, 2_000);

  // Periodic sync
  _intervalId = setInterval(() => {
    if (!isSyncDisabled() && !isSyncRunning()) {
      void runSyncCycle();
    }
  }, intervalMs);

  // Sync on tab becoming visible
  _visibilityHandler = () => {
    if (document.visibilityState === 'visible' && !isSyncDisabled() && !isSyncRunning()) {
      void runSyncCycle();
    }
  };
  document.addEventListener('visibilitychange', _visibilityHandler);

  // Sync on coming back online
  _onlineHandler = () => {
    if (!isSyncDisabled() && !isSyncRunning()) {
      void runSyncCycle();
    }
  };
  window.addEventListener('online', _onlineHandler);
}

/**
 * Stop the background sync scheduler.
 */
export function stopSync(): void {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  if (_visibilityHandler) {
    document.removeEventListener('visibilitychange', _visibilityHandler);
    _visibilityHandler = null;
  }
  if (_onlineHandler) {
    window.removeEventListener('online', _onlineHandler);
    _onlineHandler = null;
  }
  console.log('[Sync] Scheduler stopped');
}

/**
 * Trigger an immediate sync cycle (returns the result).
 */
export async function runSyncNow(options?: { forceFullPull?: boolean }) {
  return runSyncCycle(options);
}

/**
 * Schedule a one-time deferred sync (e.g. after a local mutation).
 */
let _deferredTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleSync(delayMs = 1_500): void {
  if (_deferredTimer) clearTimeout(_deferredTimer);
  _deferredTimer = setTimeout(() => {
    _deferredTimer = null;
    if (!isSyncDisabled() && !isSyncRunning()) {
      void runSyncCycle();
    }
  }, delayMs);
}

// Debug helper — attach to window in dev
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__syncEngine = {
    startSync,
    stopSync,
    runSyncNow,
    scheduleSync,
    isSyncRunning,
    isSyncDisabled,
  };
}

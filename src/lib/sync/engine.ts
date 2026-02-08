/**
 * Sync Module — Orchestrator
 *
 * Runs the full sync cycle: push → pull for both Calendar Events and Google Tasks.
 */

import {
  ensureFreshSupabaseSession,
  ensureGoogleToken,
  SupabaseAuthAbortError,
  resetAuthErrorCount,
  recordAuthError,
  isSyncDisabled,
} from './auth';
import { loadAllLinks } from './links';
import { pushLocalEvents } from './pushEvents';
import { pushLocalGoogleTasks } from './pushGoogleTasks';
import { pushLocalItems } from './pushItems';
import { pullRemoteEvents } from './pullEvents';
import { pullRemoteGoogleTasks } from './pullGoogleTasks';
import type { SyncResult } from './types';
import { useAppStore } from '../../store/useAppStore';

let _running = false;

export function isSyncRunning(): boolean {
  return _running;
}

/**
 * Execute one full sync cycle.
 * Phases: pushEvents → pushGoogleTasks → pushItems → pullEvents → pullGoogleTasks
 */
export async function runSyncCycle(options?: {
  forceFullPull?: boolean;
}): Promise<SyncResult> {
  if (_running) {
    console.log('[Sync/Engine] Already running, skipping');
    return {
      success: true,
      phases: [],
      totalPushed: 0,
      totalPulled: 0,
      errors: [],
    };
  }

  if (isSyncDisabled()) {
    console.warn('[Sync/Engine] Sync is disabled (kill switch)');
    return {
      success: false,
      phases: [],
      totalPushed: 0,
      totalPulled: 0,
      errors: ['Sync disabled via kill switch'],
    };
  }

  _running = true;
  const result: SyncResult = {
    success: true,
    phases: [],
    totalPushed: 0,
    totalPulled: 0,
    errors: [],
  };

  try {
    console.log('[Sync/Engine] ─── Starting sync cycle ───');

    // Phase 0: Auth
    await ensureFreshSupabaseSession();
    await ensureGoogleToken();

    const user = useAppStore.getState().user;
    if (!user?.id) {
      throw new Error('No authenticated user');
    }

    // Load link table once
    let links = await loadAllLinks(user.id);
    console.log(`[Sync/Engine] Loaded ${links.length} link(s)`);

    // Phase 1: Push Events
    try {
      const pushEventsResult = await pushLocalEvents(user.id, links);
      result.phases.push({ name: 'pushEvents', pulled: 0, ...pushEventsResult });
      result.totalPushed += pushEventsResult.pushed;
      result.errors.push(...pushEventsResult.errors);
    } catch (err) {
      if (err instanceof SupabaseAuthAbortError) throw err;
      const msg = `pushEvents: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      console.error('[Sync/Engine] pushEvents failed:', msg);
    }

    // Phase 2: Push Google Tasks
    try {
      const pushTasksResult = await pushLocalGoogleTasks(user.id, links);
      result.phases.push({ name: 'pushGoogleTasks', pulled: 0, ...pushTasksResult });
      result.totalPushed += pushTasksResult.pushed;
      result.errors.push(...pushTasksResult.errors);
    } catch (err) {
      if (err instanceof SupabaseAuthAbortError) throw err;
      const msg = `pushGoogleTasks: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      console.error('[Sync/Engine] pushGoogleTasks failed:', msg);
    }

    // Phase 3: Push Items (scheduled as Google Event/Task)
    try {
      const pushItemsResult = await pushLocalItems(user.id, links);
      result.phases.push({ name: 'pushItems', pulled: 0, ...pushItemsResult });
      result.totalPushed += pushItemsResult.pushed;
      result.errors.push(...pushItemsResult.errors);
    } catch (err) {
      if (err instanceof SupabaseAuthAbortError) throw err;
      const msg = `pushItems: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      console.error('[Sync/Engine] pushItems failed:', msg);
    }

    // Reload links before pull phase
    links = await loadAllLinks(user.id);

    // Phase 4: Pull Events
    try {
      const pullEventsResult = await pullRemoteEvents(user.id, links, !!options?.forceFullPull);
      result.phases.push({ name: 'pullEvents', pushed: 0, ...pullEventsResult });
      result.totalPulled += pullEventsResult.pulled;
      result.errors.push(...pullEventsResult.errors);
    } catch (err) {
      if (err instanceof SupabaseAuthAbortError) throw err;
      const msg = `pullEvents: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      console.error('[Sync/Engine] pullEvents failed:', msg);
    }

    // Phase 5: Pull Google Tasks
    try {
      const pullTasksResult = await pullRemoteGoogleTasks(
        user.id,
        links,
        !!options?.forceFullPull
      );
      result.phases.push({ name: 'pullGoogleTasks', pushed: 0, ...pullTasksResult });
      result.totalPulled += pullTasksResult.pulled;
      result.errors.push(...pullTasksResult.errors);
    } catch (err) {
      if (err instanceof SupabaseAuthAbortError) throw err;
      const msg = `pullGoogleTasks: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      console.error('[Sync/Engine] pullGoogleTasks failed:', msg);
    }

    // Success: reset auth error counter
    resetAuthErrorCount();

    console.log(
      `[Sync/Engine] ─── Cycle complete: pushed=${result.totalPushed}, pulled=${result.totalPulled}, errors=${result.errors.length} ───`
    );
  } catch (err) {
    result.success = false;
    if (err instanceof SupabaseAuthAbortError) {
      recordAuthError();
      result.errors.push(`AUTH ABORT: ${err.message}`);
      console.error('[Sync/Engine] Auth abort — cycle halted');
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(msg);
      console.error('[Sync/Engine] Fatal error:', msg);
    }
  } finally {
    _running = false;
  }

  return result;
}

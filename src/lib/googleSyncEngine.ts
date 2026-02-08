import { supabase, isSupabaseConfigured } from './supabase';
import {
  GoogleClient,
  isNoGoogleAccessTokenError,
  type GoogleEvent,
  type GoogleTask,
  type GoogleTaskList,
} from './googleClient';
import { hasStoredGoogleConnection } from './googleTokenService';
import { useAppStore } from '../store/useAppStore';
import { persistentSyncQueue } from './persistentQueue';
import { generateId } from './utils';
import type { CalendarEvent, Item, ItemGoogleSyncMeta, List, Task } from './types';

type CursorResourceType = 'event' | 'task';
type SyncDirection = 'push' | 'pull';

interface GoogleSyncCursorRow {
  user_id: string;
  resource_type: CursorResourceType;
  scope_id: string;
  sync_token: string | null;
  last_pulled_at: string | null;
}

interface GoogleResourceLinkRow {
  id: string;
  user_id: string;
  local_id: string;
  local_type: 'item' | 'task' | 'calendar_event' | 'list' | string;
  google_id: string;
  resource_type: 'event' | 'task';
  calendar_id: string | null;
  task_list_id: string | null;
  remote_etag: string | null;
  remote_updated_at: string | null;
  retry_count: number | null;
  next_retry_at: string | null;
  error: string | null;
}

interface GoogleRequestErrorLike {
  status?: number;
  details?: string;
}

const INITIAL_EVENT_PULL_DAYS = 365;
const MANUAL_FULL_PULL_DAYS = 3650;
const DEFAULT_DEBOUNCE_MS = 1200;
const DEFAULT_SYNC_INTERVAL_MS = 2 * 60 * 1000;
const GOOGLE_AUTH_BACKOFF_MS = 60 * 1000;
const MAX_GOOGLE_REMINDER_MINUTES = 40320;
const MIN_GOOGLE_REMINDER_MINUTES = 0;
const FALLBACK_EVENT_DURATION_MS = 60 * 60 * 1000;
const FALLBACK_ITEM_EVENT_DURATION_MS = 30 * 60 * 1000;
const BASE_RETRY_BACKOFF_MS = 60 * 1000;
const MAX_RETRY_BACKOFF_MS = 12 * 60 * 60 * 1000;
const GOOGLE_RATE_LIMIT_BASE_MS = 2 * 60 * 1000;
const GOOGLE_RATE_LIMIT_MAX_MS = 30 * 60 * 1000;
const MAX_PUSH_EVENTS_PER_CYCLE = 25;
const MAX_PUSH_TASKS_PER_CYCLE = 50;
const MAX_PUSH_ITEMS_PER_CYCLE = 50;
const MAX_RETRY_COUNT = 10;
const SHORT_RETRY_INTERVAL_MS = 30 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function safeDateMs(input?: string | null) {
  if (!input) return Number.NaN;
  return new Date(input).getTime();
}

function isRemoteStrictlyNewer(localUpdatedAt?: string | null, remoteUpdatedAt?: string | null) {
  const localMs = safeDateMs(localUpdatedAt);
  const remoteMs = safeDateMs(remoteUpdatedAt);
  if (Number.isNaN(remoteMs)) return false;
  if (Number.isNaN(localMs)) return true;
  return remoteMs > localMs;
}

function isLocalStrictlyNewer(localUpdatedAt?: string | null, remoteUpdatedAt?: string | null) {
  const localMs = safeDateMs(localUpdatedAt);
  const remoteMs = safeDateMs(remoteUpdatedAt);
  if (Number.isNaN(localMs)) return false;
  if (Number.isNaN(remoteMs)) return true;
  return localMs > remoteMs;
}

function parseGoogleDate(value?: string) {
  if (!value) return null;
  if (value.includes('T')) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toEventReminderOverrides(event: CalendarEvent) {
  const overrides = (event.reminders || [])
    .map((r) => ({
      method: r.method === 'email' ? 'email' : 'popup',
      minutes: Math.min(
        MAX_GOOGLE_REMINDER_MINUTES,
        Math.max(MIN_GOOGLE_REMINDER_MINUTES, Math.round(Number(r.minutes) || 0))
      ),
    }))
    .filter((r) => Number.isFinite(r.minutes));

  if (!overrides.length) {
    return { useDefault: true as const };
  }
  return {
    useDefault: false as const,
    overrides,
  };
}

function isValidEmail(email?: string | null) {
  if (!email) return false;
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function toDatePart(value?: string | null) {
  if (!value) return null;
  const direct = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function addDaysToDatePart(datePart: string, days: number) {
  const date = new Date(`${datePart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toGoogleEventPayload(
  event: CalendarEvent,
  options: { minimal?: boolean } = {}
): Record<string, unknown> {
  const minimal = !!options.minimal;
  const validAttendees = (event.attendees || [])
    .filter((a) => isValidEmail(a.email))
    .map((a) => ({
      email: a.email.trim(),
      displayName: a.displayName || undefined,
      responseStatus:
        a.responseStatus === 'accepted' ||
        a.responseStatus === 'declined' ||
        a.responseStatus === 'tentative' ||
        a.responseStatus === 'needsAction'
          ? a.responseStatus
          : undefined,
    }));

  const payload: Record<string, unknown> = {
    summary: event.title || '(No title)',
    description: event.description || '',
  };

  if (event.is_all_day) {
    const startDate = toDatePart(event.start_at) || nowIso().slice(0, 10);
    const rawEndDate = toDatePart(event.end_at) || startDate;
    const endDate = rawEndDate > startDate ? rawEndDate : addDaysToDatePart(startDate, 1);
    payload.start = { date: startDate };
    payload.end = { date: endDate };
  } else {
    const startMs = safeDateMs(event.start_at);
    const resolvedStartMs = Number.isNaN(startMs) ? Date.now() : startMs;
    const endMs = safeDateMs(event.end_at);
    const resolvedEndMs =
      Number.isNaN(endMs) || endMs <= resolvedStartMs ? resolvedStartMs + FALLBACK_EVENT_DURATION_MS : endMs;
    payload.start = {
      dateTime: new Date(resolvedStartMs).toISOString(),
      timeZone: event.timezone || undefined,
    };
    payload.end = {
      dateTime: new Date(resolvedEndMs).toISOString(),
      timeZone: event.timezone || undefined,
    };
  }

  if (minimal) {
    return payload;
  }

  payload.location = event.location || undefined;
  payload.colorId = event.color_id || undefined;
  payload.visibility = event.visibility === 'default' ? undefined : event.visibility;
  payload.transparency =
    event.transparency === 'transparent' || event.transparency === 'opaque'
      ? event.transparency
      : 'opaque';
  payload.attendees = validAttendees.length ? validAttendees : undefined;
  payload.reminders = toEventReminderOverrides(event);

  if (event.rrule && !event.parent_event_id) {
    const normalizedRrule = event.rrule.replace(/^RRULE:/i, '').trim();
    if (/(^|;)FREQ=/.test(normalizedRrule.toUpperCase())) {
      payload.recurrence = [`RRULE:${normalizedRrule}`];
    }
  }

  if (event.conference_data?.meetLink === 'pending') {
    payload.conferenceData = {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  return payload;
}

function toGoogleTaskPayload(task: Task, parentGoogleId?: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: task.title || '(No title)',
    notes: task.description || '',
    due: task.scheduled_at || undefined,
    status: task.is_completed ? 'completed' : 'needsAction',
  };
  if (parentGoogleId) {
    payload.parent = parentGoogleId;
  }
  return payload;
}

function getItemSyncMeta(item: Item): ItemGoogleSyncMeta {
  const content = item.content;
  if (!content || typeof content !== 'object') {
    return {};
  }
  return content as ItemGoogleSyncMeta;
}

function mergeItemSyncMeta(
  item: Item,
  patch: Partial<ItemGoogleSyncMeta>
): Item['content'] {
  const existing = item.content && typeof item.content === 'object' ? item.content : {};
  return {
    ...existing,
    ...patch,
  } as Item['content'];
}

function getItemDescription(item: Item) {
  const content = item.content && typeof item.content === 'object'
    ? (item.content as Record<string, unknown>)
    : {};
  const text = typeof content.text === 'string' ? content.text : '';
  const url = typeof content.url === 'string' ? content.url : '';
  if (item.type === 'link' && url) {
    return text ? `${text}\n${url}` : url;
  }
  return text;
}

function toGoogleEventPayloadFromItem(
  item: Item,
  options: { minimal?: boolean } = {}
): Record<string, unknown> {
  const minimal = !!options.minimal;
  const startMs = safeDateMs(item.scheduled_at);
  const resolvedStartMs = Number.isNaN(startMs) ? Date.now() : startMs;
  const endMs = resolvedStartMs + FALLBACK_ITEM_EVENT_DURATION_MS;

  const payload: Record<string, unknown> = {
    summary: item.title || '(No title)',
    description: getItemDescription(item),
    start: { dateTime: new Date(resolvedStartMs).toISOString() },
    end: { dateTime: new Date(endMs).toISOString() },
  };

  if (minimal) {
    return payload;
  }

  return payload;
}

function toGoogleTaskPayloadFromItem(item: Item): Record<string, unknown> {
  return {
    title: item.title || '(No title)',
    notes: getItemDescription(item),
    due: item.scheduled_at || undefined,
    status: item.is_completed ? 'completed' : 'needsAction',
  };
}

function getRemoteEventUpdatedAt(remote: GoogleEvent) {
  return remote.updated || nowIso();
}

function getRemoteTaskUpdatedAt(remote: GoogleTask) {
  return remote.updated || nowIso();
}

class GoogleSyncEngine {
  private static readonly SYNC_KILL_SWITCH_KEY = 'stash_google_sync_disabled';
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;
  private pendingSync = false;
  private activeUserId: string | null = null;
  private listenersAttached = false;
  private migratedUsers = new Set<string>();
  private reconciledUsers = new Set<string>();
  private authUnavailableUntil = 0;
  private lastAuthSkipLogAt = 0;
  private forceFullResyncOnce = false;
  private forceFullTaskPullOnce = true;
  private rateLimitUnavailableUntil = 0;
  private rateLimitBackoffMs = GOOGLE_RATE_LIMIT_BASE_MS;
  private lastRateLimitLogAt = 0;
  private consecutiveSupabaseAuthErrors = 0;
  private static readonly MAX_SUPABASE_AUTH_ERRORS = 5;

  /** Check if sync is disabled via kill switch */
  isSyncDisabled(): boolean {
    try { return localStorage.getItem(GoogleSyncEngine.SYNC_KILL_SWITCH_KEY) === 'true'; } catch { return false; }
  }

  /** Enable or disable Google sync. When disabled, also clears pending queue. */
  setSyncDisabled(disabled: boolean) {
    try {
      if (disabled) {
        localStorage.setItem(GoogleSyncEngine.SYNC_KILL_SWITCH_KEY, 'true');
        this.stop();
        persistentSyncQueue.clearAll();
        console.warn('[GoogleSyncEngine] *** SYNC DISABLED via kill switch. Queue cleared. ***');
      } else {
        localStorage.removeItem(GoogleSyncEngine.SYNC_KILL_SWITCH_KEY);
        console.info('[GoogleSyncEngine] Sync re-enabled.');
      }
    } catch { /* */ }
  }

  /** Refresh Supabase session so RLS policies pass. Returns true if session is valid. */
  private async ensureFreshSupabaseSession(): Promise<boolean> {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      // Try a hard refresh
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('[GoogleSyncEngine] Failed to refresh Supabase session:', refreshError.message);
        return false;
      }
    }
    return true;
  }

  start(userId?: string | null) {
    const resolvedUserId = userId || useAppStore.getState().user?.id || null;
    if (!resolvedUserId || resolvedUserId === 'demo') {
      this.stop();
      return;
    }

    const userChanged = this.activeUserId !== resolvedUserId;
    this.activeUserId = resolvedUserId;
    if (userChanged) {
      this.forceFullTaskPullOnce = true;
    }

    if (!this.listenersAttached && typeof window !== 'undefined') {
      this.listenersAttached = true;
      window.addEventListener('online', this.handleOnline);
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }

    this.intervalTimer = setInterval(() => {
      this.scheduleSync('interval', 500);
    }, DEFAULT_SYNC_INTERVAL_MS);

    this.scheduleSync('startup', 300);
  }

  stop() {
    this.activeUserId = null;
    this.pendingSync = false;
    this.forceFullTaskPullOnce = true;

    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.listenersAttached && typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.listenersAttached = false;
    }
  }

  scheduleSync(_reason: string, delayMs = DEFAULT_DEBOUNCE_MS) {
    if (!this.activeUserId) return;

    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.syncNow('scheduled');
    }, delayMs);
  }

  async syncNow(reason: string = 'manual') {
    const userId = this.activeUserId || useAppStore.getState().user?.id;
    if (!userId || userId === 'demo') return;
    if (!isSupabaseConfigured()) return;

    // Kill switch check
    if (this.isSyncDisabled()) {
      console.info('[GoogleSyncEngine] Sync skipped — kill switch is ON. Run googleSyncEngine.setSyncDisabled(false) to re-enable.');
      return;
    }

    if (this.syncing) {
      this.pendingSync = true;
      return;
    }

    if (Date.now() < this.authUnavailableUntil) {
      return;
    }
    if (Date.now() < this.rateLimitUnavailableUntil) {
      return;
    }

    if (reason === 'manual-refresh') {
      this.forceFullResyncOnce = true;
    }

    const hasConnection = await hasStoredGoogleConnection();
    if (!hasConnection) return;

    this.syncing = true;
    this.pendingSync = false;

    try {
      const forceFullPull = this.forceFullResyncOnce;
      const forceFullTaskPull = forceFullPull || this.forceFullTaskPullOnce;
      this.forceFullResyncOnce = false;
      void reason;
      await this.runSyncCycle(userId, {
        forceFullPull,
        forceFullTaskPull,
      });
      this.forceFullTaskPullOnce = false;
      this.rateLimitUnavailableUntil = 0;
      this.rateLimitBackoffMs = GOOGLE_RATE_LIMIT_BASE_MS;
    } catch (error) {
      if (isNoGoogleAccessTokenError(error)) {
        this.markAuthUnavailable();
        return;
      }
      if (this.isRateLimitAbortError(error)) {
        return;
      }
      if (error instanceof Error && error.message === 'SUPABASE_AUTH_ABORT') {
        console.error('[GoogleSyncEngine] Sync aborted due to persistent Supabase auth failures. Will retry next cycle.');
        return;
      }
      console.error('[GoogleSyncEngine] Sync failed:', error);
    } finally {
      this.syncing = false;
      if (this.pendingSync) {
        this.pendingSync = false;
        this.scheduleSync('pending', 500);
      }
    }
  }

  private readonly handleOnline = () => {
    this.scheduleSync('online', 250);
  };

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      this.scheduleSync('visible', 400);
    }
  };

  private markAuthUnavailable() {
    this.authUnavailableUntil = Date.now() + GOOGLE_AUTH_BACKOFF_MS;
    const now = Date.now();
    if (now - this.lastAuthSkipLogAt > 30 * 1000) {
      this.lastAuthSkipLogAt = now;
      console.info('[GoogleSyncEngine] Google auth unavailable. Backing off sync attempts.');
    }
  }

  private getGoogleRequestStatus(error: unknown) {
    if (!error || typeof error !== 'object') return null;
    const maybe = error as GoogleRequestErrorLike;
    return typeof maybe.status === 'number' ? maybe.status : null;
  }

  private getGoogleRequestReason(error: unknown) {
    if (!error || typeof error !== 'object') return null;
    const maybe = error as GoogleRequestErrorLike;
    if (!maybe.details || typeof maybe.details !== 'string') return null;
    try {
      const parsed = JSON.parse(maybe.details) as {
        error?: { errors?: Array<{ reason?: string }> };
      };
      return parsed?.error?.errors?.[0]?.reason || null;
    } catch {
      return null;
    }
  }

  private isGoogleRateLimitError(error: unknown) {
    const status = this.getGoogleRequestStatus(error);
    if (status === 429) return true;
    if (status !== 403) return false;
    const reason = (this.getGoogleRequestReason(error) || '').toLowerCase();
    return (
      reason === 'ratelimitexceeded' ||
      reason === 'userratelimitexceeded' ||
      reason === 'quotaexceeded' ||
      reason === 'dailylimitexceeded'
    );
  }

  private markRateLimited(error?: unknown) {
    const until = Date.now() + this.rateLimitBackoffMs;
    this.rateLimitUnavailableUntil = until;
    this.rateLimitBackoffMs = Math.min(
      GOOGLE_RATE_LIMIT_MAX_MS,
      Math.max(GOOGLE_RATE_LIMIT_BASE_MS, this.rateLimitBackoffMs * 2)
    );

    const now = Date.now();
    if (now - this.lastRateLimitLogAt > 15 * 1000) {
      this.lastRateLimitLogAt = now;
      const reason = this.getGoogleRequestReason(error) || 'rate_limit';
      console.warn(
        `[GoogleSyncEngine] Google rate limited (${reason}). Backing off until ${new Date(
          until
        ).toISOString()}.`
      );
    }
  }

  private createRateLimitAbortError() {
    const error = new Error('GOOGLE_RATE_LIMIT_ABORT');
    (error as Error & { code?: string }).code = 'GOOGLE_RATE_LIMIT_ABORT';
    return error;
  }

  private isRateLimitAbortError(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const maybe = error as Error & { code?: string };
    return maybe.code === 'GOOGLE_RATE_LIMIT_ABORT' || maybe.message === 'GOOGLE_RATE_LIMIT_ABORT';
  }

  private async syncLocalEventFromRemote(
    userId: string,
    event: CalendarEvent,
    calendarId: string,
    remote: GoogleEvent
  ) {
    // Delete stale links FIRST (before upsert) to avoid 409
    // on the (user_id, local_id, resource_type, local_type) unique constraint.
    await supabase
      .from('google_resource_links')
      .delete()
      .eq('local_id', event.id)
      .eq('resource_type', 'event')
      .neq('google_id', remote.id);

    await this.upsertLink({
      user_id: userId,
      local_id: event.id,
      local_type: 'calendar_event',
      google_id: remote.id,
      resource_type: 'event',
      calendar_id: calendarId,
      remote_etag: remote.etag || null,
      remote_updated_at: remote.updated || null,
      direction: 'push',
    });

    await this.patchLocalEvent(event.id, {
      google_event_id: remote.id,
      google_calendar_id: calendarId,
      google_etag: remote.etag || null,
      remote_updated_at: remote.updated || nowIso(),
      updated_at: remote.updated || event.updated_at,
      is_unsynced: false,
      deleted_at: null,
    });
  }

  private async runSyncCycle(
    userId: string,
    options: { forceFullPull: boolean; forceFullTaskPull: boolean }
  ) {
    const { forceFullPull, forceFullTaskPull } = options;
    if (!this.migratedUsers.has(userId)) {
      await this.migrateLegacyEventItems(userId);
      this.migratedUsers.add(userId);
    }

    // Step 5: One-time reconciliation pass to fix timestamp drift
    if (!this.reconciledUsers.has(userId)) {
      await this.reconcileTimestampDrift(userId);
      this.reconciledUsers.add(userId);
    }

    const phaseErrors: Array<{ phase: string; error: unknown }> = [];
    console.log('[GoogleSyncEngine] === Sync cycle START ===');

    // Ensure we have a valid Supabase session BEFORE doing anything
    const sessionOk = await this.ensureFreshSupabaseSession();
    if (!sessionOk) {
      console.error('[GoogleSyncEngine] No valid Supabase session — skipping sync cycle.');
      return;
    }
    this.consecutiveSupabaseAuthErrors = 0;

    let links = await this.getAllLinks(userId);
    console.log(`[GoogleSyncEngine] Phase: pushLocalEvents (${links.length} links)`);

    try {
      await this.pushLocalEvents(userId, links);
    } catch (error) {
      if (isNoGoogleAccessTokenError(error)) throw error;
      if (this.isRateLimitAbortError(error)) throw error;
      if (error instanceof Error && error.message === 'SUPABASE_AUTH_ABORT') throw error;
      phaseErrors.push({ phase: 'pushLocalEvents', error });
    }

    links = await this.getAllLinks(userId);
    console.log('[GoogleSyncEngine] Phase: pushLocalTasks');
    try {
      await this.pushLocalTasks(userId, links);
    } catch (error) {
      if (isNoGoogleAccessTokenError(error)) throw error;
      if (this.isRateLimitAbortError(error)) throw error;
      if (error instanceof Error && error.message === 'SUPABASE_AUTH_ABORT') throw error;
      phaseErrors.push({ phase: 'pushLocalTasks', error });
    }

    links = await this.getAllLinks(userId);
    console.log('[GoogleSyncEngine] Phase: pushLocalItems');
    try {
      await this.pushLocalItems(userId, links);
    } catch (error) {
      if (isNoGoogleAccessTokenError(error)) throw error;
      if (this.isRateLimitAbortError(error)) throw error;
      if (error instanceof Error && error.message === 'SUPABASE_AUTH_ABORT') throw error;
      phaseErrors.push({ phase: 'pushLocalItems', error });
    }

    links = await this.getAllLinks(userId);
    console.log('[GoogleSyncEngine] Phase: pullRemoteEvents');
    try {
      await this.pullRemoteEvents(userId, links, forceFullPull);
    } catch (error) {
      if (isNoGoogleAccessTokenError(error)) throw error;
      if (this.isRateLimitAbortError(error)) throw error;
      if (error instanceof Error && error.message === 'SUPABASE_AUTH_ABORT') throw error;
      phaseErrors.push({ phase: 'pullRemoteEvents', error });
    }

    links = await this.getAllLinks(userId);
    console.log('[GoogleSyncEngine] Phase: pullRemoteTasks');
    try {
      await this.pullRemoteTasks(userId, links, forceFullTaskPull);
    } catch (error) {
      if (isNoGoogleAccessTokenError(error)) throw error;
      if (this.isRateLimitAbortError(error)) throw error;
      if (error instanceof Error && error.message === 'SUPABASE_AUTH_ABORT') throw error;
      phaseErrors.push({ phase: 'pullRemoteTasks', error });
    }

    const store = useAppStore.getState();
    console.log(`[GoogleSyncEngine] === Sync cycle END === Events: ${store.calendarEvents.length}, Tasks: ${store.tasks.length}, GoogleTaskEvents: ${store.calendarEvents.filter(e => e.is_google_task).length}`);

    if (phaseErrors.length > 0) {
      console.warn(
        `[GoogleSyncEngine] Sync cycle completed with ${phaseErrors.length} phase error(s):`,
        phaseErrors.map((e) => `${e.phase}: ${e.error instanceof Error ? e.error.message : e.error}`)
      );
      // Schedule a shorter retry so the failed phases recover faster
      this.scheduleSync('phase-error-retry', SHORT_RETRY_INTERVAL_MS);
    }
  }

  /**
   * PERMANENTLY DISABLED — was the root cause of catastrophic
   * duplication storms (mass-marking entities is_unsynced every session).
   */
  private static readonly RECONCILE_STORAGE_KEY = 'stash_reconcile_done_v2';

  private async reconcileTimestampDrift(_userId: string) {
    // PERMANENTLY DISABLED — this function was the root cause of
    // catastrophic duplication storms. It mass-marked entities as
    // is_unsynced which made the push phase recreate them on Google
    // every single session. Never re-enable.
    console.info('[GoogleSyncEngine] reconcileTimestampDrift permanently disabled.');
    try { localStorage.setItem(GoogleSyncEngine.RECONCILE_STORAGE_KEY, Date.now().toString()); } catch { /* */ }
  }

  private async migrateLegacyEventItems(userId: string) {
    const state = useAppStore.getState();
    const legacyEvents = state.items.filter((item) => item.user_id === userId && item.type === 'event');
    if (!legacyEvents.length) return;

    const existingById = new Set(state.calendarEvents.map((e) => e.id));
    const now = nowIso();
    const createdEvents: CalendarEvent[] = [];

    for (const item of legacyEvents) {
      if (existingById.has(item.id)) continue;

      const content = item.content as Record<string, unknown>;
      const startAt = item.scheduled_at || now;
      const endAt =
        typeof content.end_time === 'string' && content.end_time
          ? content.end_time
          : new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();

      const attendees = Array.isArray(content.attendees)
        ? (content.attendees as string[]).map((email) => ({ email }))
        : [];

      const reminders: CalendarEvent['reminders'] = Array.isArray(content.notifications)
        ? (content.notifications as Array<{ method?: 'popup' | 'email'; minutes?: number }>).map((n) => ({
            method: n.method === 'email' ? 'email' : 'popup',
            minutes: typeof n.minutes === 'number' ? n.minutes : 10,
          }))
        : [{ method: 'popup', minutes: 10 }];

      const event: CalendarEvent = {
        id: item.id,
        user_id: userId,
        title: item.title,
        description: typeof content.description === 'string' ? content.description : '',
        start_at: startAt,
        end_at: endAt,
        is_all_day: content.is_all_day === true,
        rrule: typeof content.rrule === 'string' ? content.rrule : null,
        parent_event_id: null,
        recurring_event_id: null,
        is_deleted_instance: false,
        location: typeof content.location === 'string' ? content.location : '',
        color_id: typeof content.color_id === 'string' ? content.color_id : '7',
        visibility:
          content.visibility === 'public' || content.visibility === 'private'
            ? content.visibility
            : 'default',
        transparency: content.show_as === 'free' ? 'transparent' : 'opaque',
        timezone:
          typeof content.timezone === 'string' && content.timezone
            ? content.timezone
            : Intl.DateTimeFormat().resolvedOptions().timeZone,
        attendees,
        conference_data:
          typeof content.meet_link === 'string' && content.meet_link
            ? { meetLink: content.meet_link, entryPoints: [] }
            : null,
        reminders,
        attachments: [],
        google_event_id: typeof content.google_event_id === 'string' ? content.google_event_id : null,
        google_calendar_id: typeof content.calendar_id === 'string' ? content.calendar_id : 'primary',
        google_etag: null,
        remote_updated_at: null,
        created_at: item.created_at,
        updated_at: item.updated_at,
        deleted_at: item.deleted_at,
        is_unsynced: true,
      };

      createdEvents.push(event);
    }

    if (!createdEvents.length) return;

    useAppStore.setState((s) => ({
      calendarEvents: [...createdEvents, ...s.calendarEvents],
      items: s.items.map((item) =>
        item.user_id === userId && item.type === 'event'
          ? {
              ...item,
              is_archived: true,
              deleted_at: item.deleted_at || now,
              updated_at: now,
              is_unsynced: true,
            }
          : item
      ),
    }));

    for (const event of createdEvents) {
      await useAppStore.getState().syncEventToDb(event);
    }
    for (const item of legacyEvents) {
      const updatedItem = useAppStore.getState().items.find((i) => i.id === item.id);
      if (updatedItem) {
        await useAppStore.getState().syncItemToDb(updatedItem);
      }
    }
  }

  private async getAllLinks(userId: string): Promise<GoogleResourceLinkRow[]> {
    // Paginate to load ALL links (Supabase default limit is 1000)
    const PAGE_SIZE = 1000;
    let allLinks: GoogleResourceLinkRow[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('google_resource_links')
        .select('*')
        .eq('user_id', userId)
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.warn('[GoogleSyncEngine] Failed loading links:', error.message);
        return allLinks; // Return what we have so far
      }

      allLinks = allLinks.concat((data || []) as GoogleResourceLinkRow[]);
      hasMore = (data?.length ?? 0) === PAGE_SIZE;
      from += PAGE_SIZE;
    }

    return allLinks;
  }

  private async getCursor(userId: string, resourceType: CursorResourceType, scopeId: string) {
    const { data, error } = await supabase
      .from('google_sync_cursors')
      .select('user_id, resource_type, scope_id, sync_token, last_pulled_at')
      .eq('user_id', userId)
      .eq('resource_type', resourceType)
      .eq('scope_id', scopeId)
      .maybeSingle();
    if (error) {
      console.warn('[GoogleSyncEngine] Failed loading cursor:', error.message);
      return null;
    }
    return (data || null) as GoogleSyncCursorRow | null;
  }

  private async upsertCursor(
    userId: string,
    resourceType: CursorResourceType,
    scopeId: string,
    values: { sync_token?: string | null; last_pulled_at?: string | null }
  ) {
    const payload = {
      user_id: userId,
      resource_type: resourceType,
      scope_id: scopeId,
      sync_token: values.sync_token ?? null,
      last_pulled_at: values.last_pulled_at ?? nowIso(),
      updated_at: nowIso(),
    };
    const { error } = await supabase
      .from('google_sync_cursors')
      .upsert(payload, { onConflict: 'user_id,resource_type,scope_id' });
    if (error) {
      console.warn('[GoogleSyncEngine] Failed saving cursor:', error.message);
    }
  }

  private async clearCursor(userId: string, resourceType: CursorResourceType, scopeId: string) {
    const { error } = await supabase
      .from('google_sync_cursors')
      .delete()
      .eq('user_id', userId)
      .eq('resource_type', resourceType)
      .eq('scope_id', scopeId);
    if (error) {
      console.warn('[GoogleSyncEngine] Failed clearing cursor:', error.message);
    }
  }

  private async upsertLink(input: {
    user_id: string;
    local_id: string;
    local_type: GoogleResourceLinkRow['local_type'];
    google_id: string;
    resource_type: GoogleResourceLinkRow['resource_type'];
    calendar_id?: string | null;
    task_list_id?: string | null;
    remote_etag?: string | null;
    remote_updated_at?: string | null;
    direction: SyncDirection;
  }): Promise<boolean> {
    // Delete any existing link for this entity+type that points to a DIFFERENT
    // google_id. This prevents 409 conflicts on the
    // (user_id, local_id, resource_type, local_type) unique index when the
    // google_id has changed (e.g. after 404 re-create).
    await supabase
      .from('google_resource_links')
      .delete()
      .eq('user_id', input.user_id)
      .eq('local_id', input.local_id)
      .eq('resource_type', input.resource_type)
      .eq('local_type', input.local_type)
      .neq('google_id', input.google_id);

    const payload = {
      user_id: input.user_id,
      local_id: input.local_id,
      local_type: input.local_type,
      google_id: input.google_id,
      resource_type: input.resource_type,
      calendar_id: input.calendar_id ?? null,
      task_list_id: input.task_list_id ?? null,
      remote_etag: input.remote_etag ?? null,
      remote_updated_at: input.remote_updated_at ?? null,
      last_sync_direction: input.direction,
      last_synced_at: nowIso(),
      retry_count: 0,
      next_retry_at: null,
      error: null,
    };

    const { error } = await supabase
      .from('google_resource_links')
      .upsert(payload, { onConflict: 'local_id,google_id' });

    if (error) {
      // RLS / auth failure (401/403) — refresh session and retry ONCE
      const isAuthError = error.message?.includes('row-level security') ||
        error.code === '42501' || error.code === 'PGRST301';
      if (isAuthError) {
        console.warn('[GoogleSyncEngine] upsertLink RLS error — refreshing session and retrying...');
        const sessionOk = await this.ensureFreshSupabaseSession();
        if (sessionOk) {
          const { error: retryError } = await supabase
            .from('google_resource_links')
            .upsert(payload, { onConflict: 'local_id,google_id' });
          if (!retryError) {
            this.consecutiveSupabaseAuthErrors = 0;
            return true;
          }
          console.error('[GoogleSyncEngine] upsertLink retry after session refresh also failed:', retryError.message);
        }
        this.consecutiveSupabaseAuthErrors++;
        if (this.consecutiveSupabaseAuthErrors >= GoogleSyncEngine.MAX_SUPABASE_AUTH_ERRORS) {
          console.error(`[GoogleSyncEngine] ${this.consecutiveSupabaseAuthErrors} consecutive Supabase auth errors — ABORTING sync cycle`);
          throw new Error('SUPABASE_AUTH_ABORT');
        }
        return false;
      }

      // If we STILL get a 409, do a hard DELETE of ALL rows for this
      // (local_id, resource_type) and then a plain INSERT.
      if (error.code === '23505') {
        console.warn('[GoogleSyncEngine] upsertLink 409 — falling back to DELETE+INSERT for', input.local_id);
        await supabase
          .from('google_resource_links')
          .delete()
          .eq('local_id', input.local_id)
          .eq('resource_type', input.resource_type);
        const { error: insertError } = await supabase
          .from('google_resource_links')
          .insert(payload);
        if (insertError) {
          console.error('[GoogleSyncEngine] upsertLink INSERT fallback also failed:', insertError.message);
          return false;
        }
      } else {
        console.warn('[GoogleSyncEngine] Failed upserting link:', error.message);
        return false;
      }
    }
    this.consecutiveSupabaseAuthErrors = 0;
    return true;
  }

  private getRetryBackoffMs(retryCount: number) {
    const exponent = Math.max(0, retryCount - 1);
    return Math.min(MAX_RETRY_BACKOFF_MS, BASE_RETRY_BACKOFF_MS * (2 ** exponent));
  }

  private isRetryBlocked(link?: GoogleResourceLinkRow | null) {
    if (!link?.next_retry_at) return false;
    const nextRetryMs = safeDateMs(link.next_retry_at);
    return !Number.isNaN(nextRetryMs) && nextRetryMs > Date.now();
  }

  private isPermanentlyFailed(link?: GoogleResourceLinkRow | null) {
    return link?.error === 'max_retries_exceeded';
  }

  private async clearLinkError(
    localId: string,
    resourceType: 'event' | 'task',
    localType?: GoogleResourceLinkRow['local_type']
  ) {
    let query = supabase
      .from('google_resource_links')
      .update({
        retry_count: 0,
        next_retry_at: null,
        error: null,
      })
      .eq('local_id', localId)
      .eq('resource_type', resourceType);

    if (localType) {
      query = query.eq('local_type', localType);
    }

    await query;
  }

  private async markLinkError(
    localId: string,
    resourceType: 'event' | 'task',
    errorText: string,
    localType: GoogleResourceLinkRow['local_type'],
    options?: {
      calendarId?: string | null;
      taskListId?: string | null;
      googleId?: string | null;
    }
  ) {
    const { data: existing } = await supabase
      .from('google_resource_links')
      .select('id,retry_count,google_id')
      .eq('local_id', localId)
      .eq('resource_type', resourceType)
      .eq('local_type', localType)
      .order('last_synced_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const retryCount = Math.max(0, existing?.retry_count || 0) + 1;
    const maxRetriesExceeded = retryCount >= MAX_RETRY_COUNT;
    const nextRetryAt = maxRetriesExceeded
      ? null
      : new Date(Date.now() + this.getRetryBackoffMs(retryCount)).toISOString();
    const finalError = maxRetriesExceeded ? 'max_retries_exceeded' : errorText;

    if (existing?.id) {
      await supabase
        .from('google_resource_links')
        .update({
          error: finalError,
          retry_count: retryCount,
          next_retry_at: nextRetryAt,
        })
        .eq('id', existing.id);
      if (maxRetriesExceeded) {
        console.warn(`[GoogleSyncEngine] Max retries (${MAX_RETRY_COUNT}) exceeded for link ${existing.id}. Permanently paused.`);
      }
      return;
    }

    const userId = this.activeUserId || useAppStore.getState().user?.id;
    if (!userId) return;

    const pendingGoogleId =
      options?.googleId ||
      `pending:${resourceType}:${localType}:${localId}`;

    await supabase.from('google_resource_links').upsert(
      {
        user_id: userId,
        local_id: localId,
        local_type: localType,
        google_id: pendingGoogleId,
        resource_type: resourceType,
        calendar_id: options?.calendarId ?? null,
        task_list_id: options?.taskListId ?? null,
        last_sync_direction: 'none',
        last_synced_at: nowIso(),
        retry_count: retryCount,
        next_retry_at: nextRetryAt,
        error: finalError,
      },
      { onConflict: 'local_id,google_id' }
    );
  }

  private async deleteLinkById(linkId: string) {
    await supabase.from('google_resource_links').delete().eq('id', linkId);
  }

  private async patchLocalEvent(eventId: string, updates: Partial<CalendarEvent>) {
    const state = useAppStore.getState();
    const existing = state.calendarEvents.find((e) => e.id === eventId);
    if (!existing) return;
    const merged = { ...existing, ...updates };
    useAppStore.setState((s) => ({
      calendarEvents: s.calendarEvents.map((e) => (e.id === eventId ? merged : e)),
    }));
    await useAppStore.getState().syncEventToDb(merged);
  }

  private async createLocalEvent(event: CalendarEvent) {
    const storeEvents = useAppStore.getState().calendarEvents;

    // Dedup guard: if an event with the same google_event_id already exists, patch instead
    if (event.google_event_id) {
      const dup = storeEvents.find(
        (e) => e.google_event_id === event.google_event_id
      );
      if (dup) {
        await this.patchLocalEvent(dup.id, event);
        return;
      }
    }

    // Dedup guard: if a Google Task event with the same google_task_id already exists, patch instead
    if (event.google_task_id) {
      const dup = storeEvents.find(
        (e) => e.google_task_id === event.google_task_id
      );
      if (dup) {
        await this.patchLocalEvent(dup.id, event);
        return;
      }

      // Fallback dedup: match task events by title + google_calendar_id='tasks'
      // (catches old duplicates where google_task_id was stripped by sanitizer)
      const titleDup = storeEvents.find(
        (e) => e.google_calendar_id === 'tasks' && e.title === event.title && !e.google_task_id
      );
      if (titleDup) {
        await this.patchLocalEvent(titleDup.id, event);
        return;
      }
    }

    useAppStore.setState((s) => ({
      calendarEvents: [event, ...s.calendarEvents],
    }));
    await useAppStore.getState().syncEventToDb(event);
  }

  private async patchLocalTask(taskId: string, updates: Partial<Task>) {
    const state = useAppStore.getState();
    const existing = state.tasks.find((t) => t.id === taskId);
    if (!existing) return;
    const merged = { ...existing, ...updates };
    useAppStore.setState((s) => ({
      tasks: s.tasks.map((t) => (t.id === taskId ? merged : t)),
    }));
    await useAppStore.getState().syncTaskToDb(merged);
  }

  // @ts-expect-error kept for potential future use in pullRemoteTasks refactor
  private async createLocalTask(task: Task) {
    // Dedup guard: if a task with the same google_task_id already exists, patch instead
    if (task.google_task_id) {
      const dup = useAppStore.getState().tasks.find(
        (t) => t.google_task_id === task.google_task_id
      );
      if (dup) {
        await this.patchLocalTask(dup.id, task);
        return;
      }
    }
    useAppStore.setState((s) => ({
      tasks: [task, ...s.tasks],
    }));
    await useAppStore.getState().syncTaskToDb(task);
  }

  private async patchLocalItem(itemId: string, updates: Partial<Item>) {
    const state = useAppStore.getState();
    const existing = state.items.find((i) => i.id === itemId);
    if (!existing) return;
    const merged = { ...existing, ...updates };
    useAppStore.setState((s) => ({
      items: s.items.map((i) => (i.id === itemId ? merged : i)),
    }));
    await useAppStore.getState().syncItemToDb(merged);
  }

  private notifyOverwrite(entity: 'Event' | 'Task', title: string) {
    useAppStore
      .getState()
      .addNotification?.('info', `${entity} updated`, `"${title}" was overwritten by a newer edit.`);
  }

  private notifySyncPaused(
    entity: 'event' | 'task' | 'item',
    entityId: string,
    title: string
  ) {
    const headline = entity === 'item' ? 'Item sync paused' : `${entity[0].toUpperCase()}${entity.slice(1)} sync paused`;
    useAppStore.getState().addNotification?.(
      'warning',
      headline,
      `"${title || '(Untitled)'}" needs attention before it can sync.`,
      'Retry',
      () => {
        void this.retryEntity(entity, entityId);
      }
    );
  }

  private async retryEntity(entity: 'event' | 'task' | 'item', id: string) {
    if (entity === 'event') {
      await this.clearLinkError(id, 'event', 'calendar_event');
      await this.patchLocalEvent(id, { is_unsynced: true, updated_at: nowIso() });
    } else if (entity === 'task') {
      await this.clearLinkError(id, 'task', 'task');
      await this.patchLocalTask(id, { is_unsynced: true, updated_at: nowIso() });
    } else {
      await this.clearLinkError(id, 'event', 'item');
      await this.clearLinkError(id, 'task', 'item');
      await this.patchLocalItem(id, { is_unsynced: true, updated_at: nowIso() });
    }
    this.scheduleSync('manual-retry', 200);
  }

  private findEventLink(
    links: GoogleResourceLinkRow[],
    calendarId: string,
    googleEventId: string
  ) {
    return links.find(
      (l) =>
        l.resource_type === 'event' &&
        l.google_id === googleEventId &&
        (l.calendar_id || 'primary') === calendarId
    );
  }

  private findTaskLink(
    links: GoogleResourceLinkRow[],
    taskListId: string,
    googleTaskId: string,
    localType?: GoogleResourceLinkRow['local_type']
  ) {
    return links.find(
      (l) =>
        l.resource_type === 'task' &&
        (!localType || l.local_type === localType) &&
        l.google_id === googleTaskId &&
        (l.task_list_id || '@default') === taskListId
    );
  }

  private async pushLocalEvents(userId: string, links: GoogleResourceLinkRow[]) {
    const state = useAppStore.getState();
    const unsyncedEvents = state.calendarEvents.filter(
      (e) => e.user_id === userId && e.is_unsynced && !e.is_google_task && e.google_calendar_id !== 'tasks'
    ).sort((a, b) => {
      const aNeedsCreate = !a.google_event_id;
      const bNeedsCreate = !b.google_event_id;
      if (aNeedsCreate !== bNeedsCreate) {
        return aNeedsCreate ? -1 : 1;
      }
      const aUpdatedMs = safeDateMs(a.updated_at);
      const bUpdatedMs = safeDateMs(b.updated_at);
      if (Number.isNaN(aUpdatedMs) && Number.isNaN(bUpdatedMs)) return 0;
      if (Number.isNaN(aUpdatedMs)) return 1;
      if (Number.isNaN(bUpdatedMs)) return -1;
      return bUpdatedMs - aUpdatedMs;
    }).slice(0, MAX_PUSH_EVENTS_PER_CYCLE);

    for (const event of unsyncedEvents) {
      const calendarId = event.google_calendar_id || 'primary';
      const linked = event.google_event_id
        ? this.findEventLink(links, calendarId, event.google_event_id)
        : links.find((l) => l.resource_type === 'event' && l.local_id === event.id);

      if (this.isRetryBlocked(linked) || this.isPermanentlyFailed(linked)) {
        continue;
      }

      try {
        if (event.deleted_at) {
          if (event.google_event_id) {
            try {
              await GoogleClient.deleteEvent(calendarId, event.google_event_id);
            } catch (deleteError) {
              if (isNoGoogleAccessTokenError(deleteError)) {
                this.markAuthUnavailable();
                throw deleteError;
              }
              const status = this.getGoogleRequestStatus(deleteError);
              if (status !== 404 && status !== 410) {
                throw deleteError;
              }
            }
          }
          if (linked) {
            await this.deleteLinkById(linked.id);
          }
          await this.patchLocalEvent(event.id, {
            is_unsynced: false,
            remote_updated_at: nowIso(),
          });
          await this.clearLinkError(event.id, 'event', 'calendar_event');
          continue;
        }

        const payload = toGoogleEventPayload(event);
        let remote: GoogleEvent;

        if (event.google_event_id) {
          try {
            remote = await GoogleClient.patchEvent(calendarId, event.google_event_id, payload);
          } catch (updateError) {
            if (isNoGoogleAccessTokenError(updateError)) {
              this.markAuthUnavailable();
              throw updateError;
            }

            const status = this.getGoogleRequestStatus(updateError);
            if (status === 404 || status === 410) {
              remote = await GoogleClient.createEvent(calendarId, payload);
            } else if (status === 400) {
              try {
                remote = await GoogleClient.patchEvent(
                  calendarId,
                  event.google_event_id,
                  toGoogleEventPayload(event, { minimal: true })
                );
              } catch (fallbackError) {
                if (isNoGoogleAccessTokenError(fallbackError)) {
                  this.markAuthUnavailable();
                  throw fallbackError;
                }
                const fallbackStatus = this.getGoogleRequestStatus(fallbackError);
                if (fallbackStatus === 404 || fallbackStatus === 410) {
                  remote = await GoogleClient.createEvent(
                    calendarId,
                    toGoogleEventPayload(event, { minimal: true })
                  );
                } else if (fallbackStatus === 400) {
                  throw fallbackError;
                } else {
                  throw fallbackError;
                }
              }
            } else {
              throw updateError;
            }
          }
        } else {
          try {
            remote = await GoogleClient.createEvent(calendarId, payload);
          } catch (createError) {
            if (isNoGoogleAccessTokenError(createError)) {
              this.markAuthUnavailable();
              throw createError;
            }
            const status = this.getGoogleRequestStatus(createError);
            if (status === 400) {
              remote = await GoogleClient.createEvent(
                calendarId,
                toGoogleEventPayload(event, { minimal: true })
              );
            } else {
              throw createError;
            }
          }
        }

        await this.syncLocalEventFromRemote(userId, event, calendarId, remote);
        await this.clearLinkError(event.id, 'event', 'calendar_event');
      } catch (error) {
        if (isNoGoogleAccessTokenError(error)) {
          this.markAuthUnavailable();
          throw error;
        }
        if (this.isGoogleRateLimitError(error)) {
          const message = error instanceof Error ? error.message : 'Google rate limit exceeded';
          await this.markLinkError(event.id, 'event', message, 'calendar_event', {
            calendarId,
            googleId: event.google_event_id,
          });
          this.markRateLimited(error);
          throw this.createRateLimitAbortError();
        }
        const status = this.getGoogleRequestStatus(error);
        const message = error instanceof Error ? error.message : 'Event sync failed';
        console.warn('[GoogleSyncEngine] Push event failed:', message);
        await this.markLinkError(event.id, 'event', message, 'calendar_event', {
          calendarId,
          googleId: event.google_event_id,
        });

        if (status === 400) {
          await this.patchLocalEvent(event.id, {
            is_unsynced: false,
            updated_at: nowIso(),
          });
          this.notifySyncPaused('event', event.id, event.title);
        } else if (!linked) {
          useAppStore.getState().addNotification?.(
            'error',
            'Event sync failed',
            `"${event.title}" could not be synced.`
          );
        }
      }
    }
  }

  private async ensureRemoteTaskListId(
    userId: string,
    listId: string | null,
    links: GoogleResourceLinkRow[]
  ) {
    if (!listId) return '@default';

    const linked = links.find(
      (l) => l.resource_type === 'task' && l.local_type === 'list' && l.local_id === listId
    );
    if (linked) {
      return linked.google_id;
    }

    const list = useAppStore.getState().lists.find((l) => l.id === listId);
    if (!list) return '@default';

    const remote = await GoogleClient.createTaskList(list.name || 'My Tasks');
    await this.upsertLink({
      user_id: userId,
      local_id: listId,
      local_type: 'list',
      google_id: remote.id,
      resource_type: 'task',
      task_list_id: remote.id,
      remote_etag: remote.etag || null,
      remote_updated_at: remote.updated || null,
      direction: 'push',
    });
    links.push({
      id: generateId(),
      user_id: userId,
      local_id: listId,
      local_type: 'list',
      google_id: remote.id,
      resource_type: 'task',
      calendar_id: null,
      task_list_id: remote.id,
      remote_etag: remote.etag || null,
      remote_updated_at: remote.updated || null,
      retry_count: 0,
      next_retry_at: null,
      error: null,
    });
    return remote.id;
  }

  private async pushLocalTasks(userId: string, links: GoogleResourceLinkRow[]) {
    const state = useAppStore.getState();
    const unsyncedTasks = state.tasks
      .filter((t) => t.user_id === userId && t.is_unsynced)
      .slice(0, MAX_PUSH_TASKS_PER_CYCLE);

    for (const task of unsyncedTasks) {
      const existingLink = links.find(
        (l) => l.resource_type === 'task' && l.local_type === 'task' && l.local_id === task.id
      );
      if (this.isRetryBlocked(existingLink) || this.isPermanentlyFailed(existingLink)) {
        continue;
      }

      try {
        const taskListId = await this.ensureRemoteTaskListId(userId, task.list_id || null, links);
        const link =
          existingLink ||
          links.find(
            (l) => l.resource_type === 'task' && l.local_type === 'task' && l.local_id === task.id
          );

        const parentGoogleId = task.parent_task_id
          ? links.find(
              (l) =>
                l.resource_type === 'task' &&
                l.local_type === 'task' &&
                l.local_id === task.parent_task_id
            )?.google_id
          : undefined;

        if (task.deleted_at) {
          if (link?.google_id) {
            try {
              await GoogleClient.deleteTask(link.task_list_id || taskListId, link.google_id);
            } catch (deleteError) {
              if (isNoGoogleAccessTokenError(deleteError)) {
                this.markAuthUnavailable();
                throw deleteError;
              }
              const status = this.getGoogleRequestStatus(deleteError);
              if (status !== 404 && status !== 410) {
                throw deleteError;
              }
            }
          }
          if (link) {
            await this.deleteLinkById(link.id);
          }
          await this.patchLocalTask(task.id, {
            is_unsynced: false,
            remote_updated_at: nowIso(),
          });
          await this.clearLinkError(task.id, 'task', 'task');
          continue;
        }

        const payload = toGoogleTaskPayload(task, parentGoogleId);
        let remote: GoogleTask;
        let remoteTaskListId = taskListId;

        if (link?.google_id) {
          const linkedTaskListId = link.task_list_id || taskListId;
          if (linkedTaskListId !== taskListId) {
            remote = await GoogleClient.createTask(taskListId, payload);
            try {
              await GoogleClient.deleteTask(linkedTaskListId, link.google_id);
            } catch (deleteError) {
              if (isNoGoogleAccessTokenError(deleteError)) {
                this.markAuthUnavailable();
                throw deleteError;
              }
              const status = this.getGoogleRequestStatus(deleteError);
              if (status !== 404 && status !== 410) {
                throw deleteError;
              }
            }
            remoteTaskListId = taskListId;
          } else {
            try {
              remote = await GoogleClient.patchTask(linkedTaskListId, link.google_id, payload);
              remoteTaskListId = linkedTaskListId;
            } catch (updateError) {
              if (isNoGoogleAccessTokenError(updateError)) {
                this.markAuthUnavailable();
                throw updateError;
              }
              const status = this.getGoogleRequestStatus(updateError);
              if (status === 404 || status === 410) {
                remote = await GoogleClient.createTask(taskListId, payload);
                remoteTaskListId = taskListId;
              } else if (status === 400) {
                throw updateError;
              } else {
                throw updateError;
              }
            }
          }
        } else {
          try {
            remote = await GoogleClient.createTask(taskListId, payload);
          } catch (createError) {
            if (isNoGoogleAccessTokenError(createError)) {
              this.markAuthUnavailable();
              throw createError;
            }
            const status = this.getGoogleRequestStatus(createError);
            if (status === 400) {
              remote = await GoogleClient.createTask(taskListId, {
                title: task.title || '(No title)',
                status: task.is_completed ? 'completed' : 'needsAction',
                due: task.scheduled_at || undefined,
              });
            } else {
              throw createError;
            }
          }
        }

        await this.upsertLink({
          user_id: userId,
          local_id: task.id,
          local_type: 'task',
          google_id: remote.id,
          resource_type: 'task',
          task_list_id: remoteTaskListId,
          remote_etag: remote.etag || null,
          remote_updated_at: remote.updated || null,
          direction: 'push',
        });

        await this.patchLocalTask(task.id, {
          google_task_id: remote.id,
          google_etag: remote.etag || null,
          remote_updated_at: remote.updated || nowIso(),
          sort_position: remote.position || task.sort_position || null,
          is_unsynced: false,
          updated_at: remote.updated || task.updated_at,
        });
        await this.clearLinkError(task.id, 'task', 'task');
      } catch (error) {
        if (isNoGoogleAccessTokenError(error)) {
          this.markAuthUnavailable();
          throw error;
        }
        if (this.isGoogleRateLimitError(error)) {
          const message = error instanceof Error ? error.message : 'Google rate limit exceeded';
          await this.markLinkError(task.id, 'task', message, 'task', {
            taskListId: task.list_id || null,
            googleId: existingLink?.google_id || null,
          });
          this.markRateLimited(error);
          throw this.createRateLimitAbortError();
        }
        const status = this.getGoogleRequestStatus(error);
        const message = error instanceof Error ? error.message : 'Task sync failed';
        console.warn('[GoogleSyncEngine] Push task failed:', message);
        await this.markLinkError(task.id, 'task', message, 'task', {
          taskListId: task.list_id || null,
          googleId: existingLink?.google_id || null,
        });
        if (status === 400) {
          await this.patchLocalTask(task.id, {
            is_unsynced: false,
            updated_at: nowIso(),
          });
          this.notifySyncPaused('task', task.id, task.title);
        } else {
          useAppStore
            .getState()
            .addNotification?.('error', 'Task sync failed', `"${task.title}" could not be synced.`);
        }
      }
    }
  }

  private async pushLocalItems(userId: string, links: GoogleResourceLinkRow[]) {
    const state = useAppStore.getState();
    const unsyncedItems = state.items.filter(
      (item) => item.user_id === userId && item.type !== 'event' && item.is_unsynced
    ).slice(0, MAX_PUSH_ITEMS_PER_CYCLE);

    for (const item of unsyncedItems) {
      const itemLinks = links.filter(
        (l) => l.local_type === 'item' && l.local_id === item.id && (l.resource_type === 'event' || l.resource_type === 'task')
      );
      const meta = getItemSyncMeta(item);
      const target = meta.google_sync_target || itemLinks[0]?.resource_type || null;
      const shouldUnschedule = !!item.deleted_at || !item.scheduled_at || !target;

      try {
        if (shouldUnschedule) {
          for (const link of itemLinks) {
            try {
              if (link.resource_type === 'event' && link.google_id) {
                await GoogleClient.deleteEvent(link.calendar_id || 'primary', link.google_id);
              } else if (link.resource_type === 'task' && link.google_id) {
                await GoogleClient.deleteTask(link.task_list_id || '@default', link.google_id);
              }
            } catch (deleteError) {
              if (isNoGoogleAccessTokenError(deleteError)) {
                this.markAuthUnavailable();
                throw deleteError;
              }
              const status = this.getGoogleRequestStatus(deleteError);
              if (status !== 404 && status !== 410) {
                throw deleteError;
              }
            }
            await this.deleteLinkById(link.id);
          }

          await this.patchLocalItem(item.id, {
            is_unsynced: false,
            updated_at: nowIso(),
            content: mergeItemSyncMeta(item, {
              google_sync_target: null,
              google_sync_calendar_id: null,
              google_sync_task_list_id: null,
            }),
          });
          await this.clearLinkError(item.id, 'event', 'item');
          await this.clearLinkError(item.id, 'task', 'item');
          continue;
        }

        // Remove stale links that point to the wrong Google resource type.
        const staleLinks = itemLinks.filter((l) => l.resource_type !== target);
        for (const stale of staleLinks) {
          try {
            if (stale.resource_type === 'event' && stale.google_id) {
              await GoogleClient.deleteEvent(stale.calendar_id || 'primary', stale.google_id);
            } else if (stale.resource_type === 'task' && stale.google_id) {
              await GoogleClient.deleteTask(stale.task_list_id || '@default', stale.google_id);
            }
          } catch (deleteError) {
            if (isNoGoogleAccessTokenError(deleteError)) {
              this.markAuthUnavailable();
              throw deleteError;
            }
            const status = this.getGoogleRequestStatus(deleteError);
            if (status !== 404 && status !== 410) {
              throw deleteError;
            }
          }
          await this.deleteLinkById(stale.id);
        }

        const link = itemLinks.find((l) => l.resource_type === target);
        if (this.isRetryBlocked(link) || this.isPermanentlyFailed(link)) {
          continue;
        }

        if (target === 'event') {
          const calendarId = meta.google_sync_calendar_id || link?.calendar_id || 'primary';
          const payload = toGoogleEventPayloadFromItem(item);
          let remote: GoogleEvent;

          if (link?.google_id) {
            try {
              remote = await GoogleClient.patchEvent(calendarId, link.google_id, payload);
            } catch (updateError) {
              if (isNoGoogleAccessTokenError(updateError)) {
                this.markAuthUnavailable();
                throw updateError;
              }
              const status = this.getGoogleRequestStatus(updateError);
              if (status === 404 || status === 410) {
                remote = await GoogleClient.createEvent(calendarId, payload);
              } else if (status === 400) {
                remote = await GoogleClient.patchEvent(
                  calendarId,
                  link.google_id,
                  toGoogleEventPayloadFromItem(item, { minimal: true })
                );
              } else {
                throw updateError;
              }
            }
          } else {
            try {
              remote = await GoogleClient.createEvent(calendarId, payload);
            } catch (createError) {
              if (isNoGoogleAccessTokenError(createError)) {
                this.markAuthUnavailable();
                throw createError;
              }
              const status = this.getGoogleRequestStatus(createError);
              if (status === 400) {
                remote = await GoogleClient.createEvent(
                  calendarId,
                  toGoogleEventPayloadFromItem(item, { minimal: true })
                );
              } else {
                throw createError;
              }
            }
          }

          await this.upsertLink({
            user_id: userId,
            local_id: item.id,
            local_type: 'item',
            google_id: remote.id,
            resource_type: 'event',
            calendar_id: calendarId,
            remote_etag: remote.etag || null,
            remote_updated_at: remote.updated || null,
            direction: 'push',
          });

          await supabase
            .from('google_resource_links')
            .delete()
            .eq('local_id', item.id)
            .eq('local_type', 'item')
            .eq('resource_type', 'event')
            .neq('google_id', remote.id);

          await this.patchLocalItem(item.id, {
            is_unsynced: false,
            updated_at: remote.updated || nowIso(),
            scheduled_at: parseGoogleDate(remote.start?.dateTime || remote.start?.date) || item.scheduled_at,
            content: mergeItemSyncMeta(item, {
              google_sync_target: 'event',
              google_sync_calendar_id: calendarId,
              google_sync_task_list_id: null,
            }),
          });
          await this.clearLinkError(item.id, 'event', 'item');
        } else {
          const taskListId = meta.google_sync_task_list_id || link?.task_list_id || '@default';
          const payload = toGoogleTaskPayloadFromItem(item);
          let remote: GoogleTask;

          if (link?.google_id) {
            try {
              remote = await GoogleClient.patchTask(taskListId, link.google_id, payload);
            } catch (updateError) {
              if (isNoGoogleAccessTokenError(updateError)) {
                this.markAuthUnavailable();
                throw updateError;
              }
              const status = this.getGoogleRequestStatus(updateError);
              if (status === 404 || status === 410) {
                remote = await GoogleClient.createTask(taskListId, payload);
              } else if (status === 400) {
                remote = await GoogleClient.patchTask(taskListId, link.google_id, {
                  title: item.title || '(No title)',
                  status: item.is_completed ? 'completed' : 'needsAction',
                  due: item.scheduled_at || undefined,
                });
              } else {
                throw updateError;
              }
            }
          } else {
            try {
              remote = await GoogleClient.createTask(taskListId, payload);
            } catch (createError) {
              if (isNoGoogleAccessTokenError(createError)) {
                this.markAuthUnavailable();
                throw createError;
              }
              const status = this.getGoogleRequestStatus(createError);
              if (status === 400) {
                remote = await GoogleClient.createTask(taskListId, {
                  title: item.title || '(No title)',
                  status: item.is_completed ? 'completed' : 'needsAction',
                  due: item.scheduled_at || undefined,
                });
              } else {
                throw createError;
              }
            }
          }

          await this.upsertLink({
            user_id: userId,
            local_id: item.id,
            local_type: 'item',
            google_id: remote.id,
            resource_type: 'task',
            task_list_id: taskListId,
            remote_etag: remote.etag || null,
            remote_updated_at: remote.updated || null,
            direction: 'push',
          });

          await supabase
            .from('google_resource_links')
            .delete()
            .eq('local_id', item.id)
            .eq('local_type', 'item')
            .eq('resource_type', 'task')
            .neq('google_id', remote.id);

          await this.patchLocalItem(item.id, {
            is_unsynced: false,
            updated_at: remote.updated || nowIso(),
            is_completed: remote.status === 'completed',
            scheduled_at: parseGoogleDate(remote.due) || item.scheduled_at,
            content: mergeItemSyncMeta(item, {
              google_sync_target: 'task',
              google_sync_task_list_id: taskListId,
              google_sync_calendar_id: null,
            }),
          });
          await this.clearLinkError(item.id, 'task', 'item');
        }
      } catch (error) {
        if (isNoGoogleAccessTokenError(error)) {
          this.markAuthUnavailable();
          throw error;
        }
        if (this.isGoogleRateLimitError(error)) {
          const message = error instanceof Error ? error.message : 'Google rate limit exceeded';
          if (target === 'event') {
            await this.markLinkError(item.id, 'event', message, 'item', {
              calendarId: meta.google_sync_calendar_id || null,
            });
          } else if (target === 'task') {
            await this.markLinkError(item.id, 'task', message, 'item', {
              taskListId: meta.google_sync_task_list_id || null,
            });
          }
          this.markRateLimited(error);
          throw this.createRateLimitAbortError();
        }
        const status = this.getGoogleRequestStatus(error);
        const message = error instanceof Error ? error.message : 'Item sync failed';
        console.warn('[GoogleSyncEngine] Push item failed:', message);

        if (target === 'event') {
          await this.markLinkError(item.id, 'event', message, 'item');
        } else if (target === 'task') {
          await this.markLinkError(item.id, 'task', message, 'item');
        }

        if (status === 400) {
          await this.patchLocalItem(item.id, {
            is_unsynced: false,
            updated_at: nowIso(),
          });
          this.notifySyncPaused('item', item.id, item.title);
        } else {
          useAppStore.getState().addNotification?.(
            'error',
            'Item sync failed',
            `"${item.title}" could not be synced.`
          );
        }
      }
    }
  }

  private async pullRemoteEvents(userId: string, links: GoogleResourceLinkRow[], forceFullPull = false) {
    const calendars = await GoogleClient.listCalendars();
    console.log(`[GoogleSyncEngine] pullRemoteEvents: ${calendars.length} calendar(s):`, calendars.map(c => `${c.summary || c.id} (${c.id})`));

    for (const calendar of calendars) {
      const cursor = forceFullPull ? null : await this.getCursor(userId, 'event', calendar.id);
      const initialTimeMin = new Date(
        Date.now() -
          (forceFullPull ? MANUAL_FULL_PULL_DAYS : INITIAL_EVENT_PULL_DAYS) * 24 * 60 * 60 * 1000
      ).toISOString();

      let pulled: { items: GoogleEvent[]; nextSyncToken?: string };

      try {
        pulled = await GoogleClient.listEventsPaginated(calendar.id, {
          syncToken: cursor?.sync_token || undefined,
          timeMin: cursor?.sync_token ? undefined : initialTimeMin,
          showDeleted: true,
          singleEvents: false,
        });
      } catch (error) {
        if (isNoGoogleAccessTokenError(error)) {
          this.markAuthUnavailable();
          throw error;
        }
        const message = error instanceof Error ? error.message : '';
        if (message.includes('410') || message.toLowerCase().includes('gone')) {
          await this.clearCursor(userId, 'event', calendar.id);
          pulled = await GoogleClient.listEventsPaginated(calendar.id, {
            timeMin: initialTimeMin,
            showDeleted: true,
            singleEvents: false,
          });
        } else {
          console.warn('[GoogleSyncEngine] Pull events failed:', message);
          continue;
        }
      }

      const masters = pulled.items.filter((e) => !e.recurringEventId);
      const instances = pulled.items.filter((e) => !!e.recurringEventId);
      const ordered = [...masters, ...instances];

      for (const remote of ordered) {
        const currentStore = useAppStore.getState();
        const remoteUpdatedAt = getRemoteEventUpdatedAt(remote);
        const existingLink = this.findEventLink(links, calendar.id, remote.id);
        const linkedItem =
          existingLink?.local_type === 'item'
            ? currentStore.items.find((i) => i.id === existingLink.local_id)
            : undefined;
        const existing =
          (existingLink && existingLink.local_type === 'calendar_event'
            ? currentStore.calendarEvents.find((e) => e.id === existingLink.local_id)
            : undefined) ||
          currentStore.calendarEvents.find(
            (e) =>
              e.google_event_id === remote.id &&
              (e.google_calendar_id || 'primary') === calendar.id
          );

        const remoteStart = parseGoogleDate(remote.start?.dateTime || remote.start?.date);
        const remoteEnd = parseGoogleDate(remote.end?.dateTime || remote.end?.date);
        const isAllDay = !!remote.start?.date;

        const parentLocalId = remote.recurringEventId
          ? links.find(
              (l) =>
                l.resource_type === 'event' &&
                l.local_type === 'calendar_event' &&
                l.google_id === remote.recurringEventId &&
                (l.calendar_id || 'primary') === calendar.id
            )?.local_id ||
            currentStore.calendarEvents.find(
              (e) =>
                e.google_event_id === remote.recurringEventId &&
                (e.google_calendar_id || 'primary') === calendar.id
            )?.id ||
            null
          : null;

        if (linkedItem) {
          // Anti-resurrection: skip deleted linked items
          if (linkedItem.deleted_at) continue;

          const localIsNewer = isLocalStrictlyNewer(linkedItem.updated_at, remoteUpdatedAt);
          if (remote.status === 'cancelled') {
            if (!localIsNewer) {
              await this.patchLocalItem(linkedItem.id, {
                scheduled_at: null,
                updated_at: remoteUpdatedAt,
                is_unsynced: false,
                content: mergeItemSyncMeta(linkedItem, {
                  google_sync_target: null,
                  google_sync_calendar_id: null,
                  google_sync_task_list_id: null,
                }),
              });
              if (existingLink) {
                await this.deleteLinkById(existingLink.id);
              }
            } else if (!linkedItem.is_unsynced) {
              await this.patchLocalItem(linkedItem.id, { is_unsynced: true });
            }
            continue;
          }

          if (!remoteStart) {
            continue;
          }

          if (isRemoteStrictlyNewer(linkedItem.updated_at, remoteUpdatedAt)) {
            const hadLocalUnsynced = !!linkedItem.is_unsynced;
            await this.patchLocalItem(linkedItem.id, {
              title: remote.summary || linkedItem.title,
              scheduled_at: remoteStart,
              updated_at: remoteUpdatedAt,
              is_unsynced: false,
              content: mergeItemSyncMeta(linkedItem, {
                google_sync_target: 'event',
                google_sync_calendar_id: calendar.id,
                google_sync_task_list_id: null,
              }),
            });
            if (hadLocalUnsynced) {
              this.notifyOverwrite('Event', linkedItem.title || remote.summary || '(Untitled)');
            }
          } else if (localIsNewer) {
            if (!linkedItem.is_unsynced) {
              await this.patchLocalItem(linkedItem.id, { is_unsynced: true });
            }
          } else if (linkedItem.is_unsynced) {
            await this.patchLocalItem(linkedItem.id, {
              is_unsynced: false,
              updated_at: remoteUpdatedAt,
            });
          }
          continue;
        }

        if (remote.status === 'cancelled') {
          if (remote.recurringEventId && parentLocalId) {
            const recurringStart =
              parseGoogleDate(
                remote.originalStartTime?.dateTime || remote.originalStartTime?.date
              ) || remoteStart;

            const existingException = currentStore.calendarEvents.find(
                (e) =>
                e.parent_event_id === parentLocalId &&
                e.recurring_event_id === recurringStart
            );

            const baseEvent =
              existingException ||
              currentStore.calendarEvents.find((e) => e.id === parentLocalId) ||
              existing;

            if (!baseEvent || !remoteStart || !remoteEnd || !recurringStart) {
              continue;
            }

            const cancelledException: CalendarEvent = {
              ...baseEvent,
              id: existingException?.id || generateId(),
              title: remote.summary || baseEvent.title,
              start_at: remoteStart,
              end_at: remoteEnd,
              is_all_day: isAllDay,
              rrule: null,
              parent_event_id: parentLocalId,
              recurring_event_id: recurringStart,
              is_deleted_instance: true,
              google_event_id: remote.id,
              google_calendar_id: calendar.id,
              google_etag: remote.etag || null,
              remote_updated_at: remoteUpdatedAt,
              updated_at: remoteUpdatedAt,
              deleted_at: null,
              is_unsynced: false,
            };

            if (existingException) {
              await this.patchLocalEvent(existingException.id, cancelledException);
            } else {
              await this.createLocalEvent(cancelledException);
            }

            await this.upsertLink({
              user_id: userId,
              local_id: cancelledException.id,
              local_type: 'calendar_event',
              google_id: remote.id,
              resource_type: 'event',
              calendar_id: calendar.id,
              remote_etag: remote.etag || null,
              remote_updated_at: remoteUpdatedAt,
              direction: 'pull',
            });
          } else if (existing) {
            const localIsNewer = isLocalStrictlyNewer(existing.updated_at, remoteUpdatedAt);
            if (!localIsNewer) {
              const hadLocalUnsynced = !!existing.is_unsynced;
              await this.patchLocalEvent(existing.id, {
                deleted_at: nowIso(),
                remote_updated_at: remoteUpdatedAt,
                google_etag: remote.etag || null,
                updated_at: remoteUpdatedAt,
                is_unsynced: false,
              });
              if (hadLocalUnsynced) {
                this.notifyOverwrite('Event', existing.title || remote.summary || '(Untitled)');
              }
            } else if (!existing.is_unsynced) {
              await this.patchLocalEvent(existing.id, { is_unsynced: true });
            }
          }
          continue;
        }

        if (!remoteStart || !remoteEnd) continue;

        const normalizedRrule =
          remote.recurrence?.find((r) => r.toUpperCase().startsWith('RRULE:'))?.replace(/^RRULE:/i, '') ||
          null;

        const reminders: CalendarEvent['reminders'] = remote.reminders?.overrides?.length
          ? remote.reminders.overrides.map((r) => ({
            method: r.method === 'email' ? 'email' : 'popup',
              minutes: r.minutes,
            }))
          : [{ method: 'popup' as const, minutes: 10 }];

        const conferenceEntry = remote.conferenceData?.entryPoints?.find(
          (entry) => entry.entryPointType === 'video'
        );

        if (existing) {
          // Anti-resurrection: never overwrite a locally-deleted event
          if (existing.deleted_at) continue;

          if (isRemoteStrictlyNewer(existing.updated_at, remoteUpdatedAt)) {
            const hadLocalUnsynced = !!existing.is_unsynced;
            await this.patchLocalEvent(existing.id, {
              title: remote.summary || existing.title,
              description: remote.description || '',
              location: remote.location || '',
              start_at: remoteStart,
              end_at: remoteEnd,
              is_all_day: isAllDay,
              rrule: parentLocalId ? null : normalizedRrule,
              parent_event_id: parentLocalId,
              recurring_event_id:
                parseGoogleDate(
                  remote.originalStartTime?.dateTime || remote.originalStartTime?.date
                ) || null,
              is_deleted_instance: false,
              visibility: (remote.visibility as CalendarEvent['visibility']) || 'default',
              transparency: (remote.transparency as CalendarEvent['transparency']) || 'opaque',
              attendees:
                remote.attendees?.map((a) => ({
                  email: a.email,
                  responseStatus: (a.responseStatus as
                    | 'needsAction'
                    | 'declined'
                    | 'tentative'
                    | 'accepted') || 'needsAction',
                })) || [],
              conference_data: conferenceEntry
                ? { meetLink: conferenceEntry.uri, entryPoints: remote.conferenceData?.entryPoints || [] }
                : null,
              reminders,
              google_event_id: remote.id,
              google_calendar_id: calendar.id,
              google_etag: remote.etag || null,
              remote_updated_at: remoteUpdatedAt,
              updated_at: remoteUpdatedAt,
              is_unsynced: false,
            });
            if (hadLocalUnsynced) {
              this.notifyOverwrite('Event', existing.title || remote.summary || '(Untitled)');
            }
          } else {
            const localIsNewer = isLocalStrictlyNewer(existing.updated_at, remoteUpdatedAt);
            if (localIsNewer) {
              if (!existing.is_unsynced) {
                await this.patchLocalEvent(existing.id, { is_unsynced: true });
              }
            } else if (existing.is_unsynced) {
              // Heal stale unsynced flags from older sync runs to stop endless re-push loops.
              await this.patchLocalEvent(existing.id, {
                is_unsynced: false,
                remote_updated_at: remoteUpdatedAt,
                google_etag: remote.etag || existing.google_etag || null,
              });
            }
          }
        } else {
          const eventId = generateId();
          const newEvent: CalendarEvent = {
            id: eventId,
            user_id: userId,
            title: remote.summary || '(No title)',
            description: remote.description || '',
            start_at: remoteStart,
            end_at: remoteEnd,
            is_all_day: isAllDay,
            rrule: parentLocalId ? null : normalizedRrule,
            parent_event_id: parentLocalId,
            recurring_event_id:
              parseGoogleDate(
                remote.originalStartTime?.dateTime || remote.originalStartTime?.date
              ) || null,
            is_deleted_instance: false,
            location: remote.location || '',
            color_id: remote.colorId || '7',
            visibility: (remote.visibility as CalendarEvent['visibility']) || 'default',
            transparency: (remote.transparency as CalendarEvent['transparency']) || 'opaque',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            attendees:
              remote.attendees?.map((a) => ({
                email: a.email,
                responseStatus: (a.responseStatus as
                  | 'needsAction'
                  | 'declined'
                  | 'tentative'
                  | 'accepted') || 'needsAction',
              })) || [],
            conference_data: conferenceEntry
              ? { meetLink: conferenceEntry.uri, entryPoints: remote.conferenceData?.entryPoints || [] }
              : null,
            reminders,
            attachments: [],
            google_event_id: remote.id,
            google_calendar_id: calendar.id,
            google_etag: remote.etag || null,
            remote_updated_at: remoteUpdatedAt,
            created_at: remoteUpdatedAt,
            updated_at: remoteUpdatedAt,
            deleted_at: null,
            is_unsynced: false,
          };
          await this.createLocalEvent(newEvent);
          await this.upsertLink({
            user_id: userId,
            local_id: eventId,
            local_type: 'calendar_event',
            google_id: remote.id,
            resource_type: 'event',
            calendar_id: calendar.id,
            remote_etag: remote.etag || null,
            remote_updated_at: remoteUpdatedAt,
            direction: 'pull',
          });
        }
      }

      await this.upsertCursor(userId, 'event', calendar.id, {
        sync_token: pulled.nextSyncToken || cursor?.sync_token || null,
        last_pulled_at: nowIso(),
      });
    }
  }

  private async ensureLocalListForGoogleTaskList(
    userId: string,
    taskList: GoogleTaskList,
    links: GoogleResourceLinkRow[]
  ) {
    const store = useAppStore.getState();
    const linked = links.find(
      (l) => l.resource_type === 'task' && l.local_type === 'list' && l.google_id === taskList.id
    );

    if (linked) {
      const existing = store.lists.find((l) => l.id === linked.local_id);
      if (existing) {
        if (existing.name !== taskList.title) {
          const updated = { ...existing, name: taskList.title };
          useAppStore.setState((s) => ({
            lists: s.lists.map((l) => (l.id === existing.id ? updated : l)),
          }));
          persistentSyncQueue.add('upsert-list', updated.id, updated);
        }
        return existing.id;
      }

      const restored: List = {
        id: linked.local_id,
        user_id: userId,
        name: taskList.title,
        color: '#10B981',
        order: store.lists.length,
        items: [],
        created_at: nowIso(),
      };
      useAppStore.setState((s) => ({ lists: [...s.lists, restored] }));
      persistentSyncQueue.add('upsert-list', restored.id, restored);
      return restored.id;
    }

    // DEDUP: Check if a list with the same name already exists in the store
    // (prevents infinite duplicate list creation when upsertLink fails)
    const existingByName = store.lists.find(
      (l) => l.name === taskList.title && l.user_id === userId
    );
    if (existingByName) {
      // Try to create the link for this existing list so future cycles find it
      await this.upsertLink({
        user_id: userId,
        local_id: existingByName.id,
        local_type: 'list',
        google_id: taskList.id,
        resource_type: 'task',
        task_list_id: taskList.id,
        remote_etag: taskList.etag || null,
        remote_updated_at: taskList.updated || null,
        direction: 'pull',
      });
      return existingByName.id;
    }

    const localList: List = {
      id: generateId(),
      user_id: userId,
      name: taskList.title,
      color: '#10B981',
      order: store.lists.length,
      items: [],
      created_at: nowIso(),
    };

    useAppStore.setState((s) => ({ lists: [...s.lists, localList] }));
    persistentSyncQueue.add('upsert-list', localList.id, localList);

    await this.upsertLink({
      user_id: userId,
      local_id: localList.id,
      local_type: 'list',
      google_id: taskList.id,
      resource_type: 'task',
      task_list_id: taskList.id,
      remote_etag: taskList.etag || null,
      remote_updated_at: taskList.updated || null,
      direction: 'pull',
    });

    return localList.id;
  }

  private async pullRemoteTasks(userId: string, links: GoogleResourceLinkRow[], forceFullPull = false) {
    const taskLists = await GoogleClient.listAllTaskLists();
    console.log(`[GoogleSyncEngine] pullRemoteTasks: ${taskLists.length} task list(s)`);

    for (const taskList of taskLists) {
      // We still need ensureLocalListForGoogleTaskList to maintain list mapping
      // but Google Tasks now become CalendarEvents, not Task records
      // Maintain list mapping (return value intentionally unused — side-effects only)
      await this.ensureLocalListForGoogleTaskList(userId, taskList, links);
      const cursor = forceFullPull ? null : await this.getCursor(userId, 'task', taskList.id);
      const taskLinksForList = links.filter(
        (l) =>
          l.resource_type === 'task' &&
          (l.task_list_id || '@default') === taskList.id
      );
      const currentStore = useAppStore.getState();
      const localHasEventsForList = currentStore.calendarEvents.some(
        (e) => e.is_google_task && e.google_task_list_id === taskList.id && !e.deleted_at
      );
      const shouldDoFullTaskListPull = forceFullPull || (!taskLinksForList.length && !localHasEventsForList);
      const updatedMin = shouldDoFullTaskListPull ? undefined : cursor?.last_pulled_at || undefined;

      let remoteTasks: GoogleTask[];
      try {
        remoteTasks = await GoogleClient.listAllTasks(taskList.id, updatedMin);
      } catch (error) {
        if (isNoGoogleAccessTokenError(error)) {
          this.markAuthUnavailable();
          throw error;
        }
        const message = error instanceof Error ? error.message : 'Task pull failed';
        console.warn('[GoogleSyncEngine] Pull tasks failed:', message);
        continue;
      }

      console.log(`[GoogleSyncEngine] pullRemoteTasks: List "${taskList.title}" -> ${remoteTasks.length} task(s)`);

      const sorted = [...remoteTasks].sort((a, b) => {
        if (!!a.parent === !!b.parent) return 0;
        return a.parent ? 1 : -1;
      });

      for (const remote of sorted) {
        const storeNow = useAppStore.getState();
        const remoteUpdatedAt = getRemoteTaskUpdatedAt(remote);
        const existingLink = this.findTaskLink(taskLinksForList, taskList.id, remote.id);
        const linkedItem =
          existingLink?.local_type === 'item'
            ? storeNow.items.find((i) => i.id === existingLink.local_id)
            : undefined;

        // Look up existing CalendarEvent by link or by google_task_id field
        const existing =
          (existingLink && (existingLink.local_type === 'calendar_event' || existingLink.local_type === 'event')
            ? storeNow.calendarEvents.find((e) => e.id === existingLink.local_id)
            : undefined) ||
          storeNow.calendarEvents.find(
            (e) => e.google_task_id === remote.id && !!remote.id
          );

        // Also check if there's an old Task record from previous sync (migration path)
        const legacyTask =
          (existingLink && existingLink.local_type === 'task'
            ? storeNow.tasks.find((t) => t.id === existingLink.local_id)
            : undefined) ||
          storeNow.tasks.find((t) => t.google_task_id === remote.id && !!remote.id);

        if (linkedItem) {
          // Anti-resurrection: skip deleted linked items
          if (linkedItem.deleted_at) continue;

          const localIsNewer = isLocalStrictlyNewer(linkedItem.updated_at, remoteUpdatedAt);
          if (remote.deleted) {
            if (!localIsNewer) {
              await this.patchLocalItem(linkedItem.id, {
                scheduled_at: null,
                updated_at: remoteUpdatedAt,
                is_unsynced: false,
                content: mergeItemSyncMeta(linkedItem, {
                  google_sync_target: null,
                  google_sync_task_list_id: null,
                  google_sync_calendar_id: null,
                }),
              });
              if (existingLink) {
                await this.deleteLinkById(existingLink.id);
              }
            } else if (!linkedItem.is_unsynced) {
              await this.patchLocalItem(linkedItem.id, { is_unsynced: true });
            }
            continue;
          }

          if (isRemoteStrictlyNewer(linkedItem.updated_at, remoteUpdatedAt)) {
            const hadLocalUnsynced = !!linkedItem.is_unsynced;
            await this.patchLocalItem(linkedItem.id, {
              title: remote.title || linkedItem.title,
              scheduled_at: parseGoogleDate(remote.due) || null,
              is_completed: remote.status === 'completed',
              updated_at: remoteUpdatedAt,
              is_unsynced: false,
              content: mergeItemSyncMeta(linkedItem, {
                google_sync_target: 'task',
                google_sync_task_list_id: taskList.id,
                google_sync_calendar_id: null,
              }),
            });
            if (hadLocalUnsynced) {
              this.notifyOverwrite('Task', linkedItem.title || remote.title || '(Untitled)');
            }
          } else if (localIsNewer) {
            if (!linkedItem.is_unsynced) {
              await this.patchLocalItem(linkedItem.id, { is_unsynced: true });
            }
          } else if (linkedItem.is_unsynced) {
            await this.patchLocalItem(linkedItem.id, {
              is_unsynced: false,
              updated_at: remoteUpdatedAt,
            });
          }
          continue;
        }

        if (remote.deleted) {
          if (existing) {
            const localIsNewer = isLocalStrictlyNewer(existing.updated_at, remoteUpdatedAt);
            if (!localIsNewer) {
              await this.patchLocalEvent(existing.id, {
                deleted_at: nowIso(),
                google_etag: remote.etag || null,
                remote_updated_at: remoteUpdatedAt,
                updated_at: remoteUpdatedAt,
                is_unsynced: false,
              });
            } else if (!existing.is_unsynced) {
              await this.patchLocalEvent(existing.id, { is_unsynced: true });
            }
          } else if (legacyTask) {
            // Clean up legacy Task record
            const localIsNewer = isLocalStrictlyNewer(legacyTask.updated_at, remoteUpdatedAt);
            if (!localIsNewer) {
              await this.patchLocalTask(legacyTask.id, {
                deleted_at: nowIso(),
                updated_at: remoteUpdatedAt,
                is_unsynced: false,
              });
            }
          }
          continue;
        }

        if (existing) {
          // Anti-resurrection: never overwrite a locally-deleted event
          if (existing.deleted_at) continue;

          if (isRemoteStrictlyNewer(existing.updated_at, remoteUpdatedAt)) {
            const hadLocalUnsynced = !!existing.is_unsynced;
            const dueDate = parseGoogleDate(remote.due);
            const startAt = dueDate || existing.start_at;
            const endAt = dueDate ? new Date(new Date(dueDate).getTime() + 30 * 60 * 1000).toISOString() : existing.end_at;

            await this.patchLocalEvent(existing.id, {
              title: remote.title || existing.title,
              description: remote.notes || '',
              start_at: startAt,
              end_at: endAt,
              is_all_day: !!dueDate,
              is_google_task: true,
              google_task_id: remote.id,
              google_task_list_id: taskList.id,
              is_completed: remote.status === 'completed',
              completed_at: remote.status === 'completed' ? (remote.completed || remoteUpdatedAt) : null,
              sort_position: remote.position || null,
              google_etag: remote.etag || null,
              remote_updated_at: remoteUpdatedAt,
              updated_at: remoteUpdatedAt,
              is_unsynced: false,
            });
            if (hadLocalUnsynced) {
              this.notifyOverwrite('Task', existing.title || remote.title || '(Untitled)');
            }
          } else {
            const localIsNewer = isLocalStrictlyNewer(existing.updated_at, remoteUpdatedAt);
            if (localIsNewer) {
              if (!existing.is_unsynced) {
                await this.patchLocalEvent(existing.id, { is_unsynced: true });
              }
            } else if (existing.is_unsynced) {
              await this.patchLocalEvent(existing.id, {
                is_unsynced: false,
                remote_updated_at: remoteUpdatedAt,
                google_etag: remote.etag || existing.google_etag || null,
              });
            }
          }
        } else {
          // DEDUP GUARD: before creating, double-check the store for an event
          // with the same google_task_id (may have been created moments ago
          // in this same cycle but link write failed due to 401).
          const freshStore = useAppStore.getState();
          const alreadyExists = freshStore.calendarEvents.find(
            (e) => e.google_task_id === remote.id && !e.deleted_at
          );
          if (alreadyExists) {
            // Just ensure the link exists, don't create a duplicate
            await this.upsertLink({
              user_id: userId,
              local_id: alreadyExists.id,
              local_type: 'calendar_event',
              google_id: remote.id,
              resource_type: 'task',
              task_list_id: taskList.id,
              remote_etag: remote.etag || null,
              remote_updated_at: remoteUpdatedAt,
              direction: 'pull',
            });
            continue;
          }

          // Create a NEW CalendarEvent for this Google Task
          const dueDate = parseGoogleDate(remote.due);
          const startAt = dueDate || nowIso();
          const endAt = dueDate
            ? new Date(new Date(dueDate).getTime() + 30 * 60 * 1000).toISOString()
            : new Date(new Date(startAt).getTime() + 30 * 60 * 1000).toISOString();

          const eventId = generateId();
          const newEvent: CalendarEvent = {
            id: eventId,
            user_id: userId,
            title: remote.title || '(No title)',
            description: remote.notes || '',
            start_at: startAt,
            end_at: endAt,
            is_all_day: !!dueDate, // Tasks with due date are shown as all-day
            rrule: null,
            parent_event_id: null,
            recurring_event_id: null,
            is_deleted_instance: false,
            location: '',
            color_id: '7',
            visibility: 'default',
            transparency: 'transparent',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            attendees: [],
            conference_data: null,
            reminders: [],
            attachments: [],
            google_event_id: null, // This is a task, not a calendar event
            google_calendar_id: 'tasks', // Marker for task-sourced events
            google_etag: remote.etag || null,
            remote_updated_at: remoteUpdatedAt,
            // Google Task specific fields
            is_google_task: true,
            google_task_id: remote.id,
            google_task_list_id: taskList.id,
            is_completed: remote.status === 'completed',
            completed_at: remote.status === 'completed' ? (remote.completed || remoteUpdatedAt) : null,
            sort_position: remote.position || null,
            created_at: remoteUpdatedAt,
            updated_at: remoteUpdatedAt,
            deleted_at: null,
            is_unsynced: false,
          };

          await this.createLocalEvent(newEvent);
          await this.upsertLink({
            user_id: userId,
            local_id: eventId,
            local_type: 'calendar_event',
            google_id: remote.id,
            resource_type: 'task',
            task_list_id: taskList.id,
            remote_etag: remote.etag || null,
            remote_updated_at: remoteUpdatedAt,
            direction: 'pull',
          });
          taskLinksForList.push({
            id: generateId(),
            user_id: userId,
            local_id: eventId,
            local_type: 'calendar_event',
            google_id: remote.id,
            resource_type: 'task',
            calendar_id: null,
            task_list_id: taskList.id,
            remote_etag: remote.etag || null,
            remote_updated_at: remoteUpdatedAt,
            retry_count: 0,
            next_retry_at: null,
            error: null,
          });

          // If there's a legacy Task record from previous sync, soft-delete it
          if (legacyTask && !legacyTask.deleted_at) {
            await this.patchLocalTask(legacyTask.id, {
              deleted_at: nowIso(),
              is_unsynced: false,
            });
          }
        }
      }

      await this.upsertCursor(userId, 'task', taskList.id, {
        sync_token: null,
        last_pulled_at: nowIso(),
      });
    }
  }
}

export const googleSyncEngine = new GoogleSyncEngine();

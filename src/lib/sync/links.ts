/**
 * Sync Module — google_resource_links CRUD
 * 
 * Manages the mapping between local IDs and Google IDs.
 */

import { supabase } from '../supabase';
import type { LinkRecord, UpsertLinkInput } from './types';
import {
  ensureFreshSupabaseSession,
  recordAuthError,
  resetAuthErrorCount,
} from './auth';

function nowIso() {
  return new Date().toISOString();
}

/**
 * Upsert a link record. Handles:
 * - Pre-cleaning stale links for the same entity pointing to different Google IDs
 * - 401/RLS errors with session refresh + retry
 * - 409 unique constraint fallback (DELETE + INSERT)
 * Returns true on success, false on failure.
 */
export async function upsertLink(input: UpsertLinkInput): Promise<boolean> {
  // Pre-clean: delete any existing link for this entity+type pointing to a DIFFERENT google_id
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
    // RLS / auth failure — refresh session and retry ONCE
    const isAuthError =
      error.message?.includes('row-level security') ||
      error.code === '42501' ||
      error.code === 'PGRST301';

    if (isAuthError) {
      console.warn('[Sync/Links] RLS error — refreshing session and retrying...');
      const sessionOk = await ensureFreshSupabaseSession();
      if (sessionOk) {
        const { error: retryError } = await supabase
          .from('google_resource_links')
          .upsert(payload, { onConflict: 'local_id,google_id' });
        if (!retryError) {
          resetAuthErrorCount();
          return true;
        }
        console.error('[Sync/Links] Retry after session refresh also failed:', retryError.message);
      }
      recordAuthError(); // may throw SupabaseAuthAbortError
      return false;
    }

    // 409 unique constraint — DELETE + INSERT fallback
    if (error.code === '23505') {
      console.warn('[Sync/Links] 409 — falling back to DELETE+INSERT for', input.local_id);
      await supabase
        .from('google_resource_links')
        .delete()
        .eq('local_id', input.local_id)
        .eq('resource_type', input.resource_type);
      const { error: insertError } = await supabase
        .from('google_resource_links')
        .insert(payload);
      if (insertError) {
        console.error('[Sync/Links] INSERT fallback also failed:', insertError.message);
        return false;
      }
    } else {
      console.warn('[Sync/Links] Failed upserting link:', error.message);
      return false;
    }
  }

  resetAuthErrorCount();
  return true;
}

/**
 * Find a link by local ID and local type
 */
export function findLinkByLocalId(
  links: LinkRecord[],
  localId: string,
  localType?: string
): LinkRecord | null {
  return links.find(
    (l) => l.local_id === localId && (!localType || l.local_type === localType)
  ) || null;
}

/**
 * Find a link by Google ID and resource type
 */
export function findLinkByGoogleId(
  links: LinkRecord[],
  googleId: string,
  resourceType: 'event' | 'task'
): LinkRecord | null {
  return links.find(
    (l) => l.google_id === googleId && l.resource_type === resourceType
  ) || null;
}

/**
 * Find an event link by calendar ID + google event ID
 */
export function findEventLink(
  links: LinkRecord[],
  calendarId: string,
  googleEventId: string
): LinkRecord | null {
  return links.find(
    (l) =>
      l.resource_type === 'event' &&
      l.google_id === googleEventId &&
      (l.calendar_id || 'primary') === calendarId
  ) || null;
}

/**
 * Find a task link by task list ID + google task ID
 */
export function findTaskLink(
  links: LinkRecord[],
  taskListId: string,
  googleTaskId: string,
  localType?: string
): LinkRecord | null {
  return links.find(
    (l) =>
      l.resource_type === 'task' &&
      (!localType || l.local_type === localType) &&
      l.google_id === googleTaskId &&
      (l.task_list_id || '@default') === taskListId
  ) || null;
}

/**
 * Delete a link by its database ID
 */
export async function deleteLinkById(linkId: string): Promise<void> {
  await supabase.from('google_resource_links').delete().eq('id', linkId);
}

/**
 * Delete links by local ID and resource type
 */
export async function deleteLinksByLocalId(
  localId: string,
  resourceType: 'event' | 'task'
): Promise<void> {
  await supabase
    .from('google_resource_links')
    .delete()
    .eq('local_id', localId)
    .eq('resource_type', resourceType);
}

/**
 * Load ALL links for a user (paginated)
 */
export async function loadAllLinks(userId: string): Promise<LinkRecord[]> {
  const PAGE_SIZE = 1000;
  let allLinks: LinkRecord[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('google_resource_links')
      .select('*')
      .eq('user_id', userId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.warn('[Sync/Links] Failed loading links:', error.message);
      return allLinks;
    }

    allLinks = allLinks.concat((data || []) as LinkRecord[]);
    hasMore = (data?.length ?? 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return allLinks;
}

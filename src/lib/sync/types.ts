/**
 * Sync Module — Type definitions
 */

export type SyncPhase = 'push-events' | 'push-google-tasks' | 'push-items' | 'pull-events' | 'pull-google-tasks';

export interface PhaseResult {
  name: string;
  pushed: number;
  pulled: number;
  errors: string[];
}

export interface SyncResult {
  success: boolean;
  phases: PhaseResult[];
  totalPushed: number;
  totalPulled: number;
  errors: string[];
}

export interface LinkRecord {
  id: string;
  user_id: string;
  local_id: string;
  local_type: 'item' | 'calendar_event' | 'list' | string;
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

export type SyncDirection = 'push' | 'pull';

export interface UpsertLinkInput {
  user_id: string;
  local_id: string;
  local_type: LinkRecord['local_type'];
  google_id: string;
  resource_type: LinkRecord['resource_type'];
  calendar_id?: string | null;
  task_list_id?: string | null;
  remote_etag?: string | null;
  remote_updated_at?: string | null;
  direction: SyncDirection;
}

// Database Types for Stash Application
// SIMPLIFIED - Removed bloated scheduler types

// ============ CORE TYPES ============

// 6 Item Types: notes, links, images, files, folders, events
export type ItemType = 'note' | 'link' | 'image' | 'file' | 'folder' | 'event';
export type PriorityLevel = 'none' | 'low' | 'medium' | 'high';
export type ViewMode = 'grid' | 'list';

// Special folder ID for items at root of Folders section
export const FOLDERS_ROOT_ID = 'folders-root';

// ============ CONTENT TYPES ============

export interface NoteContent {
  text?: string;
  checklist?: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface ItemGoogleSyncMeta {
  google_sync_target?: 'event' | 'task' | null;
  google_sync_task_list_id?: string | null;
  google_sync_calendar_id?: string | null;
}

export interface LinkContent {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
}

export interface FolderContent {
  itemCount?: number;
  description?: string;
}

export interface EventContent {
  description?: string;
  location?: string;
  end_time?: string;         // ISO string for end date/time
  is_all_day?: boolean;
  attendees?: string[];      // Email addresses
  meet_link?: string;
  calendar_id?: string;      // Google Calendar ID
  color_id?: string;         // Google Calendar color ID
  visibility?: 'default' | 'public' | 'private';
  show_as?: 'busy' | 'free';
  timezone?: string;
  notifications?: { method: 'popup' | 'email'; minutes: number }[];
}

export interface FileMeta {
  size: number;
  mime: string;
  path: string;
  width?: number;
  height?: number;
  originalName?: string;
}

// ============ MAIN ITEM INTERFACE ============
// SIMPLIFIED: Scheduler fields reduced to 2 core concepts

export interface Item {
  id: string;
  user_id: string;
  folder_id: string | null;
  type: ItemType;
  title: string;
  content: (NoteContent | LinkContent | FolderContent | EventContent | Record<string, unknown>) & ItemGoogleSyncMeta;
  file_meta: FileMeta | null;
  priority: PriorityLevel;
  tags: string[];

  // Scheduler Fields (Simplified)
  scheduled_at: string | null;           // When it's due/happening (ISO string)
  remind_before: number | null;          // Minutes before to notify (null = no reminder)
  recurring_config: RecurringConfig | null;

  bg_color: string;

  // Canvas / Visual
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;

  is_pinned: boolean;
  is_archived: boolean;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;

  // Sync Status
  is_unsynced?: boolean;

  // Server-side full-text search field (populated by DB trigger)
  search_text?: string | null;
}

// ============ RECURRING RULE ============

export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export interface RecurringConfig {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';

  // "Every X days/weeks"
  interval: number; // Default: 1

  // The specific time of day to ring (e.g., "14:30")
  time: string;

  // Specific days (e.g., "Mon, Wed, Fri") - Only for Weekly
  byWeekDays?: WeekDay[];

  // Specific date (e.g., "on the 15th") - Only for Monthly
  byMonthDay?: number;

  // End conditions
  endType: 'never' | 'date' | 'count';
  endDate?: string; // ISO String
  endCount?: number; // "After 5 times"
}

export type ReminderType = 'none' | 'one_time' | 'recurring';

// ============ CALENDAR EVENT (RFC 5545 Series + Exception) ============
// This is the Google Calendar clone data model.
// A "Series Master" has an rrule and generates virtual instances.
// An "Exception" points to its master via parent_event_id.

export type RecurrenceEditMode = 'this' | 'following' | 'all';

export interface EventAttendee {
  email: string;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  displayName?: string;
}

export interface EventReminder {
  method: 'popup' | 'email';
  minutes: number;
}

export interface EventConferenceData {
  meetLink?: string;
  entryPoints?: { entryPointType: string; uri: string; label?: string }[];
}

export interface EventAttachment {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  type: string;   // MIME type
  size: number;   // bytes
}

export interface CalendarEvent {
  id: string;
  user_id: string;

  // Core
  title: string;
  description: string;
  start_at: string;        // ISO timestamptz — start of FIRST occurrence (or single event)
  end_at: string;           // ISO timestamptz — end time
  is_all_day: boolean;

  // Recurrence (RFC 5545)
  rrule: string | null;     // e.g. "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO"

  // Exception Logic
  parent_event_id: string | null;       // Points to master if this is a modified instance
  recurring_event_id: string | null;    // Original occurrence date (ISO) — used to hide the generated instance
  is_deleted_instance: boolean;         // True = this exception is a cancellation

  // Details
  location: string;
  color_id: string;
  visibility: 'default' | 'public' | 'private';
  transparency: 'opaque' | 'transparent';
  timezone: string;

  // Rich data
  attendees: EventAttendee[];
  conference_data: EventConferenceData | null;
  reminders: EventReminder[];
  attachments: EventAttachment[];

  // Google Sync
  google_event_id: string | null;
  google_calendar_id: string;
  google_etag?: string | null;
  remote_updated_at?: string | null;

  // Google Task fields (when is_google_task = true, this event represents a Google Task)
  is_google_task?: boolean;
  google_task_id?: string | null;
  google_task_list_id?: string | null;
  is_completed?: boolean;
  completed_at?: string | null;
  sort_position?: string | null;

  // Metadata
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  is_unsynced?: boolean;
}

// ============ GOOGLE CALENDAR STATE ============
// Tracks discovered Google calendars for sync

export interface GoogleCalendarEntry {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
  selected?: boolean;
}

export interface GoogleCalendarState {
  calendars: GoogleCalendarEntry[];
  lastFetched: string | null;
}

// ============ TASK INTERFACE ============
// Tasks are containers that can group multiple items

export interface Task {
  id: string;
  user_id: string;
  list_id: string | null;
  parent_task_id?: string | null;
  sort_position?: string | null;
  title: string;
  description: string | null;
  color: string;
  priority: PriorityLevel;

  // Scheduler Fields (Simplified)
  scheduled_at: string | null;           // When it's due/happening
  remind_before: number | null;          // Minutes before to notify
  recurring_config: RecurringConfig | null;

  item_ids: string[];
  item_completion: Record<string, boolean>;
  is_completed: boolean;
  completed_at?: string | null;
  google_task_id?: string | null;
  google_etag?: string | null;
  remote_updated_at?: string | null;
  is_unsynced?: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ============ LIST INTERFACE ============

export interface List {
  id: string;
  user_id: string;
  name: string;
  color: string;
  order: number;
  items: string[];            // Item IDs in this list
  created_at: string;
}

// ============ FOLDER INTERFACE ============
// For navigation/organization (separate from folder-type items)

export interface Folder {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  color: string;
  is_pinned: boolean;
  path_tokens: string[];
  created_at: string;
  updated_at: string;
}

// ============ UPLOAD TYPES ============

export interface UploadItem {
  id: string;
  fileName: string;
  progress: number;
  speed: string;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

// ============ VIEW TYPES ============

export type ActiveView =
  | 'home'
  | 'scheduled'
  | 'overdue'
  | 'completed'
  | 'calendar'
  | 'all'
  | 'notes'
  | 'links'
  | 'files'
  | 'images'
  | 'folders'
  | 'trash'
  | 'archive'
  | 'tasks'
  | 'high-priority'
  | 'medium-priority'
  | 'low-priority';

// ============ STATS ============

export interface SmartFolderCounts {
  notes: number;
  links: number;
  files: number;
  images: number;
  folders: number;
}

export interface TodayStats {
  dueToday: number;
  reminders: number; // Reminders due today
  totalReminders: number; // All active reminders
  overdue: number;
  tasks: number;
}

// ============ TYPE GUARDS ============

/**
 * Type guard to check if content is NoteContent
 */
export function isNoteContent(content: unknown): content is NoteContent {
  if (!content || typeof content !== 'object') return false;
  const c = content as Record<string, unknown>;
  // NoteContent has optional text and checklist
  if (c.text !== undefined && typeof c.text !== 'string') return false;
  if (c.checklist !== undefined && !Array.isArray(c.checklist)) return false;
  return true;
}

/**
 * Type guard to check if content is LinkContent
 */
export function isLinkContent(content: unknown): content is LinkContent {
  if (!content || typeof content !== 'object') return false;
  const c = content as Record<string, unknown>;
  // LinkContent must have url
  return typeof c.url === 'string';
}

/**
 * Type guard to check if content is FolderContent
 */
export function isFolderContent(content: unknown): content is FolderContent {
  if (!content || typeof content !== 'object') return false;
  const c = content as Record<string, unknown>;
  // FolderContent has optional itemCount and description
  if (c.itemCount !== undefined && typeof c.itemCount !== 'number') return false;
  if (c.description !== undefined && typeof c.description !== 'string') return false;
  return true;
}

/**
 * Type guard for FileMeta
 */
export function isFileMeta(meta: unknown): meta is FileMeta {
  if (!meta || typeof meta !== 'object') return false;
  const m = meta as Record<string, unknown>;
  return (
    typeof m.size === 'number' &&
    typeof m.mime === 'string' &&
    typeof m.path === 'string'
  );
}

/**
 * Check if a value is a valid ItemType
 */
/**
 * Type guard to check if content is EventContent
 */
export function isEventContent(content: unknown): content is EventContent {
  if (!content || typeof content !== 'object') return false;
  const c = content as Record<string, unknown>;
  // Must have start_at and end_at to be valid EventContent
  return typeof c.start_at === 'string' && typeof c.end_at === 'string';
}

export function isValidItemType(type: unknown): type is ItemType {
  return ['note', 'link', 'image', 'file', 'folder', 'event'].includes(type as string);
}

/**
 * Check if a value is a valid PriorityLevel
 */
export function isValidPriority(priority: unknown): priority is PriorityLevel {
  return ['none', 'low', 'medium', 'high'].includes(priority as string);
}

// ============ VALIDATION ============

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate an item before operations
 */
export function validateItem(item: Partial<Item>): ValidationResult {
  const errors: ValidationError[] = [];

  // Required fields
  if (!item.id || typeof item.id !== 'string') {
    errors.push({ field: 'id', message: 'ID is required and must be a string' });
  }

  if (!item.user_id || typeof item.user_id !== 'string') {
    errors.push({ field: 'user_id', message: 'User ID is required' });
  }

  if (!item.type || !isValidItemType(item.type)) {
    errors.push({ field: 'type', message: 'Valid item type is required' });
  }

  if (!item.title || typeof item.title !== 'string') {
    errors.push({ field: 'title', message: 'Title is required' });
  } else if (item.title.length > 500) {
    errors.push({ field: 'title', message: 'Title must be 500 characters or less' });
  }

  // Validate content based on type
  if (item.type === 'link' && item.content) {
    if (!isLinkContent(item.content)) {
      errors.push({ field: 'content', message: 'Link must have a valid URL' });
    }
  }

  // Validate priority if present
  if (item.priority !== undefined && !isValidPriority(item.priority)) {
    errors.push({ field: 'priority', message: 'Invalid priority level' });
  }

  // Validate dates if present
  if (item.scheduled_at !== undefined && item.scheduled_at !== null) {
    const scheduledDate = new Date(item.scheduled_at);
    if (isNaN(scheduledDate.getTime())) {
      errors.push({ field: 'scheduled_at', message: 'Invalid scheduled date' });
    }
  }

  // Validate tags
  if (item.tags !== undefined && !Array.isArray(item.tags)) {
    errors.push({ field: 'tags', message: 'Tags must be an array' });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate item for database sync (stricter validation)
 */
export function validateItemForSync(item: Item): ValidationResult {
  const baseValidation = validateItem(item);
  const errors = [...baseValidation.errors];

  // Additional sync-specific validations
  if (!item.created_at || isNaN(new Date(item.created_at).getTime())) {
    errors.push({ field: 'created_at', message: 'Valid created_at timestamp required for sync' });
  }

  if (!item.updated_at || isNaN(new Date(item.updated_at).getTime())) {
    errors.push({ field: 'updated_at', message: 'Valid updated_at timestamp required for sync' });
  }

  // Validate file_meta for file/image types
  if ((item.type === 'file' || item.type === 'image') && item.file_meta) {
    if (!isFileMeta(item.file_meta)) {
      errors.push({ field: 'file_meta', message: 'Invalid file metadata' });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============ SAFE ACCESSORS ============

/**
 * Safely get note text from item content
 */
export function getNoteText(item: Item): string {
  if (item.type !== 'note' || !isNoteContent(item.content)) return '';
  return item.content.text || '';
}

/**
 * Safely get link URL from item content
 */
export function getLinkUrl(item: Item): string {
  if (item.type !== 'link' || !isLinkContent(item.content)) return '';
  return item.content.url || '';
}

/**
 * Safely get checklist from item content
 */
export function getChecklist(item: Item): ChecklistItem[] {
  if (item.type !== 'note' || !isNoteContent(item.content)) return [];
  return item.content.checklist || [];
}

/**
 * Create a default item with all required fields
 */
export function createDefaultItem(
  userId: string,
  type: ItemType,
  overrides?: Partial<Item>
): Item {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    user_id: userId,
    folder_id: null,
    type,
    title: '',
    content: type === 'note' ? { text: '' } : type === 'link' ? { url: '' } : type === 'event' ? { description: '', is_all_day: false } : {},
    file_meta: null,
    priority: 'none',
    tags: [],

    // Simplified Scheduler Fields
    scheduled_at: null,
    remind_before: null,
    recurring_config: null,

    bg_color: '#FFFFFF',
    is_pinned: false,
    is_archived: false,
    is_completed: false,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    ...overrides,
  };
}

// ============ CARD COLORS ============

export const CARD_COLORS = {
  default: '#FFFFFF',
  coral: '#FFB5A7',
  yellow: '#FDE68A',
  blue: '#BFDBFE',
  pink: '#FBCFE8',
  green: '#86EFAC',
  purple: '#DDD6FE',
  teal: '#99F6E4',
} as const;

export type CardColor = keyof typeof CARD_COLORS;

export function getColorKey(hex: string): CardColor {
  const entry = Object.entries(CARD_COLORS).find(([, value]) => value === hex);
  return (entry ? entry[0] : 'default') as CardColor;
}

/**
 * Type-safe adapters for converting Supabase database rows to frontend types.
 * Eliminates the need for `as any` casts throughout the codebase.
 */

import type { Tables } from './database.types';
import type { Item, Task, List, PriorityLevel, RecurringConfig } from './types';

type ItemRow = Tables<'items'>;
type TaskRow = Tables<'tasks'>;
type ListRow = Tables<'lists'>;

/**
 * Safely parse JSON content from DB, returning default if invalid
 */
function parseJsonContent(content: unknown, defaultValue: object = {}): object {
    if (content === null || content === undefined) return defaultValue;
    if (typeof content === 'object') return content as object;
    try {
        return JSON.parse(String(content));
    } catch {
        return defaultValue;
    }
}

/**
 * Validate priority level, defaulting to 'none' if invalid
 */
function parsePriority(value: string | null | undefined): PriorityLevel {
    if (value === 'low' || value === 'medium' || value === 'high') return value;
    return 'none';
}

/**
 * Convert Supabase items row to frontend Item type
 * Migrates old scheduler fields to new simplified format
 */
export function adaptItemRow(row: ItemRow): Item {
    // Migration: Map old fields to new simplified schema
    // Priority: one_time_at > due_at for scheduled_at
    const legacyScheduledAt = row.one_time_at ?? row.due_at ?? row.remind_at ?? null;
    const legacyRemindBefore = row.one_time_at ? 0 : null; // If had one_time_at, remind at that exact time

    return {
        id: row.id,
        user_id: row.user_id,
        folder_id: row.folder_id ?? null,
        type: row.type as Item['type'],
        title: row.title,
        content: parseJsonContent(row.content, { text: '' }),
        file_meta: row.file_meta ? parseJsonContent(row.file_meta) as Item['file_meta'] : null,
        priority: parsePriority(row.priority),
        tags: row.tags ?? [],

        // Simplified scheduler fields (with migration from legacy)
        scheduled_at: row.scheduled_at ?? legacyScheduledAt,
        remind_before: row.remind_before ?? legacyRemindBefore,
        recurring_config: row.recurring_config ? parseJsonContent(row.recurring_config) as RecurringConfig : null,

        bg_color: row.bg_color ?? '#FFFFFF',

        // Canvas/Visual
        position_x: row.position_x ?? undefined,
        position_y: row.position_y ?? undefined,
        width: row.width ?? undefined,
        height: row.height ?? undefined,

        // State
        is_pinned: row.is_pinned ?? false,
        is_archived: row.is_archived ?? false,
        is_completed: row.is_completed ?? false,
        created_at: row.created_at ?? new Date().toISOString(),
        updated_at: row.updated_at ?? new Date().toISOString(),
        deleted_at: row.deleted_at ?? null,
        
        // Search
        search_text: (row as any).search_text ?? null,
    };
}

/**
 * Convert Supabase tasks row to frontend Task type
 * Migrates old scheduler fields to new simplified format
 */
export function adaptTaskRow(row: TaskRow): Task {
    // Migration: Map old fields to new simplified schema
    const legacyScheduledAt = row.one_time_at ?? row.due_at ?? row.remind_at ?? null;
    const legacyRemindBefore = row.one_time_at ? 0 : null;

    return {
        id: row.id,
        user_id: row.user_id,
        list_id: row.list_id ?? null,
        parent_task_id: (row as TaskRow & { parent_task_id?: string | null }).parent_task_id ?? null,
        sort_position: (row as TaskRow & { sort_position?: string | null }).sort_position ?? null,
        title: row.title,
        description: row.description ?? null,
        color: row.color ?? '#ffffff',
        priority: parsePriority(row.priority),

        // Simplified scheduler fields (with migration from legacy)
        scheduled_at: row.scheduled_at ?? legacyScheduledAt,
        remind_before: row.remind_before ?? legacyRemindBefore,
        recurring_config: row.recurring_config ? parseJsonContent(row.recurring_config) as RecurringConfig : null,

        // Task-specific
        item_ids: row.item_ids ?? [],
        item_completion: (row.item_completion as Record<string, boolean>) ?? {},
        is_completed: row.is_completed ?? false,
        google_etag: (row as TaskRow & { google_etag?: string | null }).google_etag ?? null,
        remote_updated_at: (row as TaskRow & { remote_updated_at?: string | null }).remote_updated_at ?? null,
        is_unsynced: (row as TaskRow & { is_unsynced?: boolean }).is_unsynced ?? false,
        created_at: row.created_at ?? new Date().toISOString(),
        updated_at: row.updated_at ?? new Date().toISOString(),
        deleted_at: row.deleted_at ?? null,
    };
}

/**
 * Convert Supabase lists row to frontend List type
 */
export function adaptListRow(row: ListRow): List {
    return {
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        color: row.color ?? '#6366F1',
        order: row.order ?? 0,
        items: row.items ?? [],
        created_at: row.created_at ?? new Date().toISOString(),
    };
}

/**
 * Batch convert item rows
 */
export function adaptItemRows(rows: ItemRow[]): Item[] {
    return rows.map(adaptItemRow);
}

/**
 * Batch convert task rows
 */
export function adaptTaskRows(rows: TaskRow[]): Task[] {
    return rows.map(adaptTaskRow);
}

/**
 * Batch convert list rows
 */
export function adaptListRows(rows: ListRow[]): List[] {
    return rows.map(adaptListRow);
}

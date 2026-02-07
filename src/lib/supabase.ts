import { createClient } from '@supabase/supabase-js';

// Supabase configuration - empty strings disable the client in demo mode
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Create Supabase client
export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key',
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
        },
    }
);

// Storage bucket name
export const STORAGE_BUCKET = 'stash_vault';

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
    return (
        supabaseUrl !== '' &&
        supabaseAnonKey !== '' &&
        !supabaseUrl.includes('placeholder') &&
        !supabaseUrl.includes('your-project')
    );
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Helper: retry function with exponential backoff
async function withRetry<T>(
    fn: () => Promise<T>,
    retries = MAX_RETRIES
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            console.warn(`Attempt ${attempt + 1} failed:`, error);

            if (attempt < retries - 1) {
                await new Promise(resolve =>
                    setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt))
                );
            }
        }
    }

    throw lastError;
}

// Upload file with retry and progress
export async function uploadFile(
    file: File,
    userId: string,
    type: 'image' | 'file',
    onProgress?: (progress: number) => void
): Promise<{ path: string; url: string; error: Error | null }> {
    if (!isSupabaseConfigured()) {
        // Return blob URL for local-only mode
        const localUrl = URL.createObjectURL(file);
        return { path: localUrl, url: localUrl, error: null };
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const uuid = crypto.randomUUID();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `${userId}/${type}/${year}/${month}/${uuid}-${sanitizedName}`;

    try {
        const result = await withRetry(async () => {
            const { error } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(path, file, {
                    cacheControl: '3600',
                    upsert: false,
                });

            if (error) throw error;

            // Get public URL
            const { data: urlData } = supabase.storage
                .from(STORAGE_BUCKET)
                .getPublicUrl(path);

            return { path, url: urlData.publicUrl };
        });

        onProgress?.(100);
        return { ...result, error: null };
    } catch (error) {
        console.error('Upload failed after retries:', error);
        return { path: '', url: '', error: error as Error };
    }
}

// Get signed URL for private files
export async function getSignedUrl(
    path: string,
    expiresIn = 3600
): Promise<string | null> {
    if (!isSupabaseConfigured()) return path; // Return as-is for local mode

    // If path is already a full URL (blob: or http), return as is
    if (path.startsWith('blob:') || path.startsWith('http')) return path;

    try {
        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(path, expiresIn);

        if (error) throw error;
        return data.signedUrl;
    } catch (error) {
        console.error('Error getting signed URL:', error);
        return null;
    }
}

// Delete file from storage
export async function deleteFile(path: string): Promise<boolean> {
    if (!isSupabaseConfigured()) return true;

    try {
        const { error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([path]);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error deleting file:', error);
        return false;
    }
}

// Download file
export async function downloadFile(path: string): Promise<Blob | null> {
    if (!isSupabaseConfigured()) return null;

    try {
        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .download(path);

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error downloading file:', error);
        return null;
    }
}

// List user files
export async function listUserFiles(
    userId: string,
    type?: 'image' | 'file'
): Promise<{ name: string; path: string; size: number }[]> {
    if (!isSupabaseConfigured()) return [];

    const prefix = type ? `${userId}/${type}` : userId;

    try {
        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .list(prefix, { sortBy: { column: 'created_at', order: 'desc' } });

        if (error) throw error;

        return (data || []).map(file => ({
            name: file.name,
            path: `${prefix}/${file.name}`,
            size: file.metadata?.size || 0,
        }));
    } catch (error) {
        console.error('Error listing files:', error);
        return [];
    }
}

// Auth helpers
export async function signInWithEmail(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(email: string, password: string) {
    return supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
    });
}

export async function signInWithMagicLink(email: string) {
    return supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
    });
}

export async function signOut() {
    return supabase.auth.signOut();
}

export async function getSession() {
    return supabase.auth.getSession();
}

// Enhanced callback type that includes provider tokens and event
export type AuthChangeCallback = (
    user: { id: string; email: string } | null,
    session?: { provider_refresh_token?: string | null; provider_token?: string | null } | null,
    event?: string
) => void;

export function onAuthStateChange(callback: AuthChangeCallback) {
    return supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
            callback(
                { id: session.user.id, email: session.user.email || '' },
                { provider_refresh_token: session.provider_refresh_token, provider_token: session.provider_token },
                event
            );
        } else {
            callback(null, null, event);
        }
    });
}

import type { Task } from './types';

// ============ TASKS DATABASE OPERATIONS ============

// Upsert a task (create or update)
export async function upsertTask(task: Task): Promise<{ success: boolean; error: Error | null }> {
    if (!isSupabaseConfigured()) {
        console.log('Supabase not configured, task saved locally only');
        return { success: true, error: null };
    }

    try {
        const { error } = await supabase
            .from('tasks')
            .upsert(task, { onConflict: 'id' });

        if (error) throw error;
        return { success: true, error: null };
    } catch (error) {
        console.error('Error upserting task:', error);
        return { success: false, error: error as Error };
    }
}

// Get all tasks for a user
export async function getTasks(userId: string): Promise<Task[]> {
    if (!isSupabaseConfigured()) return [];

    try {
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error fetching tasks:', error);
        return [];
    }
}

// Delete a task
export async function deleteTaskDb(taskId: string): Promise<boolean> {
    if (!isSupabaseConfigured()) return true;

    try {
        const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', taskId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error deleting task:', error);
        return false;
    }
}

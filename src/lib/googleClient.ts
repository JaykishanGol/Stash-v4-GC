import { supabase } from './supabase';

const GOOGLE_API_BASE = 'https://www.googleapis.com';

// --- TYPES ---

export interface GoogleTaskList {
    id: string;
    title: string;
    updated: string;
}

export interface GoogleCalendarListEntry {
    id: string;
    summary: string;
    backgroundColor?: string;
    foregroundColor?: string;
    primary?: boolean;
    accessRole: 'owner' | 'writer' | 'reader' | 'freeBusyReader';
}

export interface GoogleTask {
    id: string;
    title: string;
    notes?: string;
    due?: string;
    status: 'needsAction' | 'completed';
    parent?: string; // Parent Task ID
    position?: string;
    etag?: string;
}

export interface GoogleEvent {
    id: string;
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
    status: 'confirmed' | 'tentative' | 'cancelled';
    colorId?: string;

    // New Fields
    attendees?: { email: string; responseStatus?: string }[];
    conferenceData?: {
        createRequest?: {
            requestId: string;
            conferenceSolutionKey: { type: string };
        };
        entryPoints?: { entryPointType: string; uri: string; label?: string }[];
    };
    transparency?: 'opaque' | 'transparent'; // opaque=Busy, transparent=Free
    visibility?: 'default' | 'public' | 'private';
    reminders?: {
        useDefault: boolean;
        overrides?: { method: 'email' | 'popup', minutes: number }[];
    };
    etag?: string;
}

export class GoogleClient {
    private static async getAccessToken(): Promise<string | null> {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.provider_token) {
            console.log('[GoogleClient] No provider token, attempting refresh...');
            
            // Attempt 1: Standard Refresh
            const { data, error } = await supabase.auth.refreshSession();

            if (error) {
                console.warn('[GoogleClient] Session refresh failed:', error.message);
                return null;
            }

            if (!data.session?.provider_token) {
                // Attempt 2: Check if we SHOULD have one
                const { data: userSettings } = await supabase
                    .from('user_settings')
                    .select('is_google_connected')
                    .eq('user_id', session?.user?.id)
                    .single();
                
                if (userSettings?.is_google_connected) {
                    console.warn('[GoogleClient] User expects connection but token is missing. Re-auth required.');
                    // In a real app, we might trigger a UI toast here
                }
                return null;
            }

            console.log('[GoogleClient] Token refreshed successfully');
            return data.session.provider_token;
        }

        return session.provider_token;
    }

    private static async request<T>(endpoint: string, method: string = 'GET', body?: any): Promise<T> {
        const token = await this.getAccessToken();
        if (!token) throw new Error('No Google Access Token');

        const headers: HeadersInit = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        const response = await fetch(`${GOOGLE_API_BASE}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[GoogleClient] Error ${response.status}:`, errorText);
            throw new Error(`Google API Error: ${response.statusText}`);
        }

        if (response.status === 204) return {} as T;
        return response.json();
    }

    // ============ TASKS API ============

    static async listTaskLists(): Promise<GoogleTaskList[]> {
        const res = await this.request<{ items: GoogleTaskList[] }>('/tasks/v1/users/@me/lists');
        return res.items || [];
    }

    static async createTask(taskListId: string = '@default', task: any): Promise<GoogleTask> {
        return this.request<GoogleTask>(`/tasks/v1/lists/${taskListId}/tasks`, 'POST', task);
    }

    static async updateTask(taskListId: string = '@default', taskId: string, updates: any): Promise<GoogleTask> {
        return this.request<GoogleTask>(`/tasks/v1/lists/${taskListId}/tasks/${taskId}`, 'PATCH', updates);
    }

    static async deleteTask(taskListId: string = '@default', taskId: string): Promise<void> {
        return this.request<void>(`/tasks/v1/lists/${taskListId}/tasks/${taskId}`, 'DELETE');
    }

    // ============ CALENDAR API ============

    static async listCalendars(): Promise<GoogleCalendarListEntry[]> {
        const res = await this.request<{ items: GoogleCalendarListEntry[] }>('/calendar/v3/users/me/calendarList?minAccessRole=writer');
        return res.items || [];
    }

    static async createEvent(calendarId: string = 'primary', event: any): Promise<GoogleEvent> {
        // We append conferenceDataVersion=1 to enable Meet link generation
        return this.request<GoogleEvent>(
            `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
            'POST',
            event
        );
    }

    static async updateEvent(calendarId: string = 'primary', eventId: string, updates: any): Promise<GoogleEvent> {
        return this.request<GoogleEvent>(
            `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?conferenceDataVersion=1`,
            'PATCH',
            updates
        );
    }

    static async deleteEvent(calendarId: string = 'primary', eventId: string): Promise<void> {
        return this.request<void>(`/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, 'DELETE');
    }

    // ============ LIST/PULL METHODS (Two-Way Sync) ============

    static async listEvents(calendarId: string = 'primary', options: { timeMin?: string; maxResults?: number } = {}): Promise<GoogleEvent[]> {
        const params = new URLSearchParams();
        params.set('maxResults', String(options.maxResults || 250));
        params.set('singleEvents', 'true'); // Expand recurring events
        params.set('orderBy', 'updated');
        if (options.timeMin) params.set('timeMin', options.timeMin);

        const res = await this.request<{ items: GoogleEvent[] }>(
            `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`
        );
        return res.items || [];
    }

    static async listAllTasks(taskListId: string = '@default'): Promise<GoogleTask[]> {
        const res = await this.request<{ items: GoogleTask[] }>(
            `/tasks/v1/lists/${taskListId}/tasks?showCompleted=true&showHidden=true`
        );
        return res.items || [];
    }

    // ============ UTILITY ============

    static async hasValidToken(): Promise<boolean> {
        const token = await this.getAccessToken();
        return token !== null;
    }
}

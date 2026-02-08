import { supabase } from './supabase';

const GOOGLE_API_BASE = 'https://www.googleapis.com';

// --- TYPES ---

export interface GoogleTaskList {
    id: string;
    title: string;
    updated: string;
    etag?: string;
    kind?: string;
    selfLink?: string;
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
    updated?: string;
    completed?: string;
    status: 'needsAction' | 'completed';
    parent?: string; // Parent Task ID
    position?: string;
    etag?: string;
    deleted?: boolean;
    hidden?: boolean;
}

export interface GoogleEvent {
    id: string;
    summary: string;
    updated?: string;
    description?: string;
    location?: string;
    htmlLink?: string;
    recurrence?: string[];
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
    status: 'confirmed' | 'tentative' | 'cancelled';
    colorId?: string;
    recurringEventId?: string;
    originalStartTime?: { dateTime?: string; date?: string };

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

const NO_GOOGLE_ACCESS_TOKEN = 'NO_GOOGLE_ACCESS_TOKEN';

type GoogleAuthError = Error & { code?: string };
type GoogleRequestError = Error & {
    status?: number;
    endpoint?: string;
    details?: string;
};

export function isNoGoogleAccessTokenError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const maybeError = error as GoogleAuthError;
    return (
        maybeError.code === NO_GOOGLE_ACCESS_TOKEN ||
        maybeError.message === 'No Google Access Token'
    );
}

export class GoogleClient {
    private static accessTokenCache: { token: string; expiresAt: number } | null = null;
    private static accessTokenPromise: Promise<string | null> | null = null;
    private static retryAfterMs = 0;
    private static readonly ACCESS_TOKEN_CACHE_MS = 55 * 60 * 1000;
    private static readonly FAILURE_COOLDOWN_MS = 60 * 1000;

    private static cacheToken(token: string) {
        this.accessTokenCache = {
            token,
            expiresAt: Date.now() + this.ACCESS_TOKEN_CACHE_MS,
        };
    }

    private static async resolveAccessToken(): Promise<string | null> {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.provider_token) {
            this.cacheToken(session.provider_token);
            return session.provider_token;
        }

        // Try 2: Standard Supabase session refresh
        const { data, error } = await supabase.auth.refreshSession();

        if (!error && data.session?.provider_token) {
            this.cacheToken(data.session.provider_token);
            return data.session.provider_token;
        }

        // Try 3: Use stored refresh_token to get new access_token
        const userId = session?.user?.id || data?.user?.id;
        if (!userId) {
            return null;
        }

        // Get stored refresh token
        const { data: userSettings } = await supabase
            .from('user_settings')
            .select('google_refresh_token')
            .eq('user_id', userId)
            .single();

        if (!userSettings?.google_refresh_token) {
            return null;
        }

        // Exchange refresh token for new access token
        try {
            const { refreshGoogleAccessToken } = await import('./googleTokenService');
            const newAccessToken = await refreshGoogleAccessToken(userSettings.google_refresh_token);

            if (newAccessToken) {
                this.cacheToken(newAccessToken);
                return newAccessToken;
            }
        } catch {
            return null;
        }

        return null;
    }

    private static async getAccessToken(): Promise<string | null> {
        if (this.accessTokenCache && this.accessTokenCache.expiresAt > Date.now()) {
            return this.accessTokenCache.token;
        }

        if (Date.now() < this.retryAfterMs) {
            return null;
        }

        if (this.accessTokenPromise) {
            return this.accessTokenPromise;
        }

        this.accessTokenPromise = (async () => {
            const token = await this.resolveAccessToken();
            if (!token) {
                this.retryAfterMs = Date.now() + this.FAILURE_COOLDOWN_MS;
                this.accessTokenCache = null;
                return null;
            }
            this.retryAfterMs = 0;
            return token;
        })();

        try {
            return await this.accessTokenPromise;
        } finally {
            this.accessTokenPromise = null;
        }
    }

    /**
     * Public accessor to check if a valid Google token is available.
     * Returns true if a token was obtained, false otherwise.
     */
    static async ensureAccessToken(): Promise<boolean> {
        const token = await this.getAccessToken();
        return !!token;
    }

    private static async request<T>(endpoint: string, method: string = 'GET', body?: unknown): Promise<T> {
        const token = await this.getAccessToken();
        if (!token) {
            const error = new Error('No Google Access Token') as GoogleAuthError;
            error.code = NO_GOOGLE_ACCESS_TOKEN;
            throw error;
        }

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
            let apiMessage = response.statusText || 'Request failed';
            try {
                const parsed = JSON.parse(errorText) as { error?: { message?: string } };
                if (parsed?.error?.message) {
                    apiMessage = parsed.error.message;
                }
            } catch {
                // Non-JSON error body; keep fallback message.
            }

            const error = new Error(`Google API Error (${response.status}): ${apiMessage}`) as GoogleRequestError;
            error.status = response.status;
            error.endpoint = endpoint;
            error.details = errorText;
            console.error(`[GoogleClient] Error ${response.status}:`, errorText);
            throw error;
        }

        if (response.status === 204) return {} as T;
        return response.json();
    }

    // ============ TASKS API ============

    static async listTaskLists(): Promise<GoogleTaskList[]> {
        const res = await this.request<{ items: GoogleTaskList[] }>('/tasks/v1/users/@me/lists?maxResults=100');
        return res.items || [];
    }

    static async listAllTaskLists(): Promise<GoogleTaskList[]> {
        const all: GoogleTaskList[] = [];
        let pageToken: string | undefined;
        do {
            const params = new URLSearchParams();
            params.set('maxResults', '100');
            if (pageToken) params.set('pageToken', pageToken);
            const res = await this.request<{ items?: GoogleTaskList[]; nextPageToken?: string }>(`/tasks/v1/users/@me/lists?${params}`);
            all.push(...(res.items || []));
            pageToken = res.nextPageToken;
        } while (pageToken);
        return all;
    }

    static async createTaskList(title: string): Promise<GoogleTaskList> {
        return this.request<GoogleTaskList>('/tasks/v1/users/@me/lists', 'POST', { title });
    }

    static async updateTaskList(taskListId: string, updates: { title?: string }): Promise<GoogleTaskList> {
        return this.request<GoogleTaskList>(`/tasks/v1/users/@me/lists/${encodeURIComponent(taskListId)}`, 'PATCH', updates);
    }

    static async deleteTaskList(taskListId: string): Promise<void> {
        return this.request<void>(`/tasks/v1/users/@me/lists/${encodeURIComponent(taskListId)}`, 'DELETE');
    }

    static async createTask(
        taskListId: string = '@default',
        task: Record<string, unknown>
    ): Promise<GoogleTask> {
        return this.request<GoogleTask>(
            `/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`,
            'POST',
            task
        );
    }

    static async updateTask(
        taskListId: string = '@default',
        taskId: string,
        updates: Record<string, unknown>
    ): Promise<GoogleTask> {
        return this.request<GoogleTask>(
            `/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
            'PATCH',
            updates
        );
    }

    static async deleteTask(taskListId: string = '@default', taskId: string): Promise<void> {
        return this.request<void>(
            `/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
            'DELETE'
        );
    }

    // ============ CALENDAR API ============

    static async listCalendars(): Promise<GoogleCalendarListEntry[]> {
        const all: GoogleCalendarListEntry[] = [];
        let pageToken: string | undefined;

        do {
            const params = new URLSearchParams();
            params.set('minAccessRole', 'reader');
            params.set('maxResults', '250');
            if (pageToken) params.set('pageToken', pageToken);

            const res = await this.request<{ items?: GoogleCalendarListEntry[]; nextPageToken?: string }>(
                `/calendar/v3/users/me/calendarList?${params}`
            );

            all.push(...(res.items || []));
            pageToken = res.nextPageToken;
        } while (pageToken);

        return all;
    }

    static async createEvent(calendarId: string = 'primary', event: Record<string, unknown>): Promise<GoogleEvent> {
        const query = event.conferenceData ? '?conferenceDataVersion=1' : '';
        return this.request<GoogleEvent>(
            `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${query}`,
            'POST',
            event
        );
    }

    static async updateEvent(
        calendarId: string = 'primary',
        eventId: string,
        updates: Record<string, unknown>
    ): Promise<GoogleEvent> {
        const query = updates.conferenceData ? '?conferenceDataVersion=1' : '';
        return this.request<GoogleEvent>(
            `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}${query}`,
            'PATCH',
            updates
        );
    }

    static async deleteEvent(calendarId: string = 'primary', eventId: string): Promise<void> {
        return this.request<void>(
            `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
            'DELETE'
        );
    }

    // ============ LIST/PULL METHODS (Two-Way Sync) ============

    static async listEvents(
        calendarId: string = 'primary',
        options: {
            timeMin?: string;
            maxResults?: number;
            syncToken?: string;
            pageToken?: string;
            showDeleted?: boolean;
            singleEvents?: boolean;
        } = {}
    ): Promise<{ items: GoogleEvent[]; nextSyncToken?: string; nextPageToken?: string }> {
        const params = new URLSearchParams();
        params.set('maxResults', String(options.maxResults || 250));
        params.set('singleEvents', String(options.singleEvents ?? true));
        params.set('showDeleted', String(options.showDeleted ?? true));
        if (options.pageToken) {
            params.set('pageToken', options.pageToken);
        }
        
        if (options.syncToken) {
            params.set('syncToken', options.syncToken);
        } else if (options.timeMin) {
            params.set('timeMin', options.timeMin);
            if ((options.singleEvents ?? true) === true) {
                params.set('orderBy', 'updated');
            }
        }

        const res = await this.request<{ items: GoogleEvent[]; nextSyncToken?: string; nextPageToken?: string }>(
            `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`
        );

        return {
            items: res.items || [],
            nextSyncToken: res.nextSyncToken,
            nextPageToken: res.nextPageToken,
        };
    }

    static async listEventsPaginated(
        calendarId: string = 'primary',
        options: { timeMin?: string; syncToken?: string; showDeleted?: boolean; singleEvents?: boolean } = {}
    ): Promise<{ items: GoogleEvent[]; nextSyncToken?: string }> {
        const all: GoogleEvent[] = [];
        let pageToken: string | undefined;
        let nextSyncToken: string | undefined;

        do {
            const page = await this.listEvents(calendarId, {
                ...options,
                pageToken,
                maxResults: 250,
            });
            all.push(...(page.items || []));
            pageToken = page.nextPageToken;
            if (page.nextSyncToken) nextSyncToken = page.nextSyncToken;
        } while (pageToken);

        return { items: all, nextSyncToken };
    }

    static async listTasks(
        taskListId: string = '@default',
        options: {
            updatedMin?: string;
            pageToken?: string;
            showCompleted?: boolean;
            showHidden?: boolean;
            showDeleted?: boolean;
            maxResults?: number;
        } = {}
    ): Promise<{ items: GoogleTask[]; nextPageToken?: string }> {
        const params = new URLSearchParams();
        params.set('maxResults', String(options.maxResults || 100));
        params.set('showCompleted', String(options.showCompleted ?? true));
        params.set('showHidden', String(options.showHidden ?? true));
        params.set('showDeleted', String(options.showDeleted ?? true));
        if (options.updatedMin) params.set('updatedMin', options.updatedMin);
        if (options.pageToken) params.set('pageToken', options.pageToken);

        const res = await this.request<{ items?: GoogleTask[]; nextPageToken?: string }>(
            `/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks?${params}`
        );
        return { items: res.items || [], nextPageToken: res.nextPageToken };
    }

    static async listAllTasks(
        taskListId: string = '@default',
        updatedMin?: string
    ): Promise<GoogleTask[]> {
        const all: GoogleTask[] = [];
        let pageToken: string | undefined;
        do {
            const page = await this.listTasks(taskListId, {
                updatedMin,
                pageToken,
                showCompleted: true,
                showHidden: true,
                showDeleted: true,
                maxResults: 100,
            });
            all.push(...page.items);
            pageToken = page.nextPageToken;
        } while (pageToken);
        return all;
    }

    static async updateEventInstance(
        calendarId: string,
        recurringEventId: string,
        instanceEventId: string,
        updates: Record<string, unknown>
    ): Promise<GoogleEvent> {
        // Google instance operations patch the concrete instance event ID.
        // recurringEventId is accepted for caller context and logging consistency.
        void recurringEventId;
        return this.updateEvent(calendarId, instanceEventId, updates);
    }

    static async deleteEventInstance(
        calendarId: string,
        recurringEventId: string,
        instanceEventId: string
    ): Promise<void> {
        void recurringEventId;
        return this.deleteEvent(calendarId, instanceEventId);
    }

    static async moveTask(
        taskListId: string,
        taskId: string,
        options: { parent?: string; previous?: string }
    ): Promise<GoogleTask> {
        const params = new URLSearchParams();
        if (options.parent) params.set('parent', options.parent);
        if (options.previous) params.set('previous', options.previous);
        return this.request<GoogleTask>(
            `/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}/move?${params}`,
            'POST'
        );
    }

    static async clearCompletedTasks(taskListId: string): Promise<void> {
        await this.request<void>(`/tasks/v1/lists/${encodeURIComponent(taskListId)}/clear`, 'POST');
    }

    static async getEvent(calendarId: string, eventId: string): Promise<GoogleEvent> {
        return this.request<GoogleEvent>(
            `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
        );
    }

    static async getTask(taskListId: string, taskId: string): Promise<GoogleTask> {
        return this.request<GoogleTask>(
            `/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`
        );
    }

    static async listEventInstances(
        calendarId: string,
        recurringEventId: string,
        options: { timeMin?: string; timeMax?: string; pageToken?: string; maxResults?: number } = {}
    ): Promise<{ items: GoogleEvent[]; nextPageToken?: string }> {
        const params = new URLSearchParams();
        params.set('maxResults', String(options.maxResults || 250));
        if (options.timeMin) params.set('timeMin', options.timeMin);
        if (options.timeMax) params.set('timeMax', options.timeMax);
        if (options.pageToken) params.set('pageToken', options.pageToken);

        const res = await this.request<{ items?: GoogleEvent[]; nextPageToken?: string }>(
            `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(recurringEventId)}/instances?${params}`
        );
        return { items: res.items || [], nextPageToken: res.nextPageToken };
    }

    static async listAllEventInstances(
        calendarId: string,
        recurringEventId: string,
        options: { timeMin?: string; timeMax?: string } = {}
    ): Promise<GoogleEvent[]> {
        const all: GoogleEvent[] = [];
        let pageToken: string | undefined;
        do {
            const page = await this.listEventInstances(calendarId, recurringEventId, {
                ...options,
                pageToken,
                maxResults: 250,
            });
            all.push(...page.items);
            pageToken = page.nextPageToken;
        } while (pageToken);
        return all;
    }

    static async patchTask(
        taskListId: string,
        taskId: string,
        updates: Record<string, unknown>
    ): Promise<GoogleTask> {
        return this.updateTask(taskListId, taskId, updates);
    }

    static async patchEvent(
        calendarId: string,
        eventId: string,
        updates: Record<string, unknown>
    ): Promise<GoogleEvent> {
        return this.updateEvent(calendarId, eventId, updates);
    }

    static async createOrUpdateTaskList(
        title: string,
        taskListId?: string
    ): Promise<GoogleTaskList> {
        if (taskListId) {
            return this.updateTaskList(taskListId, { title });
        }
        return this.createTaskList(title);
    }

    // ============ UTILITY ============

    static async hasValidToken(): Promise<boolean> {
        const token = await this.getAccessToken();
        return token !== null;
    }
}

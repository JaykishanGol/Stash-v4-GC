/**
 * Google Token Service
 * 
 * Manages Google OAuth refresh tokens for persistent authentication.
 * Stores refresh_token in user_settings and exchanges for new access_token
 * via Netlify function when the current token expires.
 * 
 * SECURITY NOTE:
 * Tokens are stored plaintext in Supabase user_settings table, protected by RLS.
 * This is acceptable because:
 * 1. RLS ensures only the owning user can read their own tokens
 * 2. Refresh tokens alone cannot access data without the client_secret (stored server-side)
 * 3. The token exchange happens via Netlify function which holds the secret
 * 
 * Future improvements could include:
 * - Column-level encryption via Supabase Vault
 * - Token rotation on each refresh
 * - Automatic revocation on suspicious activity
 */

import { supabase } from './supabase';

const REFRESH_ENDPOINT =
    import.meta.env.VITE_GOOGLE_REFRESH_ENDPOINT || '/.netlify/functions/refresh-google-token';
const REFRESH_ENDPOINT_RETRY_MS = 5 * 60 * 1000;
let refreshEndpointUnavailableUntil = 0;
let refreshEndpointWarned = false;
let refreshInFlight: Promise<string | null> | null = null;

/**
 * Store the Google refresh token after OAuth callback
 */
export async function storeGoogleRefreshToken(refreshToken: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.warn('[GoogleTokenService] No user, cannot store token');
        return;
    }

    const { error } = await supabase
        .from('user_settings')
        .upsert({
            user_id: user.id,
            google_refresh_token: refreshToken,
            is_google_connected: true,
            updated_at: new Date().toISOString(),
        });

    if (error) {
        console.error('[GoogleTokenService] Failed to store refresh token:', error);
    } else {
        console.log('[GoogleTokenService] Refresh token stored successfully');
    }
}

/**
 * Get the stored refresh token from database
 */
export async function getStoredRefreshToken(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('user_settings')
        .select('google_refresh_token')
        .eq('user_id', user.id)
        .single();

    if (error || !data?.google_refresh_token) {
        return null;
    }

    return data.google_refresh_token;
}

/**
 * Exchange refresh token for new access token via Netlify function
 */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<string | null> {
    if (Date.now() < refreshEndpointUnavailableUntil) {
        return null;
    }

    if (refreshInFlight) {
        return refreshInFlight;
    }

    refreshInFlight = (async () => {
        try {
            const response = await fetch(REFRESH_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken }),
            });

            // Handle 404 (Netlify function not available in local dev)
            if (response.status === 404) {
                refreshEndpointUnavailableUntil = Date.now() + REFRESH_ENDPOINT_RETRY_MS;
                if (!refreshEndpointWarned) {
                    refreshEndpointWarned = true;
                    console.warn(
                        `[GoogleTokenService] Refresh endpoint not found at "${REFRESH_ENDPOINT}". ` +
                        'Token refresh disabled temporarily (run netlify dev or set VITE_GOOGLE_REFRESH_ENDPOINT).'
                    );
                }
                return null;
            }

            refreshEndpointUnavailableUntil = 0;
            refreshEndpointWarned = false;

            if (!response.ok) {
                // Safely parse error body - may be HTML or empty
                let errorData: { error?: string; requiresReauth?: boolean } = {};
                try {
                    const text = await response.text();
                    if (text) {
                        const parsed = JSON.parse(text) as { error?: string; requiresReauth?: boolean };
                        errorData = parsed;
                    }
                } catch {
                    // Body wasn't JSON - ignore
                }

                // If token is revoked, clear it from DB
                if (errorData.requiresReauth) {
                    console.warn('[GoogleTokenService] Token revoked, clearing stored token');
                    await clearGoogleConnection();
                    return null;
                }

                throw new Error(errorData.error || `Token refresh failed (${response.status})`);
            }

            // Safely parse success body
            const text = await response.text();
            if (!text) {
                console.warn('[GoogleTokenService] Empty response body from refresh endpoint');
                return null;
            }

            const data = JSON.parse(text);
            console.log('[GoogleTokenService] Token refreshed, expires in:', data.expires_in, 'seconds');

            return data.access_token;
        } catch (error) {
            console.error('[GoogleTokenService] Refresh failed:', error);
            return null;
        }
    })();

    try {
        return await refreshInFlight;
    } finally {
        refreshInFlight = null;
    }
}
/**
 * Clear Google connection (used when token is revoked)
 */
export async function clearGoogleConnection(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
        .from('user_settings')
        .update({
            google_refresh_token: null,
            is_google_connected: false,
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
}

/**
 * Check if user has a stored refresh token (persistent Google connection)
 * Falls back to checking is_google_connected for session-based auth
 */
export async function hasStoredGoogleConnection(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
        .from('user_settings')
        .select('google_refresh_token')
        .eq('user_id', user.id)
        .single();

    if (error) return false;

    const hasToken = !!data?.google_refresh_token;

    // ONLY return true if we have an actual refresh token stored in the database
    // The is_google_connected flag alone is not sufficient - it may have been
    // set before OAuth completed, or the token could have been revoked
    return hasToken;
}


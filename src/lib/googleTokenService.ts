/**
 * Google Token Service
 * 
 * Manages Google OAuth refresh tokens for persistent authentication.
 * Stores refresh_token in user_settings and exchanges for new access_token
 * via Netlify function when the current token expires.
 */

import { supabase } from './supabase';

const REFRESH_ENDPOINT = '/.netlify/functions/refresh-google-token';

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
    try {
        const response = await fetch(REFRESH_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) {
            const errorData = await response.json();

            // If token is revoked, clear it from DB
            if (errorData.requiresReauth) {
                console.warn('[GoogleTokenService] Token revoked, clearing stored token');
                await clearGoogleConnection();
                return null;
            }

            throw new Error(errorData.error || 'Token refresh failed');
        }

        const data = await response.json();
        console.log('[GoogleTokenService] Token refreshed, expires in:', data.expires_in, 'seconds');

        return data.access_token;
    } catch (error) {
        console.error('[GoogleTokenService] Refresh failed:', error);
        return null;
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
 */
export async function hasStoredGoogleConnection(): Promise<boolean> {
    const token = await getStoredRefreshToken();
    return token !== null;
}

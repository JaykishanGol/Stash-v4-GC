import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { 
    getStoredRefreshToken, 
    refreshGoogleAccessToken, 
    clearGoogleConnection,
    hasStoredGoogleConnection
} from '../lib/googleTokenService';

interface GoogleAuthState {
    /** True if user has a valid Google connection (stored refresh token) */
    isConnected: boolean;
    /** True if we're currently checking/initializing */
    isLoading: boolean;
    /** Current access token (refreshed as needed) */
    accessToken: string | null;
    /** Error message if something went wrong */
    error: string | null;
}

/**
 * Hook for managing Google authentication state across devices.
 * 
 * This hook checks the DATABASE for stored refresh tokens, not just
 * the session's provider_token. This allows Google connection to
 * persist across all devices/sessions.
 * 
 * Usage:
 *   const { isConnected, accessToken, getAccessToken, reconnect } = useGoogleAuth();
 */
export function useGoogleAuth() {
    const [state, setState] = useState<GoogleAuthState>({
        isConnected: false,
        isLoading: true,
        accessToken: null,
        error: null,
    });

    // Cache the access token with expiry
    const tokenCache = useRef<{ token: string; expiresAt: number } | null>(null);

    /**
     * Check if user has Google connected by checking database
     */
    const checkConnection = useCallback(async () => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            // First, check session for immediate provider_token
            const { data: { session } } = await supabase.auth.getSession();
            
            if (session?.provider_token) {
                // Provider token exists in session (original OAuth device)
                tokenCache.current = {
                    token: session.provider_token,
                    expiresAt: Date.now() + 3500 * 1000, // ~1 hour
                };
                setState({
                    isConnected: true,
                    isLoading: false,
                    accessToken: session.provider_token,
                    error: null,
                });
                return;
            }

            // No provider_token in session - check database for stored refresh token
            const hasConnection = await hasStoredGoogleConnection();
            
            if (hasConnection) {
                console.log('[useGoogleAuth] Found stored Google connection, will refresh on demand');
                setState({
                    isConnected: true,
                    isLoading: false,
                    accessToken: null, // Will be fetched on demand
                    error: null,
                });
            } else {
                setState({
                    isConnected: false,
                    isLoading: false,
                    accessToken: null,
                    error: null,
                });
            }
        } catch (err: any) {
            console.error('[useGoogleAuth] Check failed:', err);
            setState({
                isConnected: false,
                isLoading: false,
                accessToken: null,
                error: err.message,
            });
        }
    }, []);

    /**
     * Get a valid access token (refreshing if needed)
     * This is the main method components should use to get tokens.
     */
    const getAccessToken = useCallback(async (): Promise<string | null> => {
        // Check cache first
        if (tokenCache.current && tokenCache.current.expiresAt > Date.now()) {
            return tokenCache.current.token;
        }

        // Try session provider_token
        // NOTE: We rely on Supabase's autoRefreshToken instead of explicitly calling refreshSession()
        // Multiple simultaneous refresh calls can cause race conditions and session invalidation
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.provider_token) {
            tokenCache.current = {
                token: session.provider_token,
                expiresAt: Date.now() + 3500 * 1000,
            };
            setState(prev => ({ ...prev, accessToken: session.provider_token ?? null }));
            return session.provider_token;
        }

        // Use stored refresh token
        const refreshToken = await getStoredRefreshToken();
        if (!refreshToken) {
            console.warn('[useGoogleAuth] No refresh token available');
            setState(prev => ({ ...prev, isConnected: false, accessToken: null }));
            return null;
        }

        // Exchange refresh token for access token
        const newAccessToken = await refreshGoogleAccessToken(refreshToken);
        if (newAccessToken) {
            tokenCache.current = {
                token: newAccessToken,
                expiresAt: Date.now() + 3500 * 1000, // ~1 hour
            };
            setState(prev => ({ ...prev, accessToken: newAccessToken }));
            return newAccessToken;
        }

        // Token refresh failed - connection may be revoked
        console.warn('[useGoogleAuth] Token refresh failed, clearing connection');
        setState(prev => ({ ...prev, isConnected: false, accessToken: null }));
        return null;
    }, []);

    /**
     * Disconnect Google (clear stored tokens)
     */
    const disconnect = useCallback(async () => {
        await clearGoogleConnection();
        tokenCache.current = null;
        setState({
            isConnected: false,
            isLoading: false,
            accessToken: null,
            error: null,
        });
    }, []);

    /**
     * Trigger reconnection flow
     */
    const reconnect = useCallback(async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                scopes: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks',
                redirectTo: window.location.origin,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent' // Force consent to get refresh token
                }
            }
        });
    }, []);

    // Initialize on mount
    useEffect(() => {
        checkConnection();

        // Re-check when auth state changes
        // NOTE: Do NOT check on TOKEN_REFRESHED - this causes race conditions with
        // multiple refresh attempts that can invalidate the session
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_IN') {
                checkConnection();
            } else if (event === 'SIGNED_OUT') {
                tokenCache.current = null;
                setState({
                    isConnected: false,
                    isLoading: false,
                    accessToken: null,
                    error: null,
                });
            }
        });

        return () => subscription.unsubscribe();
    }, [checkConnection]);

    return {
        ...state,
        getAccessToken,
        disconnect,
        reconnect,
        checkConnection,
    };
}

/**
 * Singleton-like access to Google auth state for non-component code
 * (like GoogleClient)
 */
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

export async function getGoogleAccessTokenGlobal(): Promise<string | null> {
    // Check cache
    if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
        return cachedAccessToken.token;
    }

    // Try session
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.provider_token) {
        cachedAccessToken = {
            token: session.provider_token,
            expiresAt: Date.now() + 3500 * 1000,
        };
        return session.provider_token;
    }

    // Try session refresh
    const { data: refreshedData } = await supabase.auth.refreshSession();
    if (refreshedData.session?.provider_token) {
        cachedAccessToken = {
            token: refreshedData.session.provider_token,
            expiresAt: Date.now() + 3500 * 1000,
        };
        return refreshedData.session.provider_token;
    }

    // Use stored refresh token
    const refreshToken = await getStoredRefreshToken();
    if (!refreshToken) {
        return null;
    }

    const newAccessToken = await refreshGoogleAccessToken(refreshToken);
    if (newAccessToken) {
        cachedAccessToken = {
            token: newAccessToken,
            expiresAt: Date.now() + 3500 * 1000,
        };
        return newAccessToken;
    }

    return null;
}

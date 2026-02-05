import { useEffect, useState, useRef } from 'react';
import { onAuthStateChange, getSession, isSupabaseConfigured } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { storeGoogleRefreshToken } from '../lib/googleTokenService';

/**
 * Robust Auth Hook
 * Handles session initialization, auth state changes, and demo mode
 * 
 * FIXES APPLIED (Gemini CLI):
 * 1. Debounced loadUserData to prevent "Token Refresh" loops.
 * 2. Added useRef to track the current user ID and avoid redundant fetches.
 */
export function useAuth() {
    const { setUser, loadUserData, user } = useAppStore();
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // Track the last processed user ID to prevent redundant re-fetches
    const lastUserIdRef = useRef<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        const initializeAuth = async () => {
            try {
                if (!isSupabaseConfigured()) {
                    console.log('[Auth] Supabase not configured, entering demo mode');
                    if (isMounted) {
                        setUser({ id: 'demo', email: 'demo@local' });
                        setIsLoading(false);
                    }
                    return;
                }

                // Check for existing session
                const { data: { session }, error: sessionError } = await getSession();

                if (sessionError) throw sessionError;

                if (isMounted && session?.user) {
                    const userId = session.user.id;
                    const userEmail = session.user.email || '';

                    setUser({ id: userId, email: userEmail });

                    // Only load data if this is a NEW user session or first load
                    if (lastUserIdRef.current !== userId) {
                        console.log('[Auth] New session found, loading data...');
                        lastUserIdRef.current = userId;

                        // Store Google refresh token if present (OAuth callback)
                        if (session.provider_refresh_token) {
                            console.log('[Auth] Storing Google refresh token...');
                            storeGoogleRefreshToken(session.provider_refresh_token);
                        }

                        await loadUserData();
                    } else {
                        console.log('[Auth] Session restored (Data already loaded)');
                    }
                }
            } catch (err) {
                console.error('[Auth] Initialization failed:', err);
                if (isMounted) setError(err as Error);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        initializeAuth();

        // Listen for auth changes (including OAuth callbacks)
        const { data: { subscription } } = onAuthStateChange(async (updatedUser, session, event) => {
            if (!isMounted) return;

            const newUserId = updatedUser?.id || null;

            // Capture Google refresh token on OAuth SIGNED_IN event
            if (event === 'SIGNED_IN' && session?.provider_refresh_token) {
                console.log('[Auth] OAuth SIGNED_IN: Storing Google refresh token...');
                storeGoogleRefreshToken(session.provider_refresh_token);
            }

            // LOGIC FIX: Only trigger actions if the user IDENTITY actually changed.
            // Ignore "TOKEN_REFRESHED" events where the user ID stays the same.
            if (newUserId !== lastUserIdRef.current) {
                console.log('[Auth] Identity changed:', newUserId ? `User ${newUserId}` : 'Signed Out');
                setUser(updatedUser);
                lastUserIdRef.current = newUserId;

                if (updatedUser) {
                    await loadUserData();
                } else {
                    // Optional: Clear data on logout if store doesn't handle it
                }
            } else {
                // Token refreshed, but same user. Do NOTHING.
                // This stops the infinite egress loop.
                console.log('[Auth] Token refreshed (Silent update)');
            }
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, [setUser, loadUserData]);

    return {
        user,
        isLoading,
        error,
        isConfigured: isSupabaseConfigured(),
        isAuthenticated: !!user && user.id !== 'demo'
    };
}
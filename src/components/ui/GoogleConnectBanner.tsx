import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { GoogleClient } from '../../lib/googleClient';

interface GoogleConnectBannerProps {
    className?: string;
    compact?: boolean;
}

/**
 * Banner component shown when user needs to connect their Google account
 * for Calendar/Tasks sync functionality.
 */
export function GoogleConnectBanner({ className = '', compact = false }: GoogleConnectBannerProps) {
    const [isConnectedInDb, setIsConnectedInDb] = useState(false);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        checkStatus();
    }, []);

    const checkStatus = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from('user_settings')
                .select('is_google_connected')
                .eq('user_id', user.id)
                .single();
            
            if (data?.is_google_connected) {
                setIsConnectedInDb(true);
            }
        }
        setChecking(false);
    };

    const handleConnect = async () => {
        // Mark intent in DB before redirecting
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('user_settings').upsert({ 
                user_id: user.id, 
                is_google_connected: true 
            });
        }

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
    };

    if (checking) return null;

    if (compact) {
        return (
            <button
                className={`google-connect-compact ${className}`}
                onClick={handleConnect}
                title={isConnectedInDb ? "Session expired - Click to reconnect" : "Connect Google Account"}
            >
                <svg viewBox="0 0 24 24" width="18" height="18">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {isConnectedInDb ? 'Reconnect Google' : 'Connect Google'}
            </button>
        );
    }

    return (
        <div className={`google-connect-banner ${className} ${isConnectedInDb ? 'reconnect' : ''}`}>
            <div className="banner-icon">
                <svg viewBox="0 0 24 24" width="32" height="32">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
            </div>
            <div className="banner-content">
                <strong>{isConnectedInDb ? 'Google Connection Expired' : 'Connect Google Account'}</strong>
                <p>
                    {isConnectedInDb 
                        ? 'Your secure session has ended. Please reconnect to sync events.' 
                        : 'Sync your events and tasks with Google Calendar'}
                </p>
            </div>
            <button className="banner-btn" onClick={handleConnect}>
                {isConnectedInDb ? 'Reconnect' : 'Connect'}
            </button>

            <style>{`
                .google-connect-banner {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 16px 20px;
                    background: linear-gradient(135deg, #F8F9FA 0%, #E8F0FE 100%);
                    border-radius: 12px;
                    margin-bottom: 16px;
                    border: 1px solid #DADCE0;
                }
                .google-connect-banner.reconnect {
                    background: #FFF4E5; /* Light Orange/Yellow */
                    border-color: #FED7AA;
                }
                .banner-icon {
                    flex-shrink: 0;
                }
                .banner-content {
                    flex: 1;
                }
                .banner-content strong {
                    display: block;
                    font-size: 15px;
                    font-weight: 600;
                    color: #202124;
                    margin-bottom: 2px;
                }
                .banner-content p {
                    font-size: 13px;
                    color: #5F6368;
                    margin: 0;
                }
                .banner-btn {
                    padding: 8px 20px;
                    background: #1A73E8;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-weight: 500;
                    font-size: 14px;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .banner-btn:hover {
                    background: #1557B0;
                }

                .google-connect-compact {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    background: white;
                    border: 1px solid #DADCE0;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 500;
                    color: #3C4043;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .google-connect-compact:hover {
                    background: #F8F9FA;
                    border-color: #1A73E8;
                }
            `}</style>
        </div>
    );
}

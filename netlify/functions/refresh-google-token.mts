import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { checkRateLimit, getClientIP, getRateLimitHeaders } from './lib/rateLimiter.mjs';

/**
 * Netlify Function: refresh-google-token
 * 
 * Securely exchanges a Google refresh_token for a new access_token.
 * The client_secret is kept secure on the server side.
 * 
 * Security Features:
 * - IP-based rate limiting (10 requests per minute)
 * - Input validation
 * 
 * Required Environment Variables (set in Netlify Dashboard):
 * - GOOGLE_CLIENT_ID: Your Google OAuth Client ID
 * - GOOGLE_CLIENT_SECRET: Your Google OAuth Client Secret
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Rate limit: 10 requests per minute per IP
const RATE_LIMIT_CONFIG = { maxRequests: 10, windowMs: 60000 };

interface RefreshRequest {
    refresh_token: string;
}

interface GoogleTokenResponse {
    access_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
}

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
    // Get client IP for rate limiting
    const clientIP = getClientIP(event.headers as Record<string, string>);
    
    // Check rate limit
    const rateLimitResult = checkRateLimit(`token-refresh:${clientIP}`, RATE_LIMIT_CONFIG);
    
    // CORS headers with rate limit info
    // Restrict origin to deployed site or localhost for development
    const allowedOrigin = process.env.SITE_URL || process.env.URL || 'https://stash-app.netlify.app';
    const requestOrigin = (event.headers as Record<string, string>)['origin'] || '';
    const corsOrigin = requestOrigin === allowedOrigin || requestOrigin.startsWith('http://localhost')
        ? requestOrigin
        : allowedOrigin;

    const headers = {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json',
        ...getRateLimitHeaders(rateLimitResult),
    };

    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }

    // Enforce rate limit
    if (!rateLimitResult.allowed) {
        console.warn(`[refresh-google-token] Rate limited IP: ${clientIP}`);
        return {
            statusCode: 429,
            headers,
            body: JSON.stringify({
                error: 'Too Many Requests',
                message: 'Rate limit exceeded. Please try again later.',
                retryAfterMs: rateLimitResult.retryAfterMs
            }),
        };
    }

    try {
        // Parse request body with validation
        let body: RefreshRequest;
        try {
            body = JSON.parse(event.body || '{}');
        } catch {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid JSON body' }),
            };
        }
        const { refresh_token } = body;

        if (!refresh_token) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing refresh_token' }),
            };
        }
        
        // Basic input validation
        if (typeof refresh_token !== 'string' || refresh_token.length > 2048) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid refresh_token format' }),
            };
        }

        // Get credentials from environment
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            console.error('[refresh-google-token] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Server configuration error' }),
            };
        }

        // Exchange refresh token for new access token
        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refresh_token,
                grant_type: 'refresh_token',
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('[refresh-google-token] Google API Error:', errorText);

            // Check if refresh token is revoked
            if (tokenResponse.status === 400 && errorText.includes('invalid_grant')) {
                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({
                        error: 'Token revoked',
                        requiresReauth: true
                    }),
                };
            }

            return {
                statusCode: tokenResponse.status,
                headers,
                body: JSON.stringify({ error: 'Failed to refresh token' }),
            };
        }

        const tokenData: GoogleTokenResponse = await tokenResponse.json();

        console.log('[refresh-google-token] Successfully refreshed token');

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                access_token: tokenData.access_token,
                expires_in: tokenData.expires_in,
            }),
        };
    } catch (error: any) {
        console.error('[refresh-google-token] Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};

export { handler };

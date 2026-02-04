/**
 * Simple in-memory rate limiter for Netlify Functions
 * 
 * Note: This uses in-memory storage which resets when the function cold starts.
 * For production, consider using Redis/Upstash or Supabase for persistent rate limiting.
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

// In-memory store (resets on cold start)
const rateLimitStore: Map<string, RateLimitEntry> = new Map();

// Cleanup old entries periodically
function cleanupStore() {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.resetAt < now) {
            rateLimitStore.delete(key);
        }
    }
}

// Run cleanup every 60 seconds
setInterval(cleanupStore, 60000);

export interface RateLimitConfig {
    /** Maximum requests allowed in the window */
    maxRequests: number;
    /** Window size in milliseconds */
    windowMs: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfterMs?: number;
}

/**
 * Check if a request should be rate limited
 * @param identifier - Unique identifier (IP, user ID, etc.)
 * @param config - Rate limit configuration
 */
export function checkRateLimit(
    identifier: string,
    config: RateLimitConfig = { maxRequests: 10, windowMs: 60000 }
): RateLimitResult {
    const now = Date.now();
    const key = identifier;
    
    let entry = rateLimitStore.get(key);
    
    // Create new entry or reset if window expired
    if (!entry || entry.resetAt < now) {
        entry = {
            count: 0,
            resetAt: now + config.windowMs
        };
    }
    
    entry.count++;
    rateLimitStore.set(key, entry);
    
    const remaining = Math.max(0, config.maxRequests - entry.count);
    const allowed = entry.count <= config.maxRequests;
    
    return {
        allowed,
        remaining,
        resetAt: entry.resetAt,
        retryAfterMs: allowed ? undefined : entry.resetAt - now
    };
}

/**
 * Extract client IP from Netlify event
 */
export function getClientIP(headers: Record<string, string | undefined>): string {
    // Netlify provides the real IP in x-nf-client-connection-ip
    return (
        headers['x-nf-client-connection-ip'] ||
        headers['x-forwarded-for']?.split(',')[0].trim() ||
        headers['x-real-ip'] ||
        'unknown'
    );
}

/**
 * Create rate limit response headers
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
        'X-RateLimit-Limit': result.remaining.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
        ...(result.retryAfterMs ? { 'Retry-After': Math.ceil(result.retryAfterMs / 1000).toString() } : {})
    };
}

/**
 * Create a 429 Too Many Requests response
 */
export function createRateLimitResponse(result: RateLimitResult, headers: Record<string, string> = {}): Response {
    return new Response(
        JSON.stringify({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfterMs: result.retryAfterMs
        }),
        {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
                ...getRateLimitHeaders(result)
            }
        }
    );
}

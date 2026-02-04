/**
 * Centralized Error Handling Module
 * Provides robust error handling, recovery, notification integration,
 * and optional Sentry error tracking.
 */

// ============================================
// ERROR TRACKING (Sentry Integration)
// ============================================

interface ErrorTrackingConfig {
    dsn?: string;
    environment?: string;
    enabled: boolean;
}

interface TrackedError {
    message: string;
    code: string;
    context?: Record<string, unknown>;
    timestamp: string;
    stack?: string;
    userId?: string;
    sessionId: string;
}

// Error tracking state
const errorTracker = {
    config: {
        dsn: import.meta.env.VITE_SENTRY_DSN || '',
        environment: import.meta.env.MODE || 'development',
        enabled: false,
    } as ErrorTrackingConfig,
    sessionId: `session_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    errors: [] as TrackedError[],
    userId: null as string | null,
};

/**
 * Initialize error tracking (call once at app startup)
 */
export function initErrorTracking(config?: Partial<ErrorTrackingConfig>) {
    if (config) {
        errorTracker.config = { ...errorTracker.config, ...config };
    }
    
    errorTracker.config.enabled = !!errorTracker.config.dsn;
    
    if (errorTracker.config.enabled) {
        console.log('[ErrorTracking] Initialized with DSN');
        
        // Set up global error handlers
        window.addEventListener('error', (event) => {
            captureException(event.error || new Error(event.message), {
                source: 'window.onerror',
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
            });
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            captureException(event.reason, {
                source: 'unhandledrejection',
            });
        });
    }
}

/**
 * Set user ID for error tracking context
 */
export function setErrorTrackingUser(userId: string | null) {
    errorTracker.userId = userId;
}

/**
 * Capture and track an exception
 */
export function captureException(
    error: Error | AppError | unknown,
    context?: Record<string, unknown>
) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    const trackedError: TrackedError = {
        message: errorObj.message,
        code: (error as AppError)?.code || 'UNKNOWN',
        context: {
            ...context,
            ...((error as AppError)?.context || {}),
        },
        timestamp: new Date().toISOString(),
        stack: errorObj.stack,
        userId: errorTracker.userId || undefined,
        sessionId: errorTracker.sessionId,
    };
    
    // Store locally (limited to last 50 errors)
    errorTracker.errors.push(trackedError);
    if (errorTracker.errors.length > 50) {
        errorTracker.errors.shift();
    }
    
    // Log to console in development
    console.error('[ErrorTracking]', trackedError);
    
    // Send to Sentry if configured
    if (errorTracker.config.enabled && errorTracker.config.dsn) {
        sendToSentry(trackedError).catch(err => {
            console.warn('[ErrorTracking] Failed to send to Sentry:', err);
        });
    }
}

/**
 * Capture a message (non-error event)
 */
export function captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error' = 'info',
    context?: Record<string, unknown>
) {
    console.log('[ErrorTracking]', level.toUpperCase(), message, context);
    
    if (errorTracker.config.enabled && errorTracker.config.dsn) {
        // Could send to Sentry as a message event in the future
    }
}

/**
 * Get recent errors for debugging
 */
export function getRecentErrors(): TrackedError[] {
    return [...errorTracker.errors];
}

/**
 * Send error to Sentry API
 */
async function sendToSentry(error: TrackedError): Promise<void> {
    if (!errorTracker.config.dsn) return;
    
    // Parse DSN to get project ID and key
    // Format: https://<key>@<host>/<project_id>
    const dsnMatch = errorTracker.config.dsn.match(/https:\/\/(.+)@(.+)\/(\d+)/);
    if (!dsnMatch) return;
    
    const [, key, host, projectId] = dsnMatch;
    const sentryUrl = `https://${host}/api/${projectId}/store/`;
    
    const payload = {
        event_id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: error.timestamp,
        platform: 'javascript',
        environment: errorTracker.config.environment,
        exception: {
            values: [{
                type: error.code,
                value: error.message,
                stacktrace: error.stack ? { frames: parseStackTrace(error.stack) } : undefined,
            }],
        },
        user: error.userId ? { id: error.userId } : undefined,
        tags: {
            session_id: error.sessionId,
        },
        extra: error.context,
    };
    
    try {
        await fetch(sentryUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${key}`,
            },
            body: JSON.stringify(payload),
        });
    } catch (e) {
        // Silently fail - don't want error tracking to cause more errors
    }
}

/**
 * Parse stack trace into Sentry format
 */
function parseStackTrace(stack: string): { filename: string; lineno: number; colno: number; function: string }[] {
    return stack
        .split('\n')
        .slice(1, 10) // Limit frames
        .map(line => {
            const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/) ||
                          line.match(/at\s+(.+?):(\d+):(\d+)/);
            if (match) {
                return {
                    function: match[1] || '<anonymous>',
                    filename: match[2] || 'unknown',
                    lineno: parseInt(match[3] || '0', 10),
                    colno: parseInt(match[4] || '0', 10),
                };
            }
            return null;
        })
        .filter(Boolean) as { filename: string; lineno: number; colno: number; function: string }[];
}

// ============================================
// ERROR CODES AND TYPES
// ============================================

// Error codes for categorizing errors
export const ErrorCode = {
    // Network errors
    NETWORK_ERROR: 'NETWORK_ERROR',
    TIMEOUT: 'TIMEOUT',

    // Auth errors
    UNAUTHORIZED: 'UNAUTHORIZED',
    SESSION_EXPIRED: 'SESSION_EXPIRED',

    // Data errors
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',

    // Storage errors
    STORAGE_FULL: 'STORAGE_FULL',
    UPLOAD_FAILED: 'UPLOAD_FAILED',

    // Generic
    UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// Custom error class with additional context
export class AppError extends Error {
    readonly code: ErrorCode;
    readonly context?: Record<string, unknown>;
    readonly recoverable: boolean;
    readonly timestamp: string;

    constructor(
        message: string,
        code: ErrorCode = ErrorCode.UNKNOWN,
        options?: {
            context?: Record<string, unknown>;
            recoverable?: boolean;
            cause?: Error;
        }
    ) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.context = options?.context;
        this.recoverable = options?.recoverable ?? true;
        this.timestamp = new Date().toISOString();

        if (options?.cause) {
            this.cause = options.cause;
        }
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            context: this.context,
            recoverable: this.recoverable,
            timestamp: this.timestamp,
        };
    }
}

// Result type for operations that can fail
export type Result<T, E = AppError> =
    | { success: true; data: T }
    | { success: false; error: E };

// Create success result
export function ok<T>(data: T): Result<T> {
    return { success: true, data };
}

// Create error result
export function err<E = AppError>(error: E): Result<never, E> {
    return { success: false, error };
}

// Wrap async function with error handling
export async function withErrorHandling<T>(
    fn: () => Promise<T>,
    options?: {
        errorMessage?: string;
        errorCode?: ErrorCode;
        context?: Record<string, unknown>;
    }
): Promise<Result<T>> {
    try {
        const data = await fn();
        return ok(data);
    } catch (error) {
        const appError = error instanceof AppError
            ? error
            : new AppError(
                options?.errorMessage || (error as Error).message || 'Operation failed',
                options?.errorCode || ErrorCode.UNKNOWN,
                {
                    context: options?.context,
                    cause: error as Error,
                }
            );

        console.error('[AppError]', appError.toJSON());
        return err(appError);
    }
}

// Retry configuration
interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    shouldRetry?: (error: Error, attempt: number) => boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    shouldRetry: (error) => {
        // Don't retry validation errors
        if (error instanceof AppError && error.code === ErrorCode.VALIDATION_ERROR) {
            return false;
        }
        return true;
    },
};

// Retry wrapper with exponential backoff
export async function withRetry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {}
): Promise<T> {
    const { maxRetries, baseDelayMs, maxDelayMs, shouldRetry } = {
        ...DEFAULT_RETRY_CONFIG,
        ...config,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;

            const isLastAttempt = attempt === maxRetries;
            const canRetry = shouldRetry?.(lastError, attempt) ?? true;

            if (isLastAttempt || !canRetry) {
                break;
            }

            // Exponential backoff with jitter
            const delay = Math.min(
                baseDelayMs * Math.pow(2, attempt) + Math.random() * 100,
                maxDelayMs
            );

            console.warn(`[Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

// User-friendly error messages
export function getErrorMessage(error: Error | AppError): string {
    if (error instanceof AppError) {
        switch (error.code) {
            case ErrorCode.NETWORK_ERROR:
                return 'Network connection lost. Changes will sync when you\'re back online.';
            case ErrorCode.TIMEOUT:
                return 'The operation took too long. Please try again.';
            case ErrorCode.UNAUTHORIZED:
                return 'You need to sign in to perform this action.';
            case ErrorCode.SESSION_EXPIRED:
                return 'Your session has expired. Please sign in again.';
            case ErrorCode.VALIDATION_ERROR:
                return error.message || 'Invalid data provided.';
            case ErrorCode.NOT_FOUND:
                return 'The item you\'re looking for doesn\'t exist.';
            case ErrorCode.CONFLICT:
                return 'This item was modified elsewhere. Please refresh and try again.';
            case ErrorCode.STORAGE_FULL:
                return 'Storage is full. Please delete some items to free up space.';
            case ErrorCode.UPLOAD_FAILED:
                return 'Failed to upload file. Please try again.';
            default:
                return error.message || 'Something went wrong. Please try again.';
        }
    }

    return error.message || 'An unexpected error occurred.';
}

// Debounce utility with proper typing
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn(...args);
            timeoutId = null;
        }, delay);
    };
}


// Throttle utility
export function throttle<T extends (...args: Parameters<T>) => ReturnType<T>>(
    fn: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle = false;

    return (...args: Parameters<T>) => {
        if (!inThrottle) {
            fn(...args);
            inThrottle = true;
            setTimeout(() => {
                inThrottle = false;
            }, limit);
        }
    };
}

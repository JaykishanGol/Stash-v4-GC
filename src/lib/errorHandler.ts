/**
 * Centralized Error Handling Module
 * Provides robust error handling, recovery, and notification integration
 */

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

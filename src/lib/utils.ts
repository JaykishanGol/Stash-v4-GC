import { clsx, type ClassValue } from 'clsx';

// Utility function for conditional class names
export function cn(...inputs: ClassValue[]): string {
    return clsx(inputs);
}

// Format file size to human readable
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format date for display
export function formatDate(date: string | Date): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

// Format time for display
export function formatTime(date: string | Date): string {
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

// Check if date is today
export function isToday(date: string | Date): boolean {
    const d = new Date(date);
    const today = new Date();
    return (
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()
    );
}

// Check if date is overdue
export function isOverdue(date: string | Date): boolean {
    const d = new Date(date);
    const now = new Date();
    return d < now && !isToday(date);
}

// Extract domain from URL
export function extractDomain(url: string): string {
    try {
        const domain = new URL(url).hostname;
        return domain.replace('www.', '');
    } catch {
        return url;
    }
}

// Check if string is valid URL
export function isValidUrl(string: string): boolean {
    try {
        new URL(string);
        return true;
    } catch {
        return false;
    }
}

// Generate unique ID
export function generateId(): string {
    return crypto.randomUUID();
}

// Truncate text with ellipsis
export function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
}

// Get file extension
export function getFileExtension(filename: string): string {
    return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2).toLowerCase();
}

// Check if file is image
export function isImageFile(mime: string): boolean {
    return mime.startsWith('image/');
}

// Get month name
export function getMonthName(month: number): string {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month];
}

// Get short month name
export function getShortMonthName(month: number): string {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return months[month];
}

// ============ ROBUST UTILITIES ============

/**
 * Safely parse a date string, returning null if invalid
 */
export function safeParseDate(dateString: string | null | undefined): Date | null {
    if (!dateString) return null;

    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return null;
        return date;
    } catch {
        return null;
    }
}

/**
 * Safely parse a date with a fallback value
 */
export function safeParseDateWithFallback(
    dateString: string | null | undefined,
    fallback: Date
): Date {
    const parsed = safeParseDate(dateString);
    return parsed ?? fallback;
}

import DOMPurify from 'dompurify';

/**
 * Sanitize a string for safe display/storage
 * Removes potentially dangerous characters and strips XSS vectors
 */
export function sanitizeString(input: string, options?: {
    maxLength?: number;
    allowHtml?: boolean;
}): string {
    if (!input || typeof input !== 'string') return '';

    let result = input.trim();

    // If HTML is allowed, use DOMPurify to sanitize it
    if (options?.allowHtml) {
        result = DOMPurify.sanitize(result, {
            USE_PROFILES: { html: true }, // Only allow safe HTML
            ADD_ATTR: ['target'], // Allow target="_blank" for links
        });
    } else {
        // Strip HTML tags if not allowed
        result = result.replace(/<[^>]*>/g, '');
    }

    // Remove null bytes and control characters (except newlines/tabs)
    // eslint-disable-next-line no-control-regex
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Truncate if needed
    if (options?.maxLength && result.length > options.maxLength) {
        result = result.slice(0, options.maxLength);
    }

    return result;
}

/**
 * Deep merge two objects, with source overriding target
 * Handles nested objects but not arrays (arrays are replaced, not merged)
 */
export function deepMerge<T>(target: T, source: Partial<T>): T {
    if (typeof target !== 'object' || target === null || typeof source !== 'object' || source === null) {
        return (source as T) ?? target;
    }

    const result = { ...target } as any;

    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            const sourceValue = source[key];
            const targetValue = result[key];

            if (
                sourceValue !== null &&
                typeof sourceValue === 'object' &&
                !Array.isArray(sourceValue) &&
                targetValue !== null &&
                typeof targetValue === 'object' &&
                !Array.isArray(targetValue)
            ) {
                result[key] = deepMerge(targetValue, sourceValue);
            } else {
                result[key] = sourceValue;
            }
        }
    }

    return result as T;
}

/**
 * Clamp a number between min and max values
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Check if two arrays have the same elements (order-independent)
 */
export function arraysEqual<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, idx) => val === sortedB[idx]);
}

/**
 * Remove duplicates from an array
 */
export function uniqueArray<T>(arr: T[]): T[] {
    return [...new Set(arr)];
}

/**
 * Group an array by a key function
 */
export function groupBy<T, K extends string | number>(
    arr: T[],
    keyFn: (item: T) => K
): Record<K, T[]> {
    return arr.reduce((acc, item) => {
        const key = keyFn(item);
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(item);
        return acc;
    }, {} as Record<K, T[]>);
}

/**
 * Safely access nested object properties
 */
export function getNestedValue<T>(
    obj: Record<string, unknown>,
    path: string,
    defaultValue?: T
): T | undefined {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
        if (current === null || current === undefined) {
            return defaultValue;
        }
        current = (current as Record<string, unknown>)[key];
    }

    return (current as T) ?? defaultValue;
}

/**
 * Create a URL-safe slug from a string
 */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Format a number with thousand separators
 */
export function formatNumber(num: number): string {
    return num.toLocaleString('en-US');
}

/**
 * Check if a value is empty (null, undefined, empty string, empty array, empty object)
 */
export function isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

// Helper to convert HTML to plain text
export function htmlToPlainText(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
}

// Helper to check if content is just empty HTML
export function isEmptyContent(html: string): boolean {
    const text = htmlToPlainText(html);
    return !text.trim();
}

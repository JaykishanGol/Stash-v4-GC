/**
 * Shared Calendar Constants
 *
 * Single source of truth for Google Calendar color palette and other
 * calendar-related constants used across the app.
 */

/** Google Calendar color palette — maps color IDs to hex values */
export const GOOGLE_COLOR_MAP: Record<string, string> = {
    '1': '#7986cb', '2': '#33b679', '3': '#8e24aa',
    '4': '#e67c73', '5': '#f6c026', '6': '#f5511d',
    '7': '#039be5', '8': '#616161', '9': '#3f51b5',
    '10': '#0b8043', '11': '#d60000',
};

/** Named color categories — user-friendly names for each color */
export const GOOGLE_COLOR_NAMES: Record<string, string> = {
    '1': 'Lavender',
    '2': 'Sage',
    '3': 'Grape',
    '4': 'Flamingo',
    '5': 'Banana',
    '6': 'Tangerine',
    '7': 'Peacock',
    '8': 'Graphite',
    '9': 'Blueberry',
    '10': 'Basil',
    '11': 'Tomato',
};

/** Google Calendar colors as an array (for color pickers) */
export const GOOGLE_COLORS = Object.entries(GOOGLE_COLOR_MAP).map(([id, color]) => ({
    id,
    color,
    name: GOOGLE_COLOR_NAMES[id] || `Color ${id}`,
}));

/** Get the hex color for a Google color ID, defaulting to Peacock blue */
export function getEventColor(colorId: string): string {
    return GOOGLE_COLOR_MAP[colorId] || '#039be5';
}

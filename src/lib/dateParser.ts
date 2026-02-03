
/**
 * Simple Natural Language Date Parser
 * Parses strings like:
 * - "tomorrow", "tmrw", "tom"
 * - "today"
 * - "next week", "next monday"
 * - "in 5 mins", "in 2 hours"
 * - "friday", "fri"
 * - "at 5pm", "at 17:00"
 * - "Jan 25", "25th"
 */

export interface ParsedDate {
    date: Date;
    isValid: boolean;
    originalString: string;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SHORT_WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function parseNaturalLanguageDate(input: string): ParsedDate | null {
    if (!input || !input.trim()) return null;

    const lower = input.toLowerCase().trim();
    const now = new Date();
    let target = new Date(now);
    let hasTime = false;
    let hasDate = false;

    // 1. Relative Time (in X mins/hours/days)
    const relativeRegex = /in\s+(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours|d|day|days)/i;
    const relativeMatch = lower.match(relativeRegex);
    if (relativeMatch) {
        const val = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2];
        
        if (unit.startsWith('m')) target.setMinutes(target.getMinutes() + val);
        else if (unit.startsWith('h')) target.setHours(target.getHours() + val);
        else if (unit.startsWith('d')) target.setDate(target.getDate() + val);
        
        return { date: target, isValid: true, originalString: input };
    }

    // 2. Specific Keywords
    if (lower.includes('today') || lower.includes('tonight')) {
        // Keep today, handle time later
        hasDate = true;
    } else if (lower.includes('tomorrow') || lower.includes('tmrw') || lower.includes('tom')) {
        target.setDate(target.getDate() + 1);
        hasDate = true;
    } else if (lower.includes('next week')) {
        target.setDate(target.getDate() + 7);
        hasDate = true;
    } 

    // 3. Weekdays (friday, next friday)
    // Find if a weekday is mentioned
    let mentionedDayIdx = -1;
    for (let i = 0; i < 7; i++) {
        if (lower.includes(WEEKDAYS[i]) || lower.includes(SHORT_WEEKDAYS[i])) {
            mentionedDayIdx = i;
            break;
        }
    }

    if (mentionedDayIdx !== -1) {
        const currentDay = now.getDay();
        let daysToAdd = mentionedDayIdx - currentDay;
        
        if (daysToAdd <= 0) daysToAdd += 7; // Next occurrence
        
        if (lower.includes('next ' + WEEKDAYS[mentionedDayIdx]) || lower.includes('next ' + SHORT_WEEKDAYS[mentionedDayIdx])) {
            daysToAdd += 7;
        }
        
        target.setDate(target.getDate() + daysToAdd);
        hasDate = true;
    }

    // 4. Time Parsing (at 5pm, 5:30pm, 17:00)
    // Regex for time: 
    // (\d{1,2})(:(\d{2}))?\s*(am|pm)?
    // Look for "at ..." or just the time pattern if it's distinct
    const timeRegex = /(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
    const timeMatch = lower.match(timeRegex);

    if (timeMatch) {
        // We need to be careful not to match "2024" as a time. 
        // Usually time comes with 'at' or 'am/pm' or ':'
        // If it's just a number like "5", it's ambiguous without 'pm' or 'at'.
        
        const isExplicitTime = timeMatch[0].includes(':') || timeMatch[0].includes('am') || timeMatch[0].includes('pm') || timeMatch[0].includes('at');
        
        if (isExplicitTime) {
            let hours = parseInt(timeMatch[1]);
            const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
            const meridiem = timeMatch[3];

            if (meridiem === 'pm' && hours < 12) hours += 12;
            if (meridiem === 'am' && hours === 12) hours = 0;

            target.setHours(hours, minutes, 0, 0);
            hasTime = true;
        }
    }

    // Defaults
    if (hasDate && !hasTime) {
        // Default to 9am for future dates
        target.setHours(9, 0, 0, 0);
    } else if (!hasDate && hasTime) {
        // If time is in past, assume tomorrow?
        if (target < now) {
            target.setDate(target.getDate() + 1);
        }
    } else if (!hasDate && !hasTime) {
        // Failed to parse anything meaningful
        return null;
    }

    return { date: target, isValid: true, originalString: input };
}

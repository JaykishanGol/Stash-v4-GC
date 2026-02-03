import type { RecurringConfig } from './types';

/**
 * Calculates the next trigger date based on recurrence rules.
 * 
 * @param config The Recurring Config
 * @param lastTriggeredOrCreated The date to calculate FROM.
 *        - For a new schedule: Pass current time (`new Date().toISOString()`)
 *        - For an existing schedule: Pass `last_acknowledged_at`
 * @returns Date object for the next trigger, or null if ends
 */
export function calculateNextOccurrence(
    config: RecurringConfig,
    lastTriggeredOrCreated: string | Date
): Date | null {
    if (!config || !config.frequency) return null;

    // Normalize base date
    let baseDate = new Date(lastTriggeredOrCreated);
    // If invalid date, fallback to now
    if (isNaN(baseDate.getTime())) baseDate = new Date();

    // Parse the target time (e.g. "14:30")
    // Default to current time if missing
    let targetHour = baseDate.getHours();
    let targetMinute = baseDate.getMinutes();

    if (config.time) {
        const parts = config.time.split(':');
        if (parts.length >= 2) {
            targetHour = parseInt(parts[0], 10);
            targetMinute = parseInt(parts[1], 10);
        }
    }

    const potentialDate = new Date(baseDate);
    // Always start by setting the target time on the base date to ensure fair comparison
    potentialDate.setHours(targetHour, targetMinute, 0, 0);

    const interval = Math.max(1, config.interval || 1);

    switch (config.frequency) {
        case 'daily':
            // Add interval days
            // If the base date (with target time) is already in the future vs original base, we might strictly add days.
            // But standard logic: last trigger + interval.
            potentialDate.setDate(potentialDate.getDate() + interval);
            break;

        case 'weekly': {
            // If specific days are set (e.g., [1, 3] for Mon, Wed)
            if (config.byWeekDays && config.byWeekDays.length > 0) {
                // Sort days: 0 (Sun) to 6 (Sat)
                const sortedDays = [...config.byWeekDays].sort((a, b) => a - b);
                const currentDayOfWeek = potentialDate.getDay();

                // Find if there is a remaining day in the CURRENT week that is valid and in the FUTURE
                // Note: "In the future" relative to baseDate.
                // Since we reset potentialDate to baseDate time, simple comparison works.
                
                // Try to find a day in this week > currentDay
                const nextDayIndex = sortedDays.findIndex(d => d > currentDayOfWeek);
                
                if (nextDayIndex !== -1) {
                    // Found a day later this week
                    const nextDay = sortedDays[nextDayIndex];
                    const diff = nextDay - currentDayOfWeek;
                    potentialDate.setDate(potentialDate.getDate() + diff);
                } else {
                    // No days left this week. Must jump to next interval week.
                    // Start of "Next Interval" week = (Current Sunday) + (7 * interval)
                    const dayOffsetToSunday = -currentDayOfWeek; // e.g. Mon(1) -> -1
                    potentialDate.setDate(potentialDate.getDate() + dayOffsetToSunday + (7 * interval));
                    
                    // Now set to the FIRST valid day of that week
                    const firstDayOfWeek = sortedDays[0];
                    potentialDate.setDate(potentialDate.getDate() + firstDayOfWeek);
                }
            } else {
                // Simple weekly (same day, just + N weeks)
                potentialDate.setDate(potentialDate.getDate() + (interval * 7));
            }
            break;
        }

        case 'monthly': {
            // Add months
            // Logic to handle "Month overflow" (e.g. Jan 31 + 1 month = Feb 28/29)
            // Javascript's setMonth handles overflow by pushing to next month (March 2/3), which is usually NOT desired for "Monthly" recurrence.
            // We usually want "Last day of month" if overflow.
            
            const desiredDay = config.byMonthDay || potentialDate.getDate();
            
            // First, add the months
            potentialDate.setMonth(potentialDate.getMonth() + interval);
            
            // Now check if the day matches. 
            // If we wanted the 31st, but setMonth gave us March 2nd (because Feb only has 28 days), rollback.
            if (potentialDate.getDate() !== desiredDay) {
                // We overflowed. Set to last day of previous month (which is the target month).
                potentialDate.setDate(0); 
            } else {
                // We didn't overflow, but we might want to enforce specific day
                potentialDate.setDate(desiredDay);
            }
            
            // Double check overflow again after setting date (edge case Feb 30 -> Feb 28)
             const checkMonth = new Date(potentialDate);
             checkMonth.setDate(1); // normalized
             // (Logic is complex here, simplified: relying on JS Date auto-correction usually "works" enough for MVP, 
             // but strictly: if byMonthDay=31, and next month is Feb, JS gives Mar 3. We want Feb 28.)
             // The above `setDate(0)` trick handles the "Last day" fallback.
            break;
        }

        case 'yearly':
            potentialDate.setFullYear(potentialDate.getFullYear() + interval);
            break;
    }

    // Safety: If for some reason the calculated date is <= baseDate (e.g. only time changed in past),
    // and we are creating a NEW one, we might need to bump. 
    // But since we strictly added Interval > 0, it should always be future.
    // Exception: Daily, interval 1. 10am -> 10am + 1 day. Always future.
    
    // Validate End Date
    if (config.endType === 'date' && config.endDate) {
        const endDate = new Date(config.endDate);
        // Set end date to end of day to be inclusive
        endDate.setHours(23, 59, 59, 999);
        
        if (potentialDate > endDate) {
            return null; // Finished
        }
    }

    return potentialDate;
}
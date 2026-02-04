import { describe, it, expect } from 'vitest';
import { calculateNextOccurrence } from './schedulerEngine';
import type { RecurringConfig } from './types';

describe('calculateNextOccurrence', () => {
    describe('Daily Recurrence', () => {
        it('should calculate next day for daily interval 1', () => {
            const config: RecurringConfig = {
                frequency: 'daily',
                interval: 1,
                time: '09:00',
                endType: 'never',
            };
            const baseDate = new Date('2024-01-15T09:00:00');
            const result = calculateNextOccurrence(config, baseDate);

            expect(result).not.toBeNull();
            expect(result?.getDate()).toBe(16);
            expect(result?.getHours()).toBe(9);
            expect(result?.getMinutes()).toBe(0);
        });

        it('should skip 3 days for interval 3', () => {
            const config: RecurringConfig = {
                frequency: 'daily',
                interval: 3,
                time: '14:30',
                endType: 'never',
            };
            const baseDate = new Date('2024-01-10T14:30:00');
            const result = calculateNextOccurrence(config, baseDate);

            expect(result).not.toBeNull();
            expect(result?.getDate()).toBe(13);
            expect(result?.getHours()).toBe(14);
            expect(result?.getMinutes()).toBe(30);
        });
    });

    describe('Weekly Recurrence', () => {
        it('should calculate next week for simple weekly', () => {
            const config: RecurringConfig = {
                frequency: 'weekly',
                interval: 1,
                time: '10:00',
                endType: 'never',
            };
            const baseDate = new Date('2024-01-15T10:00:00'); // Monday
            const result = calculateNextOccurrence(config, baseDate);

            expect(result).not.toBeNull();
            expect(result?.getDate()).toBe(22); // Next Monday
        });

        it('should find next weekday in same week', () => {
            const config: RecurringConfig = {
                frequency: 'weekly',
                interval: 1,
                time: '10:00',
                byWeekDays: [1, 3, 5], // Mon, Wed, Fri
                endType: 'never',
            };
            const baseDate = new Date('2024-01-15T10:00:00'); // Monday (day 1)
            const result = calculateNextOccurrence(config, baseDate);

            expect(result).not.toBeNull();
            // Should be Wednesday (day 3) = Jan 17
            expect(result?.getDate()).toBe(17);
        });

        it('should jump to next week if no days left this week', () => {
            const config: RecurringConfig = {
                frequency: 'weekly',
                interval: 1,
                time: '10:00',
                byWeekDays: [1, 3], // Mon, Wed only
                endType: 'never',
            };
            const baseDate = new Date('2024-01-17T10:00:00'); // Wednesday
            const result = calculateNextOccurrence(config, baseDate);

            expect(result).not.toBeNull();
            // Should jump to next Monday = Jan 22
            expect(result?.getDate()).toBe(22);
        });
    });

    describe('Monthly Recurrence', () => {
        it('should add one month', () => {
            const config: RecurringConfig = {
                frequency: 'monthly',
                interval: 1,
                time: '12:00',
                byMonthDay: 15,
                endType: 'never',
            };
            const baseDate = new Date('2024-01-15T12:00:00');
            const result = calculateNextOccurrence(config, baseDate);

            expect(result).not.toBeNull();
            expect(result?.getMonth()).toBe(1); // February
            expect(result?.getDate()).toBe(15);
        });

        it('should handle month overflow (Jan 31 + 1 month)', () => {
            const config: RecurringConfig = {
                frequency: 'monthly',
                interval: 1,
                time: '12:00',
                byMonthDay: 31,
                endType: 'never',
            };
            const baseDate = new Date('2024-01-31T12:00:00');
            const result = calculateNextOccurrence(config, baseDate);

            expect(result).not.toBeNull();
            // Feb doesn't have 31 days, should fallback to last day (29 in 2024)
            expect(result?.getMonth()).toBe(1); // February
            expect(result?.getDate()).toBeLessThanOrEqual(29);
        });
    });

    describe('Yearly Recurrence', () => {
        it('should add one year', () => {
            const config: RecurringConfig = {
                frequency: 'yearly',
                interval: 1,
                time: '00:00',
                endType: 'never',
            };
            const baseDate = new Date('2024-06-15T00:00:00');
            const result = calculateNextOccurrence(config, baseDate);

            expect(result).not.toBeNull();
            expect(result?.getFullYear()).toBe(2025);
            expect(result?.getMonth()).toBe(5); // June
            expect(result?.getDate()).toBe(15);
        });
    });

    describe('End Conditions', () => {
        it('should return null when past end date', () => {
            const config: RecurringConfig = {
                frequency: 'daily',
                interval: 1,
                time: '09:00',
                endType: 'date',
                endDate: '2024-01-15T23:59:59',
            };
            const baseDate = new Date('2024-01-15T09:00:00');
            const result = calculateNextOccurrence(config, baseDate);

            // Next occurrence would be Jan 16, but end date is Jan 15
            expect(result).toBeNull();
        });

        it('should return value when before end date', () => {
            const config: RecurringConfig = {
                frequency: 'daily',
                interval: 1,
                time: '09:00',
                endType: 'date',
                endDate: '2024-01-20T23:59:59',
            };
            const baseDate = new Date('2024-01-15T09:00:00');
            const result = calculateNextOccurrence(config, baseDate);

            expect(result).not.toBeNull();
            expect(result?.getDate()).toBe(16);
        });
    });

    describe('Edge Cases', () => {
        it('should handle invalid config gracefully', () => {
            const result = calculateNextOccurrence(null as any, new Date());
            expect(result).toBeNull();
        });

        it('should handle invalid base date', () => {
            const config: RecurringConfig = {
                frequency: 'daily',
                interval: 1,
                time: '09:00',
                endType: 'never',
            };
            const result = calculateNextOccurrence(config, 'invalid-date');

            // Should fallback to now and still calculate
            expect(result).not.toBeNull();
        });

        it('should default interval to 1 if missing', () => {
            const config: RecurringConfig = {
                frequency: 'daily',
                interval: 0, // Invalid, should default to 1
                time: '09:00',
                endType: 'never',
            };
            const baseDate = new Date('2024-01-15T09:00:00');
            const result = calculateNextOccurrence(config, baseDate);

            expect(result).not.toBeNull();
            expect(result?.getDate()).toBe(16); // 1 day later
        });
    });
});

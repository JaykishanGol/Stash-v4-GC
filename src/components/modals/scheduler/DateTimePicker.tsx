import { Clock } from 'lucide-react';

interface DateTimePickerProps {
    startDate: string;
    setStartDate: (v: string) => void;
    startTime: string;
    setStartTime: (v: string) => void;
    endDate: string;
    setEndDate: (v: string) => void;
    endTime: string;
    setEndTime: (v: string) => void;
    isAllDay: boolean;
    setIsAllDay: (v: boolean) => void;
    recurrence: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays' | 'custom';
    setRecurrence: (v: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays' | 'custom') => void;
    onOpenCustomRecurrence: () => void;
    customRecurrenceLabel: string;
}

export function DateTimePicker({
    startDate, setStartDate,
    startTime, setStartTime,
    endDate, setEndDate,
    endTime, setEndTime,
    isAllDay, setIsAllDay,
    recurrence, setRecurrence,
    onOpenCustomRecurrence,
    customRecurrenceLabel
}: DateTimePickerProps) {

    const getWeekdayLabel = () => {
        if (!startDate) return 'Weekly';
        return `Weekly on ${new Date(startDate).toLocaleDateString('en', { weekday: 'long' })}`;
    };

    const getMonthlyLabel = () => {
        if (!startDate) return 'Monthly';
        const d = new Date(startDate);
        const weekNum = Math.ceil(d.getDate() / 7);
        const ordinal = ['first', 'second', 'third', 'fourth', 'last'][weekNum - 1] || 'first';
        return `Monthly on the ${ordinal} ${d.toLocaleDateString('en', { weekday: 'long' })}`;
    };

    const getYearlyLabel = () => {
        if (!startDate) return 'Yearly';
        return `Annually on ${new Date(startDate).toLocaleDateString('en', { month: 'long', day: 'numeric' })}`;
    };

    return (
        <>
            <div className="grid-icon"><Clock size={20} /></div>
            <div className="grid-content">
                <div className="time-pills">
                    <div className="pill-group">
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="date-input"
                        />
                        {!isAllDay && (
                            <input
                                type="time"
                                value={startTime}
                                onChange={e => setStartTime(e.target.value)}
                                className="time-input"
                            />
                        )}
                    </div>
                    {!isAllDay && <span className="separator">–</span>}
                    {!isAllDay && (
                        <div className="pill-group">
                            <input
                                type="time"
                                value={endTime}
                                onChange={e => setEndTime(e.target.value)}
                                className="time-input"
                            />
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                className="date-input"
                            />
                        </div>
                    )}
                </div>

                <div className="time-meta">
                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={isAllDay}
                            onChange={e => setIsAllDay(e.target.checked)}
                        />
                        All day
                    </label>
                    <select
                        className="recurrence-select"
                        value={recurrence}
                        onChange={e => {
                            const val = e.target.value as typeof recurrence;
                            if (val === 'custom') {
                                onOpenCustomRecurrence();
                            } else {
                                setRecurrence(val);
                            }
                        }}
                    >
                        <option value="none">Does not repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">{getWeekdayLabel()}</option>
                        <option value="monthly">{getMonthlyLabel()}</option>
                        <option value="yearly">{getYearlyLabel()}</option>
                        <option value="weekdays">Every weekday (Monday to Friday)</option>
                        <option value="custom">{customRecurrenceLabel}</option>
                    </select>
                </div>
            </div>
        </>
    );
}

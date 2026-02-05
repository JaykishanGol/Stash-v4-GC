import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { RecurringConfig } from '../../lib/types';

interface CustomRecurrenceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (config: RecurringConfig, label: string) => void;
    initialConfig?: RecurringConfig;
    startDate: Date;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FREQ_OPTIONS: { value: 'daily' | 'weekly' | 'monthly' | 'yearly'; label: string }[] = [
    { value: 'daily', label: 'day' },
    { value: 'weekly', label: 'week' },
    { value: 'monthly', label: 'month' },
    { value: 'yearly', label: 'year' }
];

/**
 * Custom recurrence modal matching Google Calendar's UI.
 * Features: interval, weekday picker, end conditions.
 */
export function CustomRecurrenceModal({
    isOpen,
    onClose,
    onSave,
    initialConfig,
    startDate
}: CustomRecurrenceModalProps) {
    const [interval, setInterval] = useState(1);
    const [freq, setFreq] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('weekly');
    const [selectedDays, setSelectedDays] = useState<number[]>([startDate.getDay()]);
    const [endType, setEndType] = useState<'never' | 'date' | 'count'>('never');
    const [endDate, setEndDate] = useState('');
    const [occurrences, setOccurrences] = useState(13);

    // Initialize from existing config
    useEffect(() => {
        if (initialConfig) {
            setInterval(initialConfig.interval || 1);
            setFreq(initialConfig.frequency);
            if (initialConfig.byWeekDays) {
                setSelectedDays(initialConfig.byWeekDays);
            }
            if (initialConfig.endType === 'date' && initialConfig.endDate) {
                setEndType('date');
                setEndDate(initialConfig.endDate.split('T')[0]);
            } else if (initialConfig.endType === 'count' && initialConfig.endCount) {
                setEndType('count');
                setOccurrences(initialConfig.endCount);
            }
        } else {
            // Default to day of week from startDate
            setSelectedDays([startDate.getDay()]);
        }
    }, [initialConfig, startDate]);

    const toggleDay = (day: number) => {
        setSelectedDays(prev => {
            if (prev.includes(day)) {
                // Don't allow removing all days
                if (prev.length === 1) return prev;
                return prev.filter(d => d !== day);
            }
            return [...prev, day].sort((a, b) => a - b);
        });
    };

    const generateLabel = (): string => {
        const freqLabel = FREQ_OPTIONS.find(f => f.value === freq)?.label || 'day';
        const freqLabelPlural = interval === 1 ? freqLabel : `${interval} ${freqLabel}s`;

        if (freq === 'weekly' && selectedDays.length > 0) {
            const dayNames = selectedDays.map(d => WEEKDAY_NAMES[d]);
            if (dayNames.length === 1) {
                return `Weekly on ${dayNames[0]}`;
            } else if (dayNames.length === 7) {
                return 'Every day';
            } else if (selectedDays.join(',') === '1,2,3,4,5') {
                return 'Every weekday (Monday to Friday)';
            } else {
                return `Weekly on ${dayNames.slice(0, -1).join(', ')} and ${dayNames.slice(-1)}`;
            }
        }

        if (freq === 'monthly') {
            const day = startDate.getDate();
            const weekNum = Math.ceil(day / 7);
            const weekOrdinal = ['first', 'second', 'third', 'fourth', 'last'][weekNum - 1] || 'first';
            return `Monthly on the ${weekOrdinal} ${WEEKDAY_NAMES[startDate.getDay()]}`;
        }

        if (freq === 'yearly') {
            const monthName = startDate.toLocaleDateString('en', { month: 'long', day: 'numeric' });
            return `Annually on ${monthName}`;
        }

        if (interval === 1) {
            return freq.charAt(0).toUpperCase() + freq.slice(1);
        }

        return `Every ${freqLabelPlural}`;
    };

    const handleSave = () => {
        const config: RecurringConfig = {
            frequency: freq,
            interval,
            time: '09:00', // Default time
            byWeekDays: freq === 'weekly' ? selectedDays as any : undefined,
            endType: endType,
            endDate: endType === 'date' ? new Date(endDate).toISOString() : undefined,
            endCount: endType === 'count' ? occurrences : undefined
        };

        onSave(config, generateLabel());
    };

    if (!isOpen) return null;

    return (
        <div className="recurrence-modal-overlay" onClick={onClose}>
            <div className="recurrence-modal" onClick={e => e.stopPropagation()}>
                <div className="recurrence-header">
                    <h3>Custom recurrence</h3>
                    <button className="close-btn" onClick={onClose} aria-label="Close">
                        <X size={20} />
                    </button>
                </div>

                <div className="recurrence-body">
                    {/* REPEAT EVERY */}
                    <div className="recurrence-row">
                        <span className="row-label">Repeat every</span>
                        <div className="row-inputs">
                            <input
                                type="number"
                                min="1"
                                max="99"
                                value={interval}
                                onChange={e => setInterval(Math.max(1, parseInt(e.target.value) || 1))}
                                className="interval-input"
                            />
                            <select
                                value={freq}
                                onChange={e => setFreq(e.target.value as any)}
                                className="freq-select"
                            >
                                {FREQ_OPTIONS.map(f => (
                                    <option key={f.value} value={f.value}>
                                        {interval === 1 ? f.label : f.label + 's'}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* WEEKDAY PICKER (only for weekly) */}
                    {freq === 'weekly' && (
                        <div className="recurrence-row">
                            <span className="row-label">Repeat on</span>
                            <div className="weekday-pills">
                                {WEEKDAYS.map((day, i) => (
                                    <button
                                        key={i}
                                        className={`day-pill ${selectedDays.includes(i) ? 'active' : ''}`}
                                        onClick={() => toggleDay(i)}
                                    >
                                        {day}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* END CONDITIONS */}
                    <div className="recurrence-row end-section">
                        <span className="row-label">Ends</span>
                        <div className="end-options">
                            <label className="radio-row">
                                <input
                                    type="radio"
                                    checked={endType === 'never'}
                                    onChange={() => setEndType('never')}
                                />
                                <span>Never</span>
                            </label>
                            <label className="radio-row">
                                <input
                                    type="radio"
                                    checked={endType === 'date'}
                                    onChange={() => setEndType('date')}
                                />
                                <span>On</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={e => setEndDate(e.target.value)}
                                    disabled={endType !== 'date'}
                                    className="end-date-input"
                                    min={startDate.toISOString().split('T')[0]}
                                />
                            </label>
                            <label className="radio-row">
                                <input
                                    type="radio"
                                    checked={endType === 'count'}
                                    onChange={() => setEndType('count')}
                                />
                                <span>After</span>
                                <input
                                    type="number"
                                    min="1"
                                    max="999"
                                    value={occurrences}
                                    onChange={e => setOccurrences(parseInt(e.target.value) || 1)}
                                    disabled={endType !== 'count'}
                                    className="occurrences-input"
                                />
                                <span className="occ-label">occurrences</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="recurrence-footer">
                    <button className="cancel-btn" onClick={onClose}>Cancel</button>
                    <button className="done-btn" onClick={handleSave}>Done</button>
                </div>

                <style>{`
                    .recurrence-modal-overlay {
                        position: fixed;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.4);
                        z-index: 10001;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .recurrence-modal {
                        background: white;
                        border-radius: 12px;
                        width: 340px;
                        max-width: 90vw;
                        box-shadow: 0 24px 48px rgba(0,0,0,0.2);
                    }
                    .recurrence-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 16px 20px;
                        border-bottom: 1px solid #E0E0E0;
                    }
                    .recurrence-header h3 {
                        margin: 0;
                        font-size: 18px;
                        font-weight: 500;
                        color: #202124;
                    }
                    .close-btn {
                        background: none;
                        border: none;
                        cursor: pointer;
                        color: #5F6368;
                        padding: 4px;
                        border-radius: 50%;
                    }
                    .close-btn:hover {
                        background: #F1F3F4;
                    }
                    .recurrence-body {
                        padding: 20px;
                    }
                    .recurrence-row {
                        margin-bottom: 20px;
                    }
                    .row-label {
                        display: block;
                        font-size: 14px;
                        color: #5F6368;
                        margin-bottom: 8px;
                    }
                    .row-inputs {
                        display: flex;
                        gap: 8px;
                    }
                    .interval-input {
                        width: 60px;
                        padding: 8px 12px;
                        border: 1px solid #DADCE0;
                        border-radius: 6px;
                        font-size: 14px;
                        text-align: center;
                    }
                    .freq-select {
                        flex: 1;
                        padding: 8px 12px;
                        border: 1px solid #DADCE0;
                        border-radius: 6px;
                        font-size: 14px;
                        background: white;
                    }
                    .weekday-pills {
                        display: flex;
                        gap: 6px;
                    }
                    .day-pill {
                        width: 36px;
                        height: 36px;
                        border-radius: 50%;
                        border: 1px solid #DADCE0;
                        background: white;
                        font-size: 13px;
                        font-weight: 500;
                        color: #5F6368;
                        cursor: pointer;
                        transition: all 0.15s;
                    }
                    .day-pill:hover {
                        background: #F1F3F4;
                    }
                    .day-pill.active {
                        background: #1A73E8;
                        border-color: #1A73E8;
                        color: white;
                    }
                    .end-section {
                        margin-bottom: 0;
                    }
                    .end-options {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }
                    .radio-row {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        font-size: 14px;
                        color: #202124;
                        cursor: pointer;
                    }
                    .radio-row input[type="radio"] {
                        accent-color: #1A73E8;
                    }
                    .end-date-input, .occurrences-input {
                        padding: 6px 10px;
                        border: 1px solid #DADCE0;
                        border-radius: 4px;
                        font-size: 14px;
                    }
                    .end-date-input:disabled, .occurrences-input:disabled {
                        opacity: 0.5;
                    }
                    .occurrences-input {
                        width: 60px;
                        text-align: center;
                    }
                    .occ-label {
                        color: #5F6368;
                    }
                    .recurrence-footer {
                        display: flex;
                        justify-content: flex-end;
                        gap: 8px;
                        padding: 16px 20px;
                        border-top: 1px solid #E0E0E0;
                    }
                    .cancel-btn {
                        padding: 8px 20px;
                        background: none;
                        border: none;
                        color: #1A73E8;
                        font-size: 14px;
                        font-weight: 500;
                        cursor: pointer;
                        border-radius: 6px;
                    }
                    .cancel-btn:hover {
                        background: #F1F3F4;
                    }
                    .done-btn {
                        padding: 8px 20px;
                        background: #1A73E8;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        font-size: 14px;
                        font-weight: 500;
                        cursor: pointer;
                    }
                    .done-btn:hover {
                        background: #1557B0;
                    }
                `}</style>
            </div>
        </div>
    );
}

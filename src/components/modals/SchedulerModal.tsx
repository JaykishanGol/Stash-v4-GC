import { useState, useEffect } from 'react';
import { X, Clock, Users, Video, MapPin, CheckSquare, Calendar as CalIcon, AlignLeft, Bell, Eye, Globe } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { GoogleSyncService } from '../../lib/googleSyncService';
import { GoogleClient, type GoogleTaskList, type GoogleCalendarListEntry } from '../../lib/googleClient';
import type { RecurringConfig, Item, Task } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { CustomRecurrenceModal } from './CustomRecurrenceModal';
import { GoogleConnectBanner } from '../ui/GoogleConnectBanner';

// Google Colors
const GOOGLE_COLORS = [
    { id: '1', color: '#7986cb' }, { id: '2', color: '#33b679' }, { id: '3', color: '#8e24aa' },
    { id: '4', color: '#e67c73' }, { id: '5', color: '#f6c026' }, { id: '6', color: '#f5511d' },
    { id: '7', color: '#039be5' }, { id: '8', color: '#616161' }, { id: '9', color: '#3f51b5' },
    { id: '10', color: '#0b8043' }, { id: '11', color: '#d60000' }
];

interface SchedulerContentProps {
    item: Partial<Item> | Partial<Task>;
    isTaskType: boolean;
    onClose: () => void;
    onSave: (updates: any) => Promise<void> | void;
}

export function SchedulerContent({ item, isTaskType, onClose, onSave }: SchedulerContentProps) {
    const [hasGoogleAuth, setHasGoogleAuth] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'event' | 'task'>(isTaskType ? 'task' : 'event');

    // Data
    const [taskLists, setTaskLists] = useState<GoogleTaskList[]>([]);
    const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);

    // Fields
    const [title, setTitle] = useState('');

    // Time
    const [startDate, setStartDate] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endDate, setEndDate] = useState('');
    const [endTime, setEndTime] = useState('10:00');
    const [isAllDay, setIsAllDay] = useState(false);

    // Recurrence
    const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays' | 'custom'>('none');
    const [showCustomRecurrence, setShowCustomRecurrence] = useState(false);
    const [recurringConfig, setRecurringConfig] = useState<RecurringConfig | null>(null);
    const [customRecurrenceLabel, setCustomRecurrenceLabel] = useState('Custom...');

    // Event Details
    const [attendees, setAttendees] = useState<string[]>([]);
    const [newGuest, setNewGuest] = useState('');
    const [addMeet, setAddMeet] = useState(false);
    const [location, setLocation] = useState('');
    const [description, setDescription] = useState('');
    const [calendarId, setCalendarId] = useState('primary');
    const [colorId, setColorId] = useState('7'); // Default Peacock Blue

    // Task Details
    const [taskListId, setTaskListId] = useState('@default');

    // New: Timezone, Visibility, Status, Notifications
    const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const [visibility, setVisibility] = useState<'default' | 'public' | 'private'>('default');
    const [showAs, setShowAs] = useState<'busy' | 'free'>('busy');
    const [notifications, setNotifications] = useState<{ method: 'popup' | 'email'; minutes: number }[]>([
        { method: 'popup', minutes: 10 }
    ]);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.provider_token) {
                setHasGoogleAuth(true);
                GoogleClient.listTaskLists().then(setTaskLists).catch(console.error);
                GoogleClient.listCalendars().then(setCalendars).catch(console.error);
            }
        });

        if (item) {
            setTitle(item.title || '');
            // Task has description, Item doesn't - safely access
            setDescription((item as any).description || '');

            const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1);
            const defDate = tmrw.toISOString().split('T')[0];

            if (item.next_trigger_at) {
                const d = new Date(item.next_trigger_at);
                setStartDate(d.toISOString().split('T')[0]);
                setStartTime(d.toTimeString().slice(0, 5));
                const end = new Date(d.getTime() + 3600000);
                setEndDate(end.toISOString().split('T')[0]);
                setEndTime(end.toTimeString().slice(0, 5));
            } else {
                setStartDate(defDate);
                setEndDate(defDate);
            }

            if (item.reminder_type === 'recurring') {
                setRecurrence(item.recurring_config?.frequency as any || 'daily');
            }
        }
    }, [item]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const updates: any = { title, description };

            // Recurrence Logic
            let recurConfig: RecurringConfig | null = null;
            if (recurrence === 'custom' && recurringConfig) {
                recurConfig = recurringConfig;
                updates.reminder_type = 'recurring';
                updates.recurring_config = recurConfig;
            } else if (recurrence !== 'none') {
                let freq = recurrence;
                let byWeekDays: (0 | 1 | 2 | 3 | 4 | 5 | 6)[] | undefined;

                if (recurrence === 'weekdays') {
                    freq = 'weekly';
                    byWeekDays = [1, 2, 3, 4, 5]; // Mon-Fri
                }

                recurConfig = {
                    frequency: freq === 'weekdays' ? 'weekly' : freq as any,
                    interval: 1,
                    time: isAllDay ? '09:00' : startTime,
                    byWeekDays,
                    endType: 'never'
                };
                updates.reminder_type = 'recurring';
                updates.recurring_config = recurConfig;
            } else {
                updates.reminder_type = activeTab === 'event' ? 'one_time' : 'none';
                updates.recurring_config = null;
            }

            if (activeTab === 'task') {
                updates.due_at = startDate ? new Date(startDate).toISOString() : null;
                if (recurConfig) updates.next_trigger_at = updates.due_at;

                await onSave(updates);

                if (updates.due_at) {
                    await GoogleSyncService.syncToGoogleTask({ ...item, ...updates }, {
                        listId: taskListId,
                        dueDate: updates.due_at,
                        notes: description
                    });
                }
            } else {
                // Event
                const startIso = `${startDate}T${startTime}`;
                updates.one_time_at = new Date(startIso).toISOString();
                updates.next_trigger_at = updates.one_time_at;

                await onSave(updates);

                let finalStart = isAllDay ? startDate : `${startDate}T${startTime}:00`;
                let finalEnd = isAllDay ? endDate : `${endDate}T${endTime}:00`;

                await GoogleSyncService.syncToGoogleEvent({ ...item, ...updates }, {
                    calendarId,
                    start: finalStart,
                    end: finalEnd,
                    isAllDay,
                    description,
                    location,
                    colorId,
                    attendees,
                    addMeet,
                    timezone,
                    visibility,
                    transparency: showAs === 'free' ? 'transparent' : 'opaque',
                    reminders: notifications.map(n => ({ method: n.method, minutes: n.minutes }))
                });
            }
            onClose();
        } catch (e) {
            console.error(e);
            alert('Save failed');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="google-modal-overlay" onClick={onClose}>
            <div className="google-card" onClick={e => e.stopPropagation()}>

                {/* HEADER */}
                <div className="card-header">
                    <div className="drag-handle" />
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>

                {/* GOOGLE CONNECT BANNER - Show when not connected */}
                {!hasGoogleAuth && (
                    <div style={{ padding: '16px 20px 0' }}>
                        <GoogleConnectBanner />
                    </div>
                )}

                <div className="card-body">
                    {/* TITLE */}
                    <div className="title-section">
                        <input
                            type="text"
                            className="title-input"
                            placeholder="Add title"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            autoFocus
                        />
                    </div>

                    {/* TABS */}
                    <div className="tabs-row">
                        <button
                            className={`tab-chip ${activeTab === 'event' ? 'active' : ''}`}
                            onClick={() => setActiveTab('event')}
                        >
                            Event
                        </button>
                        <button
                            className={`tab-chip ${activeTab === 'task' ? 'active' : ''}`}
                            onClick={() => setActiveTab('task')}
                        >
                            Task
                        </button>
                    </div>

                    {/* --- MAIN GRID --- */}
                    <div className="form-grid">

                        {/* 1. TIME ROW */}
                        <div className="grid-icon"><Clock size={20} /></div>
                        <div className="grid-content">
                            <div className="time-pills">
                                <div className="pill-group">
                                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="date-input" />
                                    {!isAllDay && <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="time-input" />}
                                </div>
                                {!isAllDay && <span className="separator">–</span>}
                                {!isAllDay && (
                                    <div className="pill-group">
                                        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="time-input" />
                                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="date-input" />
                                    </div>
                                )}
                            </div>

                            <div className="time-meta">
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={isAllDay} onChange={e => setIsAllDay(e.target.checked)} />
                                    All day
                                </label>
                                <select
                                    className="recurrence-select"
                                    value={recurrence}
                                    onChange={e => {
                                        const val = e.target.value as any;
                                        if (val === 'custom') {
                                            setShowCustomRecurrence(true);
                                        } else {
                                            setRecurrence(val);
                                        }
                                    }}
                                >
                                    <option value="none">Does not repeat</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">
                                        {startDate ? `Weekly on ${new Date(startDate).toLocaleDateString('en', { weekday: 'long' })}` : 'Weekly'}
                                    </option>
                                    <option value="monthly">
                                        {startDate ? (() => {
                                            const d = new Date(startDate);
                                            const weekNum = Math.ceil(d.getDate() / 7);
                                            const ordinal = ['first', 'second', 'third', 'fourth', 'last'][weekNum - 1] || 'first';
                                            return `Monthly on the ${ordinal} ${d.toLocaleDateString('en', { weekday: 'long' })}`;
                                        })() : 'Monthly'}
                                    </option>
                                    <option value="yearly">
                                        {startDate ? `Annually on ${new Date(startDate).toLocaleDateString('en', { month: 'long', day: 'numeric' })}` : 'Yearly'}
                                    </option>
                                    <option value="weekdays">Every weekday (Monday to Friday)</option>
                                    <option value="custom">{customRecurrenceLabel}</option>
                                </select>
                            </div>
                        </div>

                        {/* 2. GUESTS (Event Only) */}
                        {activeTab === 'event' && (
                            <>
                                <div className="grid-icon"><Users size={20} /></div>
                                <div className="grid-content">
                                    <input
                                        type="text"
                                        className="ghost-input"
                                        placeholder="Add guests"
                                        value={newGuest}
                                        onChange={e => setNewGuest(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && newGuest) {
                                                setAttendees([...attendees, newGuest]);
                                                setNewGuest('');
                                            }
                                        }}
                                    />
                                    {attendees.length > 0 && (
                                        <div className="chips-row">
                                            {attendees.map(a => <span key={a} className="chip">{a}</span>)}
                                        </div>
                                    )}
                                </div>

                                <div className="grid-icon"><Video size={20} /></div>
                                <div className="grid-content">
                                    {addMeet ? (
                                        <button className="meet-btn added" onClick={() => setAddMeet(false)}>
                                            <Video size={16} /> Join with Google Meet <X size={14} className="ml-2" />
                                        </button>
                                    ) : (
                                        <button className="meet-btn" onClick={() => setAddMeet(true)}>
                                            Add Google Meet video conferencing
                                        </button>
                                    )}
                                </div>

                                <div className="grid-icon"><MapPin size={20} /></div>
                                <div className="grid-content">
                                    <input
                                        type="text"
                                        className="ghost-input"
                                        placeholder="Add location"
                                        value={location}
                                        onChange={e => setLocation(e.target.value)}
                                    />
                                </div>
                            </>
                        )}

                        {/* 3. DESCRIPTION */}
                        <div className="grid-icon"><AlignLeft size={20} /></div>
                        <div className="grid-content">
                            <textarea
                                className="ghost-textarea"
                                placeholder={activeTab === 'task' ? "Add details" : "Add description"}
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                            />
                        </div>

                        {/* 4. CALENDAR / LIST */}
                        <div className="grid-icon">
                            {activeTab === 'event' ? <CalIcon size={20} /> : <CheckSquare size={20} />}
                        </div>
                        <div className="grid-content">
                            {activeTab === 'event' ? (
                                <div className="calendar-row">
                                    <div className="cal-selector">
                                        <span className="cal-name">
                                            {calendars.find(c => c.id === calendarId)?.summary || 'Primary'}
                                        </span>
                                        <select
                                            className="hidden-select"
                                            value={calendarId}
                                            onChange={e => setCalendarId(e.target.value)}
                                        >
                                            {calendars.map(c => <option key={c.id} value={c.id}>{c.summary}</option>)}
                                        </select>
                                    </div>
                                    <div className="color-dot-wrapper">
                                        <div
                                            className="color-dot"
                                            style={{ background: GOOGLE_COLORS.find(c => c.id === colorId)?.color }}
                                        />
                                        <select value={colorId} onChange={e => setColorId(e.target.value)} className="hidden-select">
                                            {GOOGLE_COLORS.map(c => <option key={c.id} value={c.id}>Color {c.id}</option>)}
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                <div className="cal-selector">
                                    <span className="cal-name">
                                        {taskLists.find(l => l.id === taskListId)?.title || 'My Tasks'}
                                    </span>
                                    <select
                                        className="hidden-select"
                                        value={taskListId}
                                        onChange={e => setTaskListId(e.target.value)}
                                    >
                                        {taskLists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* 5. NOTIFICATIONS (Event only) */}
                        {activeTab === 'event' && (
                            <>
                                <div className="grid-icon"><Bell size={20} /></div>
                                <div className="grid-content">
                                    <div className="notifications-section">
                                        {notifications.map((n, i) => (
                                            <div key={i} className="notification-row">
                                                <select
                                                    value={n.minutes}
                                                    onChange={e => {
                                                        const updated = [...notifications];
                                                        updated[i].minutes = parseInt(e.target.value);
                                                        setNotifications(updated);
                                                    }}
                                                    className="ghost-select"
                                                >
                                                    <option value="5">5 minutes before</option>
                                                    <option value="10">10 minutes before</option>
                                                    <option value="15">15 minutes before</option>
                                                    <option value="30">30 minutes before</option>
                                                    <option value="60">1 hour before</option>
                                                    <option value="1440">1 day before</option>
                                                    <option value="10080">1 week before</option>
                                                </select>
                                                <button
                                                    className="remove-notif-btn"
                                                    onClick={() => setNotifications(notifications.filter((_, j) => j !== i))}
                                                >×</button>
                                            </div>
                                        ))}
                                        <button
                                            className="add-notif-btn"
                                            onClick={() => setNotifications([...notifications, { method: 'popup', minutes: 30 }])}
                                        >
                                            Add notification
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* 6. TIMEZONE (Event only) */}
                        {activeTab === 'event' && (
                            <>
                                <div className="grid-icon"><Globe size={20} /></div>
                                <div className="grid-content">
                                    <select
                                        value={timezone}
                                        onChange={e => setTimezone(e.target.value)}
                                        className="ghost-select full-width"
                                    >
                                        {['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney', 'UTC'].map(tz => (
                                            <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
                                        ))}
                                        <option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>
                                            {Intl.DateTimeFormat().resolvedOptions().timeZone} (Local)
                                        </option>
                                    </select>
                                </div>
                            </>
                        )}

                        {/* 7. VISIBILITY & BUSY STATUS (Event only) */}
                        {activeTab === 'event' && (
                            <>
                                <div className="grid-icon"><Eye size={20} /></div>
                                <div className="grid-content visibility-row">
                                    <div className="vis-item">
                                        <span className="vis-label">Visibility</span>
                                        <select
                                            value={visibility}
                                            onChange={e => setVisibility(e.target.value as any)}
                                            className="ghost-select"
                                        >
                                            <option value="default">Default</option>
                                            <option value="public">Public</option>
                                            <option value="private">Private</option>
                                        </select>
                                    </div>
                                    <div className="vis-item">
                                        <span className="vis-label">Show as</span>
                                        <select
                                            value={showAs}
                                            onChange={e => setShowAs(e.target.value as any)}
                                            className="ghost-select"
                                        >
                                            <option value="busy">Busy</option>
                                            <option value="free">Free</option>
                                        </select>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* FOOTER */}
                <div className="card-footer">
                    <button className="text-btn">More options</button>
                    <button className="save-btn" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Saving' : 'Save'}
                    </button>
                </div>

            </div>

            {/* CUSTOM RECURRENCE MODAL */}
            <CustomRecurrenceModal
                isOpen={showCustomRecurrence}
                onClose={() => setShowCustomRecurrence(false)}
                onSave={(config, label) => {
                    setRecurringConfig(config);
                    setRecurrence('custom');
                    setCustomRecurrenceLabel(label);
                    setShowCustomRecurrence(false);
                }}
                initialConfig={recurringConfig || undefined}
                startDate={startDate ? new Date(startDate) : new Date()}
            />

            <style>{`
                .google-modal-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.4); z-index: 9999;
                    display: flex; align-items: center; justify-content: center;
                }
                .google-card {
                    width: 448px; max-width: 95vw;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 24px 38px 3px rgba(0,0,0,0.14);
                    overflow: hidden;
                    font-family: 'Roboto', sans-serif;
                    animation: scaleIn 0.15s ease-out;
                }
                @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }

                .card-header {
                    padding: 8px 12px; display: flex; justify-content: flex-end;
                    background: #F1F3F4;
                }
                .drag-handle {
                    flex: 1; height: 20px; cursor: move;
                    background: #E0E0E0; border-radius: 4px; margin: 6px 12px 6px 0;
                    opacity: 0; /* Hidden for now */
                }
                .close-btn {
                    border: none; background: transparent; cursor: pointer;
                    color: #5F6368; padding: 8px; border-radius: 50%;
                }
                .close-btn:hover { background: rgba(0,0,0,0.05); }

                .card-body { padding: 0 24px 16px; }

                .title-section { margin-bottom: 12px; margin-left: 48px; /* Indent to match fields */ }
                .title-input {
                    width: 100%; border: none; border-bottom: 1px solid #E0E0E0;
                    font-size: 22px; padding: 8px 0; outline: none;
                    color: #3C4043;
                }
                .title-input:focus { border-bottom: 2px solid #1967D2; }

                .tabs-row { display: flex; gap: 8px; margin-bottom: 16px; margin-left: 48px; }
                .tab-chip {
                    border: none; background: #F1F3F4;
                    padding: 6px 12px; border-radius: 4px;
                    font-size: 14px; font-weight: 500; color: #5F6368;
                    cursor: pointer;
                }
                .tab-chip.active { background: #E8F0FE; color: #1967D2; }

                .form-grid {
                    display: grid;
                    grid-template-columns: 48px 1fr;
                    row-gap: 16px;
                }
                .grid-icon {
                    display: flex; justify-content: flex-start; padding-top: 2px;
                    color: #5F6368;
                }
                .grid-content { display: flex; flex-direction: column; gap: 8px; }

                /* Time Pills */
                .time-pills { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
                .pill-group {
                    display: flex; background: #F1F3F4; border-radius: 4px;
                    padding: 4px; gap: 4px;
                }
                .date-input, .time-input {
                    border: none; background: transparent; font-size: 14px;
                    color: #3C4043; cursor: pointer; outline: none;
                }
                .separator { color: #3C4043; }

                .time-meta { display: flex; align-items: center; gap: 16px; font-size: 14px; color: #3C4043; }
                .checkbox-label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
                
                .recurrence-select {
                    border: none; background: transparent; color: #3C4043;
                    font-size: 14px; cursor: pointer; outline: none;
                    font-weight: 500;
                }

                /* Inputs */
                .ghost-input {
                    width: 100%; border: none; outline: none;
                    font-size: 14px; color: #3C4043; padding: 6px 0;
                    border-bottom: 1px solid transparent;
                }
                .ghost-input:focus { border-bottom-color: #1967D2; }
                .ghost-input::placeholder { color: #70757A; }

                .ghost-textarea {
                    width: 100%; border: none; outline: none;
                    font-size: 14px; color: #3C4043; resize: none;
                    background: #F1F3F4; padding: 8px; border-radius: 4px;
                    min-height: 60px;
                }

                /* Meet Button */
                .meet-btn {
                    background: #1A73E8; color: white; border: none;
                    padding: 8px 16px; border-radius: 4px; font-weight: 500; font-size: 14px;
                    cursor: pointer; align-self: flex-start;
                }
                .meet-btn.added {
                    background: white; color: #3C4043; border: 1px solid #DADCE0;
                    display: flex; align-items: center; gap: 8px;
                }

                /* Calendar Row */
                .calendar-row { display: flex; align-items: center; gap: 12px; }
                .cal-selector {
                    position: relative; cursor: pointer;
                    padding: 6px 12px; background: #F1F3F4; border-radius: 4px;
                    font-size: 14px; color: #3C4043;
                }
                .hidden-select {
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                    opacity: 0; cursor: pointer;
                }
                .color-dot-wrapper { position: relative; width: 20px; height: 20px; }
                .color-dot { width: 100%; height: 100%; border-radius: 50%; }

                /* Chips */
                .chips-row { display: flex; flex-wrap: wrap; gap: 4px; }
                .chip { background: #E8F0FE; color: #1967D2; font-size: 12px; padding: 2px 8px; border-radius: 12px; }

                /* Footer */
                .card-footer {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 12px 24px; border-top: 1px solid #F1F3F4;
                }
                .text-btn {
                    background: none; border: none; color: #1A73E8;
                    font-weight: 500; cursor: pointer; font-size: 14px;
                }
                .save-btn {
                    background: #1A73E8; color: white; border: none;
                    padding: 8px 24px; border-radius: 4px;
                    font-weight: 500; cursor: pointer; font-size: 14px;
                }
                .save-btn:hover { background: #185ABC; }

                /* Notifications Section */
                .notifications-section { display: flex; flex-direction: column; gap: 8px; }
                .notification-row { display: flex; align-items: center; gap: 8px; }
                .remove-notif-btn {
                    background: none; border: none; cursor: pointer; color: #5F6368;
                    font-size: 18px; padding: 4px 8px; border-radius: 50%;
                }
                .remove-notif-btn:hover { background: rgba(0,0,0,0.05); }
                .add-notif-btn {
                    background: none; border: none; color: #1A73E8;
                    cursor: pointer; font-size: 14px; padding: 6px 0;
                    text-align: left;
                }
                .add-notif-btn:hover { text-decoration: underline; }

                /* Ghost Select */
                .ghost-select {
                    background: #F1F3F4; border: none; border-radius: 4px;
                    padding: 6px 12px; font-size: 14px; color: #3C4043;
                    cursor: pointer; outline: none;
                }
                .ghost-select:focus { outline: 2px solid #1967D2; }
                .ghost-select.full-width { width: 100%; }

                /* Visibility Row */
                .visibility-row { display: flex; gap: 24px; }
                .vis-item { display: flex; flex-direction: column; gap: 4px; }
                .vis-label { font-size: 12px; color: #70757A; font-weight: 500; }
            `}</style>
        </div>
    );
}

export function SchedulerModal() {
    const { isSchedulerOpen, closeScheduler, schedulerItemId, items, tasks, updateItem, updateTask } = useAppStore();
    if (!isSchedulerOpen || !schedulerItemId) return null;
    const targetItem = items.find(i => i.id === schedulerItemId);
    const targetTask = tasks.find(t => t.id === schedulerItemId);
    const item = targetItem || targetTask;
    const isTaskType = !!targetTask;
    if (!item) return null;
    return (
        <SchedulerContent
            item={item}
            isTaskType={isTaskType}
            onClose={closeScheduler}
            onSave={async (updates) => {
                if (isTaskType) updateTask(item.id, updates);
                else updateItem(item.id, updates);
            }}
        />
    );
}
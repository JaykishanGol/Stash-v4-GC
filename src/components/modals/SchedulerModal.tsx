import { useState, useEffect } from 'react';
import { X, Clock, Users, Video, MapPin, CheckSquare, Calendar as CalIcon, AlignLeft, Bell, Globe } from 'lucide-react';
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

            if (item.scheduled_at) {
                const d = new Date(item.scheduled_at);
                setStartDate(d.toISOString().split('T')[0]);
                setStartTime(d.toTimeString().slice(0, 5));
                const end = new Date(d.getTime() + 3600000);
                setEndDate(end.toISOString().split('T')[0]);
                setEndTime(end.toTimeString().slice(0, 5));
            } else {
                setStartDate(defDate);
                setEndDate(defDate);
            }

            if (item.recurring_config) {
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
                updates.recurring_config = recurConfig;
            } else {
                updates.recurring_config = null;
            }

            if (activeTab === 'task') {
                updates.scheduled_at = startDate ? new Date(startDate).toISOString() : null;

                await onSave(updates);

                if (updates.scheduled_at) {
                    await GoogleSyncService.syncToGoogleTask({ ...item, ...updates }, {
                        listId: taskListId,
                        dueDate: updates.scheduled_at,
                        notes: description
                    });
                }
            } else {
                // Event
                const startIso = `${startDate}T${startTime}`;
                updates.scheduled_at = new Date(startIso).toISOString();

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

                    {/* --- MAIN FORM GRID --- */}
                    <div className="scheduler-grid">

                        {/* 1. TIME */}
                        <div className="grid-icon"><Clock size={20} /></div>
                        <div className="grid-content">
                            <div className="time-inputs-row">
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="stylish-input date-width" />
                                {!isAllDay && <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="stylish-input time-width" />}

                                {/* Only show End Time/Date for EVENT type */}
                                {activeTab === 'event' && !isAllDay && (
                                    <>
                                        <span className="time-sep">-</span>
                                        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="stylish-input time-width" />
                                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="stylish-input date-width" />
                                    </>
                                )}
                            </div>
                            <div className="time-options-row">
                                <label className="stylish-checkbox">
                                    <input type="checkbox" checked={isAllDay} onChange={e => setIsAllDay(e.target.checked)} />
                                    <span>All day</span>
                                </label>
                                <select
                                    className="stylish-select recurrence-select"
                                    value={recurrence}
                                    onChange={e => {
                                        const val = e.target.value as any;
                                        if (val === 'custom') setShowCustomRecurrence(true);
                                        else setRecurrence(val);
                                    }}
                                >
                                    <option value="none">Does not repeat</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="yearly">Yearly</option>
                                    <option value="weekdays">Weekdays</option>
                                    <option value="custom">{customRecurrenceLabel}</option>
                                </select>
                            </div>
                        </div>

                        {/* 2. NOTIFICATIONS (Event only) */}
                        {activeTab === 'event' && (
                            <>
                                <div className="grid-icon"><Bell size={20} /></div>
                                <div className="grid-content">
                                    <div className="notification-list">
                                        {notifications.map((n, i) => (
                                            <div key={i} className="notification-row">
                                                <select
                                                    className="stylish-select hover-bg"
                                                    value={n.minutes}
                                                    onChange={e => {
                                                        const updated = [...notifications];
                                                        updated[i].minutes = parseInt(e.target.value);
                                                        setNotifications(updated);
                                                    }}
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
                                                    className="icon-btn-small"
                                                    onClick={() => setNotifications(notifications.filter((_, j) => j !== i))}
                                                    title="Remove notification"
                                                >
                                                    <X size={14} />
                                                </button>
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

                        {/* 3. GUESTS (Event only) */}
                        {activeTab === 'event' && (
                            <>
                                <div className="grid-icon"><Users size={20} /></div>
                                <div className="grid-content">
                                    <input
                                        type="text"
                                        className="stylish-input full-width"
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
                                        <div className="chips-container">
                                            {attendees.map(a => (
                                                <span key={a} className="attendee-chip">
                                                    {a} <X size={12} className="cursor-pointer" onClick={() => setAttendees(attendees.filter(x => x !== a))} />
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* 4. MEET (Event only) */}
                        {activeTab === 'event' && (
                            <>
                                <div className="grid-icon"><Video size={20} /></div>
                                <div className="grid-content">
                                    {addMeet ? (
                                        <button className="meet-chip active" onClick={() => setAddMeet(false)}>
                                            <Video size={16} /> Join with Google Meet <X size={14} style={{ marginLeft: 6 }} />
                                        </button>
                                    ) : (
                                        <button className="meet-chip" onClick={() => setAddMeet(true)}>
                                            Add Google Meet video conferencing
                                        </button>
                                    )}
                                </div>
                            </>
                        )}

                        {/* 5. LOCATION (Event only) */}
                        {activeTab === 'event' && (
                            <>
                                <div className="grid-icon"><MapPin size={20} /></div>
                                <div className="grid-content">
                                    <input
                                        type="text"
                                        className="stylish-input full-width"
                                        placeholder="Add location"
                                        value={location}
                                        onChange={e => setLocation(e.target.value)}
                                    />
                                </div>
                            </>
                        )}

                        {/* 6. DESCRIPTION */}
                        <div className="grid-icon"><AlignLeft size={20} /></div>
                        <div className="grid-content">
                            <textarea
                                className="stylish-textarea"
                                placeholder={activeTab === 'task' ? "Add details" : "Add description"}
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={3}
                            />
                        </div>

                        {/* 7. CALENDAR / LIST */}
                        <div className="grid-icon">
                            {activeTab === 'event' ? <CalIcon size={20} /> : <CheckSquare size={20} />}
                        </div>
                        <div className="grid-content">
                            <div className="calendar-row">
                                {activeTab === 'event' ? (
                                    <>
                                        <div className="cal-selector-pill">
                                            <div
                                                className="color-dot-mini"
                                                style={{ background: GOOGLE_COLORS.find(c => c.id === colorId)?.color }}
                                            />
                                            <select className="hidden-select" value={calendarId} onChange={e => setCalendarId(e.target.value)}>
                                                {calendars.length > 0 ? calendars.map(c => <option key={c.id} value={c.id}>{c.summary}</option>) : <option value="primary">Primary</option>}
                                            </select>
                                            <span className="cal-name-text">
                                                {calendars.find(c => c.id === calendarId)?.summary || 'Primary'}
                                            </span>
                                            <div className="color-picker-trigger" title="Change color">
                                                <select className="hidden-select" value={colorId} onChange={e => setColorId(e.target.value)}>
                                                    {GOOGLE_COLORS.map(c => <option key={c.id} value={c.id}>Color {c.id}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="timezone-pill">
                                            <Globe size={14} />
                                            <select className="hidden-select" value={timezone} onChange={e => setTimezone(e.target.value)}>
                                                <option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>Local Time</option>
                                                {['America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo', 'UTC'].map(tz => (
                                                    <option key={tz} value={tz}>{tz}</option>
                                                ))}
                                            </select>
                                            <span>{timezone.split('/').pop()?.replace('_', ' ') || 'Local'}</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="cal-selector-pill">
                                        <select className="hidden-select" value={taskListId} onChange={e => setTaskListId(e.target.value)}>
                                            {taskLists.length > 0 ? taskLists.map(l => <option key={l.id} value={l.id}>{l.title}</option>) : <option value="@default">My Tasks</option>}
                                        </select>
                                        <span>{taskLists.find(l => l.id === taskListId)?.title || 'My Tasks'}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>

                {/* FOOTER */}
                <div className="card-footer">
                    <div className="footer-left">
                        {activeTab === 'event' && (
                            <>
                                <select className="footer-dropdown" value={visibility} onChange={e => setVisibility(e.target.value as any)}>
                                    <option value="default">Default Visibility</option>
                                    <option value="public">Public</option>
                                    <option value="private">Private</option>
                                </select>
                                <select className="footer-dropdown" value={showAs} onChange={e => setShowAs(e.target.value as any)}>
                                    <option value="busy">Busy</option>
                                    <option value="free">Free</option>
                                </select>
                            </>
                        )}
                    </div>
                    <button className="save-btn" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save'}
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
                /* Global Box Sizing for this component context */
                .google-card * { box-sizing: border-box; }

                /* --- SCHEDULER GRID LAYOUT --- */
                .google-modal-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.4); z-index: 9999;
                    display: flex; align-items: center; justify-content: center;
                }
                .google-card {
                    width: 780px; /* Optimal width */
                    max-width: 95vw;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 24px 38px 3px rgba(0,0,0,0.14);
                    overflow: hidden;
                    font-family: 'Inter', system-ui, -apple-system, sans-serif;
                    display: flex; flex-direction: column;
                    max-height: 98vh; /* Use closer to full height */
                    animation: scaleIn 0.15s ease-out;
                }
                @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }

                .card-header {
                    padding: 8px 12px; display: flex; justify-content: flex-end;
                    background: transparent; flex-shrink: 0;
                }
                .close-btn {
                    border: none; background: transparent; cursor: pointer;
                    color: #5F6368; padding: 8px; border-radius: 50%;
                    transition: background 0.2s;
                }
                .close-btn:hover { background: rgba(0,0,0,0.05); }

                .card-body {
                    padding: 0 32px 16px; /* Compact bottom padding */
                    overflow-y: auto;
                    overflow-x: hidden;
                    flex: 1;
                }

                /* Title & Tabs */
                .title-section { margin-bottom: 16px; margin-left: 56px; }
                .title-input {
                    width: 100%; border: none; border-bottom: 1px solid #E0E0E0;
                    font-size: 22px; padding: 6px 0; outline: none; /* Slightly smaller title font for compactness */
                    color: #3C4043; transition: border 0.2s;
                    border-radius: 4px 4px 0 0; font-weight: 500;
                }
                .title-input:focus { border-bottom: 2px solid #1967D2; background: #F8F9FA; padding-left: 8px; }

                .tabs-row { display: flex; gap: 8px; margin-bottom: 16px; margin-left: 56px; }
                .tab-chip {
                    border: none; background: white; border: 1px solid #DADCE0;
                    padding: 6px 18px; border-radius: 18px;
                    font-size: 13px; font-weight: 500; color: #5F6368;
                    cursor: pointer; transition: all 0.2s;
                }
                .tab-chip:hover { background: #F8F9FA; border-color: #C0C3C6; }
                .tab-chip.active { background: #E8F0FE; color: #1967D2; border-color: #E8F0FE; }

                /* GRID SYSTEM */
                .scheduler-grid {
                    display: grid;
                    grid-template-columns: 56px 1fr;
                    row-gap: 12px;
                    align-items: center; /* Center align vertically for better visual balance */
                }
                .grid-icon {
                    display: flex; justify-content: flex-start;
                    color: #5F6368; padding-left: 8px;
                    height: 40px; align-items: center; /* Center icon vertically */
                }
                .grid-content {
                    display: flex; flex-direction: column; gap: 8px;
                    justify-content: center;
                    min-width: 0; /* Prevent grid blowout */
                }

                /* Inputs & Components */
                .stylish-input, .stylish-select, .stylish-textarea {
                    background: #F8F9FA;
                    border: 1px solid transparent;
                    border-radius: 6px;
                    padding: 8px 12px; /* Slightly reduced padding */
                    font-size: 14px;
                    color: #3C4043;
                    transition: all 0.2s;
                    width: 100%; /* Default to full width unless overridden */
                }
                .stylish-input:hover, .stylish-select:hover { background: #F1F3F4; }
                .stylish-input:focus, .stylish-select:focus, .stylish-textarea:focus {
                    background: white;
                    outline: 2px solid #1967D2;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .stylish-textarea { resize: none; line-height: 1.5; }

                /* Time Row - Optimized for Single Line */
                .time-inputs-row {
                    display: flex; flex-wrap: nowrap; gap: 10px; align-items: center; width: 100%;
                }
                /* IMPORTANT: Override width: 100% from stylish-input */
                .date-width { width: 140px !important; flex-shrink: 0; }
                .time-width { width: 100px !important; flex-shrink: 0; }
                .time-sep { color: #5F6368; font-weight: 500; flex-shrink: 0; }
                
                .time-options-row {
                    display: flex; align-items: center; gap: 20px; margin-top: 0;
                }
                .stylish-checkbox {
                    display: flex; align-items: center; gap: 8px;
                    font-size: 14px; color: #3C4043; cursor: pointer;
                    user-select: none; white-space: nowrap;
                }
                .recurrence-select {
                    width: auto !important; padding: 6px 12px; font-size: 14px;
                    background: white; border: 1px solid #DADCE0; border-radius: 6px;
                }
                .recurrence-select:hover { background: #F8F9FA; }

                /* Notifications */
                .notification-list { display: flex; flex-direction: column; gap: 8px; width: 100%; }
                .notification-row { display: flex; align-items: center; gap: 12px; width: 100%; }
                .hover-bg { flex: 1; }
                .icon-btn-small {
                    border: none; background: transparent; color: #5F6368;
                    cursor: pointer; padding: 6px; border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.2s; flex-shrink: 0;
                }
                .icon-btn-small:hover { background: rgba(0,0,0,0.05); color: #D93025; }
                .add-notif-btn {
                    border: none; background: transparent; color: #1A73E8;
                    font-size: 14px; font-weight: 500; cursor: pointer;
                    text-align: left; padding: 4px 0; align-self: flex-start;
                }
                .add-notif-btn:hover { background: rgba(26,115,232,0.05); padding: 4px 8px; border-radius: 4px; margin-left: -8px; }

                /* Guests & Chips */
                .full-width { width: 100%; }
                .chips-container { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
                .attendee-chip {
                    display: flex; align-items: center; gap: 6px;
                    background: white; border: 1px solid #DADCE0;
                    padding: 4px 10px; border-radius: 16px; font-size: 13px; color: #3C4043;
                }
                .attendee-chip:hover { background: #F8F9FA; border-color: #BDC1C6; }
                
                /* Meet */
                .meet-chip {
                    display: flex; align-items: center; gap: 10px;
                    background: #1A73E8; color: white;
                    border: none; padding: 8px 16px; border-radius: 6px;
                    font-size: 14px; font-weight: 500; cursor: pointer;
                    align-self: flex-start;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    transition: all 0.2s;
                }
                .meet-chip:hover { background: #1557B0; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                .meet-chip.active { background: white; color: #1A73E8; border: 1px solid #DADCE0; }
                .meet-chip.active:hover { background: #F8F9FA; }

                /* Calendar / Pills */
                .calendar-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
                .cal-selector-pill, .timezone-pill {
                    display: flex; align-items: center; gap: 8px;
                    background: #F8F9FA; padding: 6px 12px; border-radius: 6px;
                    border: 1px solid transparent;
                    font-size: 13px; color: #5F6368;
                    cursor: pointer; position: relative;
                    height: 32px; transition: all 0.2s;
                }
                .cal-selector-pill:hover, .timezone-pill:hover { background: white; border-color: #DADCE0; color: #3C4043; }
                .color-dot-mini { width: 10px; height: 10px; border-radius: 50%; }
                .hidden-select {
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                    opacity: 0; cursor: pointer;
                }
                .color-picker-trigger {
                    width: 14px; height: 14px; border-radius: 50%;
                    background: white; border: 2px solid transparent;
                    position: relative; margin-left: 4px;
                    box-shadow: 0 0 0 1px #DADCE0;
                }
                
                /* Footer */
                .card-footer {
                    padding: 16px 32px; /* Compact footer padding */
                    border-top: 1px solid #F1F3F4;
                    display: flex; justify-content: space-between; align-items: center;
                    background: white; flex-shrink: 0;
                }
                .footer-left { display: flex; gap: 12px; }
                .footer-dropdown {
                    background: white; border: 1px solid #DADCE0; border-radius: 6px;
                    padding: 6px 10px; font-size: 13px; color: #5F6368; cursor: pointer;
                    transition: all 0.2s;
                }
                .footer-dropdown:hover { background: #F8F9FA; color: #3C4043; border-color: #BDC1C6; }
                
                .save-btn {
                    background: #1A73E8; color: white; border: none;
                    padding: 8px 24px; border-radius: 4px;
                    font-weight: 500; font-size: 14px; cursor: pointer;
                    transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }
                .save-btn:hover { background: #1669BB; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                .save-btn:disabled { background: #E0E0E0; color: #9AA0A6; cursor: not-allowed; box-shadow: none; }

                /* Mobile Responsive */
                @media (max-width: 768px) {
                    .google-card {
                        width: 100%; height: 100%; max-height: 100%; max-width: 100%;
                        border-radius: 0;
                        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    }
                    .card-body { padding: 16px 20px; }
                    .scheduler-grid {
                        grid-template-columns: 40px 1fr;
                        row-gap: 20px;
                    }
                    .title-section, .tabs-row { margin-left: 0; padding-left: 40px; }
                    .card-footer {
                        padding: 16px 20px;
                        flex-direction: column-reverse; gap: 12px;
                        align-items: stretch;
                        border-top: 1px solid #E0E0E0;
                    }
                    .footer-left { justify-content: space-between; }
                    .save-btn { width: 100%; padding: 14px; font-size: 16px; }
                    
                    .time-inputs-row { flex-wrap: wrap; gap: 8px; }
                    .date-width, .time-width { width: 100% !important; flex: 1; }
                    .time-width { width: 48% !important; }
                    .time-sep { display: none; }
                }
            `}</style>
        </div >
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
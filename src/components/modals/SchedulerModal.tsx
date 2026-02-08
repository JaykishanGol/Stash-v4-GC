import { useState, useEffect } from 'react';
import { X, Clock, Users, Video, MapPin, CheckSquare, Calendar as CalIcon, AlignLeft, Bell, Globe } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
    GoogleClient,
    isNoGoogleAccessTokenError,
    type GoogleTaskList,
    type GoogleCalendarListEntry
} from '../../lib/googleClient';
import type { RecurringConfig, Item, Task, ItemGoogleSyncMeta } from '../../lib/types';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import { CustomRecurrenceModal } from './CustomRecurrenceModal';
import { GoogleConnectBanner } from '../ui/GoogleConnectBanner';
import { EventSchedulerContent } from './EventSchedulerContent';
import { GOOGLE_COLORS } from '../../lib/calendarConstants';
import '../../styles/event-scheduler.css';

interface SchedulerContentProps {
    item: Partial<Item> | Partial<Task>;
    isTaskType: boolean;
    onClose: () => void;
    onSave: (updates: Record<string, unknown>) => Promise<void> | void;
    onDelete?: () => Promise<void> | void;
}

export function SchedulerContent({ item, isTaskType, onClose, onSave, onDelete }: SchedulerContentProps) {
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'event' | 'task'>(isTaskType ? 'task' : 'event');

    // Use the new hook that checks DB for stored refresh tokens
    const { isConnected: hasGoogleAuth, isLoading: googleAuthLoading } = useGoogleAuth();

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

    // Fetch Google data when connected (uses DB-stored refresh token)
    useEffect(() => {
        if (hasGoogleAuth && !googleAuthLoading) {
            GoogleClient.listTaskLists().then(setTaskLists).catch((error) => {
                if (!isNoGoogleAccessTokenError(error)) {
                    console.error(error);
                }
            });
            GoogleClient.listCalendars().then(setCalendars).catch((error) => {
                if (!isNoGoogleAccessTokenError(error)) {
                    console.error(error);
                }
            });
        }
    }, [hasGoogleAuth, googleAuthLoading]);

    useEffect(() => {
        if (item) {
            setTitle(item.title || '');
            // Task has description, Item doesn't - safely access
            const nextDescription =
                'description' in item && typeof item.description === 'string'
                    ? item.description
                    : '';
            setDescription(nextDescription);

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
                const frequency = item.recurring_config?.frequency;
                if (
                    frequency === 'daily' ||
                    frequency === 'weekly' ||
                    frequency === 'monthly' ||
                    frequency === 'yearly'
                ) {
                    setRecurrence(frequency);
                } else {
                    setRecurrence('daily');
                }
            }

            if (!isTaskType) {
                const content = (item as Partial<Item>).content as ItemGoogleSyncMeta | undefined;
                if (content?.google_sync_target === 'task' || content?.google_sync_target === 'event') {
                    setActiveTab(content.google_sync_target);
                }
                if (content?.google_sync_calendar_id) {
                    setCalendarId(content.google_sync_calendar_id);
                }
                if (content?.google_sync_task_list_id) {
                    setTaskListId(content.google_sync_task_list_id);
                }
            }
        }
    }, [item, isTaskType]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const updates: Record<string, unknown> = { title, description };
            const selectedMode: 'event' | 'task' = isTaskType ? 'task' : activeTab;

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
                    frequency: freq === 'weekdays' ? 'weekly' : (freq as RecurringConfig['frequency']),
                    interval: 1,
                    time: isAllDay ? '09:00' : startTime,
                    byWeekDays,
                    endType: 'never'
                };
                updates.recurring_config = recurConfig;
            } else {
                updates.recurring_config = null;
            }

            if (selectedMode === 'task') {
                updates.scheduled_at = startDate ? new Date(startDate).toISOString() : null;
                if (!isTaskType) {
                    const existingContent = ((item as Partial<Item>).content || {}) as Record<string, unknown>;
                    updates.content = {
                        ...existingContent,
                        google_sync_target: 'task',
                        google_sync_task_list_id: taskListId,
                        google_sync_calendar_id: null,
                    };
                }

                await onSave(updates);
            } else {
                // Event
                const startIso = `${startDate}T${startTime}`;
                updates.scheduled_at = new Date(startIso).toISOString();
                if (!isTaskType) {
                    const existingContent = ((item as Partial<Item>).content || {}) as Record<string, unknown>;
                    updates.content = {
                        ...existingContent,
                        google_sync_target: 'event',
                        google_sync_task_list_id: null,
                        google_sync_calendar_id: calendarId,
                    };
                }

                await onSave(updates);
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
            <div className="google-card" role="dialog" aria-modal="true" aria-label="Scheduler" onClick={e => e.stopPropagation()}>

                {/* HEADER */}
                <div className="card-header">
                    <div className="drag-handle" />
                    <button className="close-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
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
                            onClick={() => { if (!isTaskType) setActiveTab('event'); }}
                            disabled={isTaskType}
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
                                        const val = e.target.value as typeof recurrence;
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
                        {onDelete && (
                            <button
                                className="footer-dropdown"
                                style={{ color: '#d93025', borderColor: '#d93025' }}
                                onClick={async () => {
                                    await onDelete();
                                    onClose();
                                }}
                            >
                                Delete
                            </button>
                        )}
                        {activeTab === 'event' && (
                            <>
                                <select className="footer-dropdown" value={visibility} onChange={e => setVisibility(e.target.value as 'default' | 'public' | 'private')}>
                                    <option value="default">Default Visibility</option>
                                    <option value="public">Public</option>
                                    <option value="private">Private</option>
                                </select>
                                <select className="footer-dropdown" value={showAs} onChange={e => setShowAs(e.target.value as 'busy' | 'free')}>
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
        </div>
    );
}

export function SchedulerModal() {
    const { isSchedulerOpen, closeScheduler, schedulerItemId, schedulerEventId, schedulerOriginalStart, items, tasks, calendarEvents, updateItem, updateTask, deleteItem: _deleteItem, deleteTask } = useAppStore();
    if (!isSchedulerOpen) return null;

    // If we have a schedulerEventId, render EventSchedulerContent
    if (schedulerEventId) {
        const targetEvent = calendarEvents.find(e => e.id === schedulerEventId);
        if (!targetEvent) {
            // Event might not be in store yet (just created) — create a blank placeholder
            const now = new Date();
            const placeholderEvent: import('../../lib/types').CalendarEvent = {
                id: schedulerEventId,
                user_id: 'demo',
                title: '',
                description: '',
                start_at: now.toISOString(),
                end_at: new Date(now.getTime() + 3600000).toISOString(),
                is_all_day: false,
                rrule: null,
                parent_event_id: null,
                recurring_event_id: null,
                is_deleted_instance: false,
                location: '',
                color_id: '7',
                visibility: 'default',
                transparency: 'opaque',
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                attendees: [],
                conference_data: null,
                reminders: [{ method: 'popup', minutes: 10 }],
                attachments: [],
                google_event_id: null,
                google_calendar_id: 'primary',
                created_at: now.toISOString(),
                updated_at: now.toISOString(),
                deleted_at: null,
                is_unsynced: true,
            };
            return (
                <EventSchedulerContent
                    event={placeholderEvent}
                    originalStart={schedulerOriginalStart}
                    onClose={closeScheduler}
                />
            );
        }

        return (
            <EventSchedulerContent
                event={targetEvent}
                originalStart={schedulerOriginalStart}
                onClose={closeScheduler}
            />
        );
    }

    // Legacy: schedulerItemId for old Item/Task editing
    if (!schedulerItemId) return null;
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
            onDelete={async () => {
                if (isTaskType) deleteTask(item.id);
                else {
                    // Unschedule the item from the calendar — don't trash/delete the actual item
                    await updateItem(item.id, {
                        scheduled_at: null,
                        recurring_config: null,
                        remind_before: null,
                    });
                }
            }}
        />
    );
}

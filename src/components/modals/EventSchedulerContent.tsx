/**
 * EventSchedulerContent
 *
 * Google Calendar event editor — works with CalendarEvent objects
 * and the eventSlice store (RFC 5545 rrule-based recurrence).
 *
 * Reuses the same CSS as the existing SchedulerContent.
 */

import { useState, useEffect, useRef } from 'react';
import { X, Clock, Users, Video, MapPin, Calendar as CalIcon, AlignLeft, Bell, Globe, Paperclip, FileIcon, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { GoogleClient, isNoGoogleAccessTokenError, type GoogleCalendarListEntry } from '../../lib/googleClient';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import type { CalendarEvent, RecurrenceEditMode, EventAttachment } from '../../lib/types';
import { RecurrenceEditDialog } from './RecurrenceEditDialog';
import { CustomRecurrenceModal } from './CustomRecurrenceModal';
import { GoogleConnectBanner } from '../ui/GoogleConnectBanner';
import { GOOGLE_COLORS } from '../../lib/calendarConstants';
import { uploadFile, deleteFile } from '../../lib/supabase';

interface EventSchedulerContentProps {
    event: CalendarEvent;
    originalStart?: string | null;
    onClose: () => void;
}

export function EventSchedulerContent({ event, originalStart, onClose }: EventSchedulerContentProps) {
    const { updateEvent, deleteEvent } = useAppStore();
    const [isSaving, setIsSaving] = useState(false);
    const [hasSaved, setHasSaved] = useState(false);

    const { isConnected: hasGoogleAuth, isLoading: googleAuthLoading } = useGoogleAuth();

    // Google calendars
    const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);

    // Fields
    const [title, setTitle] = useState('');

    // Time
    const [startDate, setStartDate] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endDate, setEndDate] = useState('');
    const [endTime, setEndTime] = useState('10:00');
    const [isAllDay, setIsAllDay] = useState(false);

    // Recurrence — stored as rrule string
    const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays' | 'custom'>('none');
    const [rruleString, setRruleString] = useState<string | null>(null);
    const [showCustomRecurrence, setShowCustomRecurrence] = useState(false);
    const [customRecurrenceLabel, setCustomRecurrenceLabel] = useState('Custom...');

    // Event Details
    const [attendees, setAttendees] = useState<string[]>([]);
    const [newGuest, setNewGuest] = useState('');
    const [addMeet, setAddMeet] = useState(false);
    const [location, setLocation] = useState('');
    const [description, setDescription] = useState('');
    const [calendarId, setCalendarId] = useState('primary');
    const [colorId, setColorId] = useState('7');

    // Timezone, Visibility, Status, Notifications
    const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const [visibility, setVisibility] = useState<'default' | 'public' | 'private'>('default');
    const [showAs, setShowAs] = useState<'busy' | 'free'>('busy');
    const [notifications, setNotifications] = useState<{ method: 'popup' | 'email'; minutes: number }[]>([
        { method: 'popup', minutes: 10 }
    ]);

    // Attachments
    const [attachments, setAttachments] = useState<EventAttachment[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Recurrence edit dialog
    const [recurrenceDialogAction, setRecurrenceDialogAction] = useState<'edit' | 'delete' | null>(null);

    // Whether this is a recurring event instance
    const isRecurringInstance = !!event.parent_event_id || !!event.rrule;

    // Fetch Google calendars
    useEffect(() => {
        if (hasGoogleAuth && !googleAuthLoading) {
            GoogleClient.listCalendars().then(setCalendars).catch((error) => {
                if (!isNoGoogleAccessTokenError(error)) {
                    console.error(error);
                }
            });
        }
    }, [hasGoogleAuth, googleAuthLoading]);

    // Initialize from event data
    useEffect(() => {
        if (event) {
            setTitle(event.title || '');
            setDescription(event.description || '');
            setLocation(event.location || '');
            setIsAllDay(event.is_all_day);
            setColorId(event.color_id || '7');
            setVisibility(event.visibility as any || 'default');
            setTimezone(event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
            setCalendarId(event.google_calendar_id || 'primary');
            setAddMeet(!!event.conference_data?.meetLink);

            if (event.attendees?.length) {
                setAttendees(event.attendees.map(a => a.email));
            }

            if (event.reminders?.length) {
                setNotifications(event.reminders.map(r => ({ method: r.method as 'popup' | 'email', minutes: r.minutes })));
            }

            if (event.attachments?.length) {
                setAttachments(event.attachments);
            }

            // Time
            if (event.start_at) {
                const d = new Date(event.start_at);
                setStartDate(d.toISOString().split('T')[0]);
                setStartTime(d.toTimeString().slice(0, 5));
            }
            if (event.end_at) {
                const d = new Date(event.end_at);
                setEndDate(d.toISOString().split('T')[0]);
                setEndTime(d.toTimeString().slice(0, 5));
            } else if (event.start_at) {
                const d = new Date(new Date(event.start_at).getTime() + 3600000);
                setEndDate(d.toISOString().split('T')[0]);
                setEndTime(d.toTimeString().slice(0, 5));
            }

            // Show/As
            if (event.transparency === 'transparent') setShowAs('free');
            else setShowAs('busy');

            // Recurrence
            if (event.rrule) {
                setRruleString(event.rrule);
                // Detect simple recurrence types
                const upper = event.rrule.toUpperCase();
                if (upper.includes('FREQ=DAILY') && upper.includes('INTERVAL=1')) setRecurrence('daily');
                else if (upper.includes('FREQ=WEEKLY') && upper.includes('BYDAY=MO,TU,WE,TH,FR')) setRecurrence('weekdays');
                else if (upper.includes('FREQ=WEEKLY') && upper.includes('INTERVAL=1')) setRecurrence('weekly');
                else if (upper.includes('FREQ=MONTHLY') && upper.includes('INTERVAL=1')) setRecurrence('monthly');
                else if (upper.includes('FREQ=YEARLY') && upper.includes('INTERVAL=1')) setRecurrence('yearly');
                else {
                    setRecurrence('custom');
                    setCustomRecurrenceLabel('Custom recurrence');
                }
            }
        }
    }, [event]);

    const buildRruleFromPreset = (preset: string): string | null => {
        switch (preset) {
            case 'daily': return 'FREQ=DAILY;INTERVAL=1';
            case 'weekly': return 'FREQ=WEEKLY;INTERVAL=1';
            case 'monthly': return 'FREQ=MONTHLY;INTERVAL=1';
            case 'yearly': return 'FREQ=YEARLY;INTERVAL=1';
            case 'weekdays': return 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR';
            case 'none': return null;
            default: return rruleString ? rruleString.replace(/^RRULE:/i, '') : rruleString;
        }
    };

    const handleSave = async () => {
        if (isRecurringInstance && !recurrenceDialogAction) {
            // Show the 3-option dialog first
            setRecurrenceDialogAction('edit');
            return;
        }

        await doSave('all');
    };

    const doSave = async (mode: RecurrenceEditMode) => {
        setIsSaving(true);
        try {
            const startIso = isAllDay ? `${startDate}T00:00:00.000Z` : new Date(`${startDate}T${startTime}`).toISOString();
            // All-day events use exclusive end: next day at midnight
            const endIso = isAllDay
                ? (() => { const d = new Date(`${endDate}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString(); })()
                : new Date(`${endDate}T${endTime}`).toISOString();

            const updates: Partial<CalendarEvent> = {
                title,
                description: description || undefined,
                start_at: startIso,
                end_at: endIso,
                is_all_day: isAllDay,
                rrule: buildRruleFromPreset(recurrence),
                location: location || undefined,
                color_id: colorId,
                visibility: visibility,
                transparency: showAs === 'free' ? 'transparent' : 'opaque',
                timezone,
                attendees: attendees.map(email => {
                    // Preserve existing responseStatus if the attendee was already on the event
                    const existing = event.attendees?.find(a => a.email.toLowerCase() === email.toLowerCase());
                    return { email, responseStatus: existing?.responseStatus || 'needsAction', displayName: existing?.displayName };
                }),
                conference_data: addMeet ? { meetLink: 'pending', entryPoints: [] } : null,
                reminders: notifications.map(n => ({ method: n.method, minutes: n.minutes })),
                attachments,
                google_calendar_id: calendarId !== 'primary' ? calendarId : undefined,
            };

            await updateEvent(event.id, updates, mode, originalStart || undefined);
            setHasSaved(true);
            onClose();
        } catch (e) {
            console.error(e);
            alert('Save failed');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (isRecurringInstance) {
            setRecurrenceDialogAction('delete');
            return;
        }
        await deleteEvent(event.id, 'all');
        onClose();
    };

    const handleRecurrenceConfirm = async (mode: RecurrenceEditMode) => {
        const action = recurrenceDialogAction;
        setRecurrenceDialogAction(null);

        if (action === 'edit') {
            await doSave(mode);
        } else if (action === 'delete') {
            await deleteEvent(event.id, mode, originalStart || undefined);
            onClose();
        }
    };

    // Auto-delete draft events (created with empty title on date-select) if user closes without saving
    const handleClose = () => {
        if (!hasSaved && !title.trim() && !event.title) {
            // This was a draft event created by date-select — remove it
            deleteEvent(event.id, 'all');
        }
        onClose();
    };

    return (
        <div className="google-modal-overlay" onClick={handleClose}>
            <div className="google-card" onClick={e => e.stopPropagation()}>

                {/* HEADER */}
                <div className="card-header">
                    <div className="drag-handle" />
                    <button className="close-btn" onClick={handleClose} aria-label="Close"><X size={20} /></button>
                </div>

                {/* GOOGLE CONNECT BANNER */}
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

                    {/* TAB: always "Event" for CalendarEvent */}
                    <div className="tabs-row">
                        <button className="tab-chip active">Event</button>
                    </div>

                    {/* --- MAIN FORM GRID --- */}
                    <div className="scheduler-grid">

                        {/* 1. TIME */}
                        <div className="grid-icon"><Clock size={20} /></div>
                        <div className="grid-content">
                            <div className="time-inputs-row">
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="stylish-input date-width" />
                                {!isAllDay && <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="stylish-input time-width" />}
                                {!isAllDay && (
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

                        {/* 2. NOTIFICATIONS */}
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

                        {/* 3. GUESTS */}
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

                        {/* 4. MEET */}
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

                        {/* 5. LOCATION */}
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

                        {/* 6. DESCRIPTION */}
                        <div className="grid-icon"><AlignLeft size={20} /></div>
                        <div className="grid-content">
                            <textarea
                                className="stylish-textarea"
                                placeholder="Add description"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={3}
                            />
                        </div>

                        {/* 6b. ATTACHMENTS */}
                        <div className="grid-icon"><Paperclip size={20} /></div>
                        <div className="grid-content">
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                style={{ display: 'none' }}
                                onChange={async (e) => {
                                    const files = e.target.files;
                                    if (!files?.length) return;
                                    setIsUploading(true);
                                    const userId = useAppStore.getState().user?.id || 'demo';
                                    const newAttachments: EventAttachment[] = [];
                                    for (const file of Array.from(files)) {
                                        try {
                                            const { generateId } = await import('../../lib/utils');
                                            const result = await uploadFile(file, userId, 'file');
                                            newAttachments.push({
                                                id: generateId(),
                                                name: file.name,
                                                url: result.url,
                                                storagePath: result.path,
                                                type: file.type,
                                                size: file.size,
                                            });
                                        } catch (err) {
                                            console.error('Upload failed:', err);
                                        }
                                    }
                                    setAttachments(prev => [...prev, ...newAttachments]);
                                    setIsUploading(false);
                                    e.target.value = '';
                                }}
                            />
                            {attachments.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                                    {attachments.map(att => (
                                        <div key={att.id} style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '6px 10px', borderRadius: 8,
                                            background: 'var(--bg-app)', border: '1px solid var(--border-light)',
                                            fontSize: 13,
                                        }}>
                                            <FileIcon size={14} style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
                                            <a
                                                href={att.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--accent, #1a73e8)', textDecoration: 'none' }}
                                            >
                                                {att.name}
                                            </a>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                                                {att.size < 1024 ? `${att.size}B` : att.size < 1048576 ? `${(att.size / 1024).toFixed(1)}KB` : `${(att.size / 1048576).toFixed(1)}MB`}
                                            </span>
                                            <button
                                                className="icon-btn-small"
                                                title="Remove attachment"
                                                onClick={async () => {
                                                    try { await deleteFile(att.storagePath); } catch { /* ignore */ }
                                                    setAttachments(prev => prev.filter(a => a.id !== att.id));
                                                }}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button
                                className="meet-chip"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                style={{ opacity: isUploading ? 0.6 : 1 }}
                            >
                                <Paperclip size={16} />
                                {isUploading ? 'Uploading...' : 'Add attachment'}
                            </button>
                        </div>

                        {/* 7. CALENDAR & COLOR */}
                        <div className="grid-icon"><CalIcon size={20} /></div>
                        <div className="grid-content">
                            <div className="calendar-row">
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
                                            {GOOGLE_COLORS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                            </div>
                        </div>
                    </div>
                </div>

                {/* FOOTER */}
                <div className="card-footer">
                    <div className="footer-left">
                        <select className="footer-dropdown" value={visibility} onChange={e => setVisibility(e.target.value as any)}>
                            <option value="default">Default Visibility</option>
                            <option value="public">Public</option>
                            <option value="private">Private</option>
                        </select>
                        <select className="footer-dropdown" value={showAs} onChange={e => setShowAs(e.target.value as any)}>
                            <option value="busy">Busy</option>
                            <option value="free">Free</option>
                        </select>
                        <button
                            className="footer-dropdown"
                            style={{ color: '#d93025', borderColor: '#d93025' }}
                            onClick={handleDelete}
                        >
                            Delete
                        </button>
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
                    // Convert RecurringConfig to rrule string
                    const freq = config.frequency.toUpperCase();
                    let rule = `FREQ=${freq};INTERVAL=${config.interval || 1}`;
                    if (config.byWeekDays?.length) {
                        const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
                        rule += `;BYDAY=${config.byWeekDays.map(d => dayMap[d]).join(',')}`;
                    }
                    if (config.endType === 'count' && config.endCount) {
                        rule += `;COUNT=${config.endCount}`;
                    } else if (config.endType === 'date' && config.endDate) {
                        const d = new Date(config.endDate);
                        rule += `;UNTIL=${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
                    }
                    setRruleString(rule);
                    setRecurrence('custom');
                    setCustomRecurrenceLabel(label);
                    setShowCustomRecurrence(false);
                }}
                initialConfig={undefined}
                startDate={startDate ? new Date(startDate) : new Date()}
            />

            {/* RECURRENCE EDIT DIALOG */}
            {recurrenceDialogAction && (
                <RecurrenceEditDialog
                    action={recurrenceDialogAction}
                    onConfirm={handleRecurrenceConfirm}
                    onCancel={() => setRecurrenceDialogAction(null)}
                />
            )}
        </div>
    );
}

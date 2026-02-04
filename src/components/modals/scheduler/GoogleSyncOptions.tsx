import { Users, Video, MapPin, Calendar as CalIcon, CheckSquare, Bell, Globe, Eye, X } from 'lucide-react';
import type { GoogleTaskList, GoogleCalendarListEntry } from '../../../lib/googleClient';

// Google Colors constant
const GOOGLE_COLORS = [
    { id: '1', color: '#7986cb' }, { id: '2', color: '#33b679' }, { id: '3', color: '#8e24aa' },
    { id: '4', color: '#e67c73' }, { id: '5', color: '#f6c026' }, { id: '6', color: '#f5511d' },
    { id: '7', color: '#039be5' }, { id: '8', color: '#616161' }, { id: '9', color: '#3f51b5' },
    { id: '10', color: '#0b8043' }, { id: '11', color: '#d60000' }
];

interface GoogleSyncOptionsProps {
    activeTab: 'event' | 'task';
    // Guests
    attendees: string[];
    setAttendees: (v: string[]) => void;
    newGuest: string;
    setNewGuest: (v: string) => void;
    // Meet
    addMeet: boolean;
    setAddMeet: (v: boolean) => void;
    // Location
    location: string;
    setLocation: (v: string) => void;
    // Calendar/List
    calendars: GoogleCalendarListEntry[];
    calendarId: string;
    setCalendarId: (v: string) => void;
    colorId: string;
    setColorId: (v: string) => void;
    taskLists: GoogleTaskList[];
    taskListId: string;
    setTaskListId: (v: string) => void;
    // Notifications
    notifications: { method: 'popup' | 'email'; minutes: number }[];
    setNotifications: (v: { method: 'popup' | 'email'; minutes: number }[]) => void;
    // Timezone
    timezone: string;
    setTimezone: (v: string) => void;
    // Visibility/Status
    visibility: 'default' | 'public' | 'private';
    setVisibility: (v: 'default' | 'public' | 'private') => void;
    showAs: 'busy' | 'free';
    setShowAs: (v: 'busy' | 'free') => void;
}

export function GoogleSyncOptions({
    activeTab,
    attendees, setAttendees, newGuest, setNewGuest,
    addMeet, setAddMeet,
    location, setLocation,
    calendars, calendarId, setCalendarId, colorId, setColorId,
    taskLists, taskListId, setTaskListId,
    notifications, setNotifications,
    timezone, setTimezone,
    visibility, setVisibility,
    showAs, setShowAs
}: GoogleSyncOptionsProps) {

    const commonTimezones = [
        'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
        'Europe/London', 'Europe/Paris', 'Europe/Berlin',
        'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai',
        'Australia/Sydney', 'Pacific/Auckland'
    ];

    return (
        <>
            {/* GUESTS (Event Only) */}
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

            {/* CALENDAR/LIST */}
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

            {/* NOTIFICATIONS (Event only) */}
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

            {/* TIMEZONE (Event only) */}
            {activeTab === 'event' && (
                <>
                    <div className="grid-icon"><Globe size={20} /></div>
                    <div className="grid-content">
                        <select
                            value={timezone}
                            onChange={e => setTimezone(e.target.value)}
                            className="ghost-select"
                        >
                            {commonTimezones.map(tz => <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>)}
                        </select>
                    </div>
                </>
            )}

            {/* VISIBILITY (Event only) */}
            {activeTab === 'event' && (
                <>
                    <div className="grid-icon"><Eye size={20} /></div>
                    <div className="grid-content">
                        <div className="visibility-row">
                            <select
                                value={visibility}
                                onChange={e => setVisibility(e.target.value as 'default' | 'public' | 'private')}
                                className="ghost-select"
                            >
                                <option value="default">Default visibility</option>
                                <option value="public">Public</option>
                                <option value="private">Private</option>
                            </select>
                            <select
                                value={showAs}
                                onChange={e => setShowAs(e.target.value as 'busy' | 'free')}
                                className="ghost-select"
                            >
                                <option value="busy">Busy</option>
                                <option value="free">Free</option>
                            </select>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}

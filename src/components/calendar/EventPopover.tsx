/**
 * EventPopover — Google Calendar style click-to-preview
 *
 * Shown when clicking an event in FullCalendarView. Displays a compact
 * summary with edit/delete actions. Positioned near the clicked element.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import {
    Clock, MapPin, Trash2, Edit2, X,
    Repeat, Users, Video, AlignLeft,
    Check, HelpCircle, XCircle, Paperclip
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { getEventColor } from '../../lib/calendarConstants';
import type { CalendarEvent, RecurrenceEditMode } from '../../lib/types';
import { RecurrenceEditDialog } from '../modals/RecurrenceEditDialog';

interface EventPopoverProps {
    event: CalendarEvent;
    anchorRect: DOMRect;
    isRecurrenceInstance: boolean;
    masterEventId?: string;
    originalStart?: string;
    onClose: () => void;
    onDeleted?: (message: string, undoFn: () => void) => void;
}

export function EventPopover({
    event,
    anchorRect,
    isRecurrenceInstance,
    masterEventId,
    originalStart,
    onClose,
    onDeleted,
}: EventPopoverProps) {
    const popoverRef = useRef<HTMLDivElement>(null);
    const { openEventScheduler, deleteEvent } = useAppStore();

    // Recurrence dialog for delete
    const [recurrenceDeleteDialog, setRecurrenceDeleteDialog] = useState(false);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    // Position calculation
    const getStyle = (): React.CSSProperties => {
        const popoverWidth = 340;
        const popoverMaxHeight = 380;
        const margin = 12;

        let top = anchorRect.bottom + margin;
        let left = anchorRect.left;

        // Prevent going off right edge
        if (left + popoverWidth > window.innerWidth - margin) {
            left = window.innerWidth - popoverWidth - margin;
        }
        // Prevent going off left edge
        if (left < margin) left = margin;

        // If it would go below viewport, show above the anchor
        if (top + popoverMaxHeight > window.innerHeight - margin) {
            top = anchorRect.top - popoverMaxHeight - margin;
            if (top < margin) top = margin;
        }

        return {
            position: 'fixed',
            top,
            left,
            zIndex: 9999,
            width: popoverWidth,
        };
    };

    const color = getEventColor(event.color_id);
    const isRecurring = !!event.rrule || isRecurrenceInstance;

    const formatTime = (iso: string) => {
        return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };

    const formatDate = (iso: string) => {
        return new Date(iso).toLocaleDateString([], {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
        });
    };

    const handleEdit = () => {
        const editId = isRecurrenceInstance && masterEventId ? masterEventId : event.id;
        openEventScheduler(editId, originalStart);
        onClose();
    };

    const handleDelete = () => {
        if (isRecurring) {
            // Show the Google Calendar 3-option dialog
            setRecurrenceDeleteDialog(true);
        } else {
            // Simple delete
            performDelete('all');
        }
    };

    const performDelete = (mode: RecurrenceEditMode) => {
        const targetId = isRecurrenceInstance && masterEventId ? masterEventId : event.id;
        const title = event.title || '(No title)';

        // Store event data for undo before deleting
        const eventSnapshot = { ...event };

        deleteEvent(targetId, mode, originalStart);
        onClose();

        // Show undo toast
        onDeleted?.(`Event "${title}" deleted`, () => {
            // Undo: re-add the event
            useAppStore.getState().addEvent({
                user_id: eventSnapshot.user_id,
                title: eventSnapshot.title,
                description: eventSnapshot.description,
                start_at: eventSnapshot.start_at,
                end_at: eventSnapshot.end_at,
                is_all_day: eventSnapshot.is_all_day,
                rrule: eventSnapshot.rrule,
                parent_event_id: eventSnapshot.parent_event_id,
                recurring_event_id: eventSnapshot.recurring_event_id,
                is_deleted_instance: eventSnapshot.is_deleted_instance,
                location: eventSnapshot.location,
                color_id: eventSnapshot.color_id,
                visibility: eventSnapshot.visibility,
                transparency: eventSnapshot.transparency,
                timezone: eventSnapshot.timezone,
                attendees: eventSnapshot.attendees,
                conference_data: eventSnapshot.conference_data,
                reminders: eventSnapshot.reminders,
                attachments: eventSnapshot.attachments || [],
                google_event_id: eventSnapshot.google_event_id,
                google_calendar_id: eventSnapshot.google_calendar_id,
                deleted_at: null,
                is_unsynced: true,
            });
        });
    };

    return (
        <>
            <div ref={popoverRef} style={getStyle()} className="event-popover">
                {/* Color bar */}
                <div className="event-popover-colorbar" style={{ backgroundColor: color }} />

                {/* Header */}
                <div className="event-popover-header">
                    <div className="event-popover-title-wrap">
                        <div
                            className="event-popover-dot"
                            style={{ backgroundColor: color }}
                        />
                        <h3 className="event-popover-title">
                            {event.title || '(No title)'}
                        </h3>
                    </div>
                    <div className="event-popover-actions">
                        <button onClick={handleEdit} className="event-popover-icon-btn" title="Edit event">
                            <Edit2 size={16} />
                        </button>
                        <button onClick={handleDelete} className="event-popover-icon-btn" title="Delete event">
                            <Trash2 size={16} />
                        </button>
                        <button onClick={onClose} className="event-popover-icon-btn" title="Close">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="event-popover-body">
                    {/* Date & Time */}
                    <div className="event-popover-row">
                        <Clock size={16} className="event-popover-icon" />
                        <div>
                            <div className="event-popover-date">{formatDate(event.start_at)}</div>
                            {event.is_all_day ? (
                                <div className="event-popover-subtext">All day</div>
                            ) : (
                                <div className="event-popover-subtext">
                                    {formatTime(event.start_at)} – {formatTime(event.end_at)}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Recurring */}
                    {isRecurring && (
                        <div className="event-popover-row">
                            <Repeat size={16} className="event-popover-icon" />
                            <span>Recurring event</span>
                        </div>
                    )}

                    {/* Location */}
                    {event.location && (
                        <div className="event-popover-row">
                            <MapPin size={16} className="event-popover-icon" />
                            <span className="event-popover-text-wrap">{event.location}</span>
                        </div>
                    )}

                    {/* Conference / Meet link */}
                    {event.conference_data?.meetLink && (
                        <div className="event-popover-row">
                            <Video size={16} className="event-popover-icon" />
                            <a
                                href={event.conference_data.meetLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="event-popover-link"
                            >
                                Join with Google Meet
                            </a>
                        </div>
                    )}

                    {/* Description */}
                    {event.description && (
                        <div className="event-popover-row">
                            <AlignLeft size={16} className="event-popover-icon" />
                            <p className="event-popover-desc">{event.description}</p>
                        </div>
                    )}

                    {/* Attachments */}
                    {Array.isArray(event.attachments) && event.attachments.length > 0 && (
                        <div className="event-popover-row">
                            <Paperclip size={16} className="event-popover-icon" />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {event.attachments.map(att => (
                                    <a
                                        key={att.id}
                                        href={att.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ fontSize: 13, color: 'var(--accent, #1a73e8)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                                    >
                                        📎 {att.name}
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Attendees with RSVP */}
                    {Array.isArray(event.attendees) && event.attendees.length > 0 && (
                        <div className="event-popover-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Users size={16} className="event-popover-icon" />
                                <span>{event.attendees.length} guest{event.attendees.length !== 1 ? 's' : ''}</span>
                            </div>
                            {/* Per-attendee list */}
                            <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {event.attendees.map((a, i) => {
                                    const statusIcon = a.responseStatus === 'accepted' ? <Check size={12} color="#10B981" /> :
                                        a.responseStatus === 'declined' ? <XCircle size={12} color="#EF4444" /> :
                                        a.responseStatus === 'tentative' ? <HelpCircle size={12} color="#F59E0B" /> :
                                        <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid #9CA3AF', display: 'inline-block' }} />;
                                    return (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                            {statusIcon}
                                            <span style={{ color: 'var(--text-primary)' }}>{a.displayName || a.email}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            {/* RSVP buttons for current user */}
                            <RsvpButtons event={event} />
                        </div>
                    )}
                </div>
            </div>

            {/* Recurrence delete dialog */}
            {recurrenceDeleteDialog && (
                <RecurrenceEditDialog
                    action="delete"
                    onConfirm={(mode) => {
                        setRecurrenceDeleteDialog(false);
                        performDelete(mode);
                    }}
                    onCancel={() => setRecurrenceDeleteDialog(false)}
                />
            )}
        </>
    );
}

/** RSVP buttons — Accept / Maybe / Decline for the current user */
function RsvpButtons({ event }: { event: CalendarEvent }) {
    const { user, updateEvent } = useAppStore();
    const userEmail = user?.email;

    // Find current user in attendees list
    const selfIndex = userEmail
        ? event.attendees.findIndex(a => a.email.toLowerCase() === userEmail.toLowerCase())
        : -1;

    const currentStatus = selfIndex >= 0 ? event.attendees[selfIndex].responseStatus : undefined;

    const handleRsvp = useCallback((status: 'accepted' | 'tentative' | 'declined') => {
        if (selfIndex < 0 && !userEmail) return;

        const updatedAttendees = [...event.attendees];
        if (selfIndex >= 0) {
            updatedAttendees[selfIndex] = { ...updatedAttendees[selfIndex], responseStatus: status };
        } else if (userEmail) {
            // Add self to attendees if not already there
            updatedAttendees.push({
                email: userEmail,
                responseStatus: status,
                displayName: (user as Record<string, unknown>)?.user_metadata
                    ? ((user as Record<string, unknown>).user_metadata as Record<string, string>)?.full_name || userEmail
                    : userEmail,
            });
        }

        updateEvent(event.id, { attendees: updatedAttendees }, 'all');
    }, [event, selfIndex, userEmail, user, updateEvent]);

    // Only show RSVP buttons if the event has attendees
    if (event.attendees.length === 0) return null;

    const btnBase: React.CSSProperties = {
        flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-light)',
        fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 4, transition: 'all 0.15s ease', background: 'var(--bg-content)',
    };

    return (
        <div style={{ paddingLeft: 24, paddingTop: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                Going?{' '}
                {currentStatus && (
                    <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                        {currentStatus === 'needsAction' ? 'No response' : currentStatus}
                    </span>
                )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
                <button
                    onClick={() => handleRsvp('accepted')}
                    style={{
                        ...btnBase,
                        background: currentStatus === 'accepted' ? '#DCFCE7' : 'var(--bg-content)',
                        color: currentStatus === 'accepted' ? '#166534' : 'var(--text-secondary)',
                        borderColor: currentStatus === 'accepted' ? '#86EFAC' : 'var(--border-light)',
                    }}
                >
                    <Check size={13} /> Yes
                </button>
                <button
                    onClick={() => handleRsvp('tentative')}
                    style={{
                        ...btnBase,
                        background: currentStatus === 'tentative' ? '#FEF3C7' : 'var(--bg-content)',
                        color: currentStatus === 'tentative' ? '#92400E' : 'var(--text-secondary)',
                        borderColor: currentStatus === 'tentative' ? '#FDE68A' : 'var(--border-light)',
                    }}
                >
                    <HelpCircle size={13} /> Maybe
                </button>
                <button
                    onClick={() => handleRsvp('declined')}
                    style={{
                        ...btnBase,
                        background: currentStatus === 'declined' ? '#FEE2E2' : 'var(--bg-content)',
                        color: currentStatus === 'declined' ? '#991B1B' : 'var(--text-secondary)',
                        borderColor: currentStatus === 'declined' ? '#FCA5A5' : 'var(--border-light)',
                    }}
                >
                    <XCircle size={13} /> No
                </button>
            </div>
        </div>
    );
}

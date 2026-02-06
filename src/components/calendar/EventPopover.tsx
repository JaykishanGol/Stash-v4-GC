/**
 * EventPopover — Google Calendar style click-to-preview
 *
 * Shown when clicking an event in FullCalendarView. Displays a compact
 * summary with edit/delete actions. Positioned near the clicked element.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import {
    Clock, MapPin, Trash2, Edit2, X,
    Repeat, Users, Video, AlignLeft
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
    const { openEventScheduler, updateEvent, deleteEvent } = useAppStore();

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

                    {/* Attendees */}
                    {Array.isArray(event.attendees) && event.attendees.length > 0 && (
                        <div className="event-popover-row">
                            <Users size={16} className="event-popover-icon" />
                            <span>{event.attendees.length} guest{event.attendees.length !== 1 ? 's' : ''}</span>
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

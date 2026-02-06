import { useState } from 'react';
import { format } from 'date-fns';
import {
    X,
    MapPin,
    Clock,
    Users,
    Video,
    ExternalLink,
    Calendar,
    CheckSquare,
    AlignLeft,
    Globe
} from 'lucide-react';
import type { CalendarEntry } from '../../hooks/useGoogleCalendar';
import type { GoogleEvent, GoogleTask } from '../../lib/googleClient';

interface GoogleEventDetailProps {
    entry: CalendarEntry;
    onClose: () => void;
    onImport?: (entry: CalendarEntry) => void;
}

export function GoogleEventDetail({ entry, onClose, onImport }: GoogleEventDetailProps) {
    const [importing, setImporting] = useState(false);

    const isEvent = entry.type === 'google-event';
    const isTask = entry.type === 'google-task';
    const event = isEvent ? (entry.originalData as GoogleEvent) : null;
    const task = isTask ? (entry.originalData as GoogleTask) : null;

    const handleImport = async () => {
        if (!onImport) return;
        setImporting(true);
        try {
            onImport(entry);
        } finally {
            setImporting(false);
            onClose();
        }
    };

    const formatDateRange = () => {
        if (!entry.start) return '';

        if (entry.allDay) {
            const startStr = format(entry.start, 'EEEE, MMMM d, yyyy');
            if (entry.end && entry.end.getTime() - entry.start.getTime() > 86400000) {
                return `${startStr} — ${format(entry.end, 'EEEE, MMMM d, yyyy')}`;
            }
            return startStr;
        }

        const startStr = format(entry.start, 'EEEE, MMMM d · h:mm a');
        if (entry.end) {
            const endStr = format(entry.end, 'h:mm a');
            // Calculate duration
            const diffMs = entry.end.getTime() - entry.start.getTime();
            const diffMin = Math.round(diffMs / 60000);
            const hours = Math.floor(diffMin / 60);
            const mins = diffMin % 60;
            const durationStr = hours > 0
                ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`)
                : `${mins}m`;

            return `${startStr} – ${endStr} (${durationStr})`;
        }
        return startStr;
    };

    const getStatusBadge = () => {
        if (isTask && task) {
            return task.status === 'completed'
                ? { label: 'Completed', color: '#10B981', bg: '#D1FAE5' }
                : { label: 'Pending', color: '#F59E0B', bg: '#FEF3C7' };
        }
        if (event?.status === 'tentative') {
            return { label: 'Tentative', color: '#F59E0B', bg: '#FEF3C7' };
        }
        return { label: 'Confirmed', color: '#10B981', bg: '#D1FAE5' };
    };

    const statusBadge = getStatusBadge();

    return (
        <div className="google-event-overlay" onClick={onClose}>
            <div className="google-event-detail" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="ged-header">
                    <div className="ged-header-left">
                        <div className="ged-color-bar" style={{ background: entry.color || '#4285F4' }} />
                        <div className="ged-header-info">
                            <span className="ged-source-badge">
                                <Globe size={12} />
                                {isEvent ? 'Google Calendar' : 'Google Tasks'}
                            </span>
                            <h2 className="ged-title">{entry.title}</h2>
                        </div>
                    </div>
                    <button className="ged-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="ged-body">
                    {/* Status Badge */}
                    <div className="ged-status-row">
                        <span
                            className="ged-status-badge"
                            style={{ color: statusBadge.color, background: statusBadge.bg }}
                        >
                            {isTask ? <CheckSquare size={12} /> : <Calendar size={12} />}
                            {statusBadge.label}
                        </span>
                    </div>

                    {/* Date/Time */}
                    <div className="ged-row">
                        <Clock size={16} className="ged-icon" />
                        <span className="ged-row-text">{formatDateRange()}</span>
                    </div>

                    {/* Location */}
                    {entry.location && (
                        <div className="ged-row">
                            <MapPin size={16} className="ged-icon" />
                            <a
                                className="ged-row-link"
                                href={`https://maps.google.com/?q=${encodeURIComponent(entry.location)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {entry.location}
                            </a>
                        </div>
                    )}

                    {/* Google Meet Link */}
                    {entry.meetLink && (
                        <div className="ged-row ged-meet-row">
                            <Video size={16} className="ged-icon" style={{ color: '#00897B' }} />
                            <a
                                className="ged-meet-link"
                                href={entry.meetLink}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Join with Google Meet
                                <ExternalLink size={12} />
                            </a>
                        </div>
                    )}

                    {/* Description */}
                    {entry.description && (
                        <div className="ged-row ged-description-row">
                            <AlignLeft size={16} className="ged-icon" />
                            <div
                                className="ged-description"
                                dangerouslySetInnerHTML={{
                                    __html: entry.description
                                        .replace(/\n/g, '<br/>')
                                        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
                                }}
                            />
                        </div>
                    )}

                    {/* Attendees */}
                    {entry.attendees && entry.attendees.length > 0 && (
                        <div className="ged-row ged-attendees-row">
                            <Users size={16} className="ged-icon" />
                            <div className="ged-attendees">
                                <span className="ged-attendees-count">
                                    {entry.attendees.length} guest{entry.attendees.length > 1 ? 's' : ''}
                                </span>
                                <div className="ged-attendees-list">
                                    {entry.attendees.slice(0, 10).map((a, i) => (
                                        <div key={i} className="ged-attendee">
                                            <div className="ged-attendee-avatar">
                                                {a.email[0].toUpperCase()}
                                            </div>
                                            <span className="ged-attendee-email">{a.email}</span>
                                            {a.responseStatus && (
                                                <span className={`ged-rsvp ${a.responseStatus}`}>
                                                    {a.responseStatus === 'accepted' ? '✓' :
                                                     a.responseStatus === 'declined' ? '✗' :
                                                     a.responseStatus === 'tentative' ? '?' : '·'}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                    {entry.attendees.length > 10 && (
                                        <span className="ged-attendees-more">
                                            +{entry.attendees.length - 10} more
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="ged-footer">
                    {entry.htmlLink && (
                        <a
                            className="ged-action-btn secondary"
                            href={entry.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <ExternalLink size={14} />
                            Open in Google
                        </a>
                    )}
                    {onImport && (
                        <button
                            className="ged-action-btn primary"
                            onClick={handleImport}
                            disabled={importing}
                        >
                            {importing ? 'Importing...' : 'Import to Stash'}
                        </button>
                    )}
                </div>

                <style>{`
                    .google-event-overlay {
                        position: fixed;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.4);
                        backdrop-filter: blur(4px);
                        z-index: 9999;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 16px;
                    }

                    .google-event-detail {
                        background: white;
                        border-radius: 16px;
                        width: 100%;
                        max-width: 480px;
                        max-height: 85vh;
                        overflow: hidden;
                        display: flex;
                        flex-direction: column;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.2);
                        animation: gedSlideUp 0.25s ease-out;
                    }

                    @keyframes gedSlideUp {
                        from { transform: translateY(20px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }

                    .ged-header {
                        display: flex;
                        align-items: flex-start;
                        justify-content: space-between;
                        padding: 20px 20px 16px;
                        border-bottom: 1px solid #F3F4F6;
                    }

                    .ged-header-left {
                        display: flex;
                        gap: 12px;
                        flex: 1;
                        min-width: 0;
                    }

                    .ged-color-bar {
                        width: 4px;
                        border-radius: 2px;
                        flex-shrink: 0;
                        min-height: 40px;
                    }

                    .ged-header-info {
                        flex: 1;
                        min-width: 0;
                    }

                    .ged-source-badge {
                        display: inline-flex;
                        align-items: center;
                        gap: 4px;
                        font-size: 11px;
                        font-weight: 600;
                        color: #4285F4;
                        text-transform: uppercase;
                        letter-spacing: 0.3px;
                        margin-bottom: 4px;
                    }

                    .ged-title {
                        margin: 0;
                        font-size: 1.2rem;
                        font-weight: 600;
                        color: #111827;
                        line-height: 1.3;
                    }

                    .ged-close {
                        background: none;
                        border: none;
                        color: #9CA3AF;
                        cursor: pointer;
                        padding: 4px;
                        border-radius: 6px;
                        flex-shrink: 0;
                    }
                    .ged-close:hover { background: #F3F4F6; color: #4B5563; }

                    .ged-body {
                        padding: 16px 20px;
                        overflow-y: auto;
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }

                    .ged-status-row {
                        display: flex;
                        gap: 8px;
                    }

                    .ged-status-badge {
                        display: inline-flex;
                        align-items: center;
                        gap: 4px;
                        padding: 4px 10px;
                        border-radius: 12px;
                        font-size: 12px;
                        font-weight: 600;
                    }

                    .ged-row {
                        display: flex;
                        align-items: flex-start;
                        gap: 12px;
                        padding: 4px 0;
                    }

                    .ged-icon {
                        color: #6B7280;
                        flex-shrink: 0;
                        margin-top: 2px;
                    }

                    .ged-row-text {
                        font-size: 14px;
                        color: #374151;
                        line-height: 1.5;
                    }

                    .ged-row-link {
                        font-size: 14px;
                        color: #2563EB;
                        text-decoration: none;
                        word-break: break-word;
                    }
                    .ged-row-link:hover { text-decoration: underline; }

                    .ged-meet-link {
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        color: #00897B;
                        font-weight: 500;
                        font-size: 14px;
                        text-decoration: none;
                        padding: 6px 12px;
                        background: #E0F2F1;
                        border-radius: 8px;
                    }
                    .ged-meet-link:hover { background: #B2DFDB; }

                    .ged-description {
                        font-size: 14px;
                        color: #4B5563;
                        line-height: 1.6;
                        word-break: break-word;
                    }
                    .ged-description a { color: #2563EB; }

                    .ged-attendees {
                        flex: 1;
                    }

                    .ged-attendees-count {
                        font-size: 13px;
                        font-weight: 600;
                        color: #374151;
                        display: block;
                        margin-bottom: 8px;
                    }

                    .ged-attendees-list {
                        display: flex;
                        flex-direction: column;
                        gap: 6px;
                    }

                    .ged-attendee {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }

                    .ged-attendee-avatar {
                        width: 24px;
                        height: 24px;
                        border-radius: 50%;
                        background: #E5E7EB;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 11px;
                        font-weight: 600;
                        color: #6B7280;
                        flex-shrink: 0;
                    }

                    .ged-attendee-email {
                        font-size: 13px;
                        color: #4B5563;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }

                    .ged-rsvp {
                        font-size: 12px;
                        font-weight: 700;
                        flex-shrink: 0;
                    }
                    .ged-rsvp.accepted { color: #10B981; }
                    .ged-rsvp.declined { color: #EF4444; }
                    .ged-rsvp.tentative { color: #F59E0B; }
                    .ged-rsvp.needsAction { color: #9CA3AF; }

                    .ged-attendees-more {
                        font-size: 12px;
                        color: #9CA3AF;
                        margin-top: 4px;
                    }

                    .ged-footer {
                        display: flex;
                        gap: 8px;
                        padding: 16px 20px;
                        border-top: 1px solid #F3F4F6;
                        background: #FAFAFA;
                    }

                    .ged-action-btn {
                        flex: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        padding: 10px 16px;
                        border-radius: 8px;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        border: none;
                        text-decoration: none;
                        transition: all 0.15s;
                    }

                    .ged-action-btn.primary {
                        background: #111827;
                        color: white;
                    }
                    .ged-action-btn.primary:hover { background: #000; }
                    .ged-action-btn.primary:disabled { opacity: 0.6; cursor: not-allowed; }

                    .ged-action-btn.secondary {
                        background: white;
                        color: #374151;
                        border: 1px solid #E5E7EB;
                    }
                    .ged-action-btn.secondary:hover { background: #F3F4F6; }

                    @media (max-width: 480px) {
                        .google-event-overlay { align-items: flex-end; padding: 0; }
                        .google-event-detail {
                            border-radius: 16px 16px 0 0;
                            max-height: 90vh;
                        }
                    }
                `}</style>
            </div>
        </div>
    );
}

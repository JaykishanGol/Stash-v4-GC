import { useState, useRef, useEffect } from 'react';
import { Bell, Check, Trash2, X, CheckCircle, Info, AlertTriangle, XCircle, Zap } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export function NotificationCenter() {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const {
        notifications,
        markNotificationRead,
        markAllNotificationsRead,
        clearNotifications
    } = useAppStore();

    const unreadCount = notifications.filter(n => !n.read).length;

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const sendTestNotification = async () => {
        if (!('Notification' in window)) return;

        let permission = Notification.permission;
        if (permission === 'default') {
            permission = await Notification.requestPermission();
        }

        if (permission === 'granted') {
            const title = "Test Notification";
            const options = {
                body: "This is a test notification from Stash.",
                icon: '/vite.svg',
                tag: 'test-notification-' + Date.now()
            };

            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(registration => {
                    registration.showNotification(title, options);
                });
            } else {
                new Notification(title, options);
            }
        } else {
            alert('Notifications are blocked. Please enable them in your browser settings.');
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'success': return <CheckCircle size={16} style={{ color: '#10B981' }} />;
            case 'error': return <XCircle size={16} style={{ color: '#EF4444' }} />;
            case 'warning': return <AlertTriangle size={16} style={{ color: '#F59E0B' }} />;
            default: return <Info size={16} style={{ color: '#3B82F6' }} />;
        }
    };

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const handleNotificationClick = (notification: any) => {
        markNotificationRead(notification.id);
        
        // Try to navigate if there's context
        // We look for entity info in the message or data (if we added structured data support)
        // Since we don't have structured data in local notifications yet, we'll try to find items by title for now, 
        // or just rely on the user manually navigating. 
        // Ideally, we'd add `data: { entityId: ... }` to `addNotification`.
        
        // For now, just toggling the dropdown is good UX
        setIsOpen(false);
    };

    return (
        <div
            className="notification-center"
            ref={dropdownRef}
            style={{ position: 'relative' }}
        >
            {/* Bell Button */}
            <button
                className="notification-bell"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    position: 'relative',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 8,
                    borderRadius: 8,
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                }}
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 16,
                        height: 16,
                        background: '#EF4444',
                        color: 'white',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: 360,
                    maxHeight: 480,
                    background: 'white',
                    borderRadius: 12,
                    boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                    border: '1px solid var(--border-light)',
                    overflow: 'hidden',
                    zIndex: 9999,
                }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border-light)',
                    }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            Notifications
                            {unreadCount > 0 && (
                                <span style={{
                                    marginLeft: 8,
                                    fontSize: '0.75rem',
                                    color: 'var(--text-muted)',
                                    fontWeight: 400
                                }}>
                                    {unreadCount} unread
                                </span>
                            )}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button
                                onClick={sendTestNotification}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: 4,
                                    color: 'var(--text-muted)',
                                    borderRadius: 4,
                                }}
                                title="Test Notification"
                            >
                                <Zap size={16} />
                            </button>
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllNotificationsRead}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: 4,
                                        color: 'var(--text-muted)',
                                        borderRadius: 4,
                                    }}
                                    title="Mark all as read"
                                >
                                    <Check size={16} />
                                </button>
                            )}
                            {notifications.length > 0 && (
                                <button
                                    onClick={clearNotifications}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: 4,
                                        color: 'var(--text-muted)',
                                        borderRadius: 4,
                                    }}
                                    title="Clear all"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                            <button
                                onClick={() => setIsOpen(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: 4,
                                    color: 'var(--text-muted)',
                                    borderRadius: 4,
                                }}
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Notifications List */}
                    <div style={{
                        maxHeight: 400,
                        overflowY: 'auto',
                        padding: notifications.length === 0 ? 0 : '8px',
                    }}>
                        {notifications.length === 0 ? (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '40px 20px',
                                color: 'var(--text-muted)',
                            }}>
                                <Bell size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
                                <span style={{ fontSize: '0.875rem' }}>No notifications yet</span>
                            </div>
                        ) : (
                            notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    onClick={() => handleNotificationClick(notification)}
                                    style={{
                                        display: 'flex',
                                        gap: 12,
                                        padding: '10px 12px',
                                        borderRadius: 8,
                                        background: notification.read ? 'transparent' : 'rgba(245, 158, 11, 0.08)',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s ease',
                                        marginBottom: 4,
                                    }}
                                >
                                    <div style={{ flexShrink: 0, marginTop: 2 }}>
                                        {getIcon(notification.type)}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            marginBottom: 2,
                                        }}>
                                            <span style={{
                                                fontWeight: notification.read ? 500 : 600,
                                                fontSize: '0.8125rem',
                                                color: 'var(--text-primary)',
                                            }}>
                                                {notification.title}
                                            </span>
                                            <span style={{
                                                fontSize: '0.7rem',
                                                color: 'var(--text-muted)',
                                                flexShrink: 0,
                                                marginLeft: 8,
                                            }}>
                                                {formatTime(notification.timestamp)}
                                            </span>
                                        </div>
                                        <p style={{
                                            fontSize: '0.75rem',
                                            color: 'var(--text-secondary)',
                                            margin: 0,
                                            lineHeight: 1.4,
                                        }}>
                                            {notification.message}
                                        </p>
                                    </div>
                                    {!notification.read && (
                                        <div style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            background: 'var(--accent)',
                                            flexShrink: 0,
                                            marginTop: 4,
                                        }} />
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

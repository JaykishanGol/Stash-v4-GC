import { useState, useEffect } from 'react';
import { Check, Pin, Calendar, Bell, CloudOff } from 'lucide-react';
import type { Item } from '../../lib/types';
import { useAppStore } from '../../store/useAppStore';
import { supabase, STORAGE_BUCKET } from '../../lib/supabase';
import { formatFileSize } from '../../lib/utils';

// ---- Date/Time indicator for due dates and reminders ----
export function DateTimeIndicator({ item }: { item: Item }) {
    const now = new Date();
    const scheduledDate = item.scheduled_at ? new Date(item.scheduled_at) : null;
    const reminderDate = scheduledDate && item.remind_before
        ? new Date(scheduledDate.getTime() - item.remind_before * 60 * 1000)
        : null;

    if (!scheduledDate && !reminderDate) return null;

    const formatDateTime = (date: Date): string => {
        const isToday = date.toDateString() === now.toDateString();
        const isTomorrow = date.toDateString() === new Date(now.getTime() + 86400000).toDateString();
        const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

        if (isToday) return `Today, ${timeStr}`;
        if (isTomorrow) return `Tomorrow, ${timeStr}`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${timeStr}`;
    };

    const isOverdue = scheduledDate && scheduledDate < now && !item.is_completed;

    return (
        <div className="date-indicator-row">
            {scheduledDate && (
                <div className={`date-indicator ${isOverdue ? 'overdue' : ''}`}>
                    <Calendar size={12} />
                    <span>{formatDateTime(scheduledDate)}</span>
                </div>
            )}
            {reminderDate && (
                <div className="date-indicator reminder">
                    <Bell size={12} />
                    <span>{formatDateTime(reminderDate)}</span>
                </div>
            )}
        </div>
    );
}

// ---- Pin Indicator ----
export function PinIndicator({ isPinned }: { isPinned: boolean }) {
    if (!isPinned) return null;
    return (
        <div className="card-pin-indicator">
            <Pin size={12} />
        </div>
    );
}

// ---- Sync Status Indicator ----
export function SyncStatusIndicator({ isUnsynced }: { isUnsynced?: boolean }) {
    if (!isUnsynced) return null;
    return (
        <div className="card-sync-indicator" title="Pending sync">
            <CloudOff size={12} />
        </div>
    );
}

// ---- Tags Display ----
export function TagsDisplay({ tags }: { tags: string[] }) {
    if (!tags || tags.length === 0) return null;
    return (
        <div className="card-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, padding: '0 12px' }}>
            {tags.slice(0, 3).map(tag => (
                <span key={tag} className="tag-chip" style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    borderRadius: 12,
                    color: '#3B82F6',
                    fontWeight: 500
                }}>
                    #{tag}
                </span>
            ))}
            {tags.length > 3 && (
                <span className="tag-chip" style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    background: 'rgba(0,0,0,0.05)',
                    borderRadius: 12,
                    color: 'var(--text-muted)'
                }}>
                    +{tags.length - 3}
                </span>
            )}
        </div>
    );
}

// ---- Selection Checkbox ----
export function SelectionCheckbox({ isSelected, onClick }: { isSelected: boolean, onClick: (e: React.MouseEvent) => void }) {
    return (
        <div
            className={`selection-checkbox ${isSelected ? 'checked' : ''}`}
            onClick={onClick}
            style={{
                position: 'absolute',
                top: 8,
                left: 8,
                zIndex: 20,
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: '2px solid rgba(0,0,0,0.2)',
                background: isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.8)',
                borderColor: isSelected ? 'var(--primary)' : 'rgba(0,0,0,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'white',
                opacity: isSelected ? 1 : 0,
                transition: 'all 0.2s ease',
            }}
        >
            {isSelected && <Check size={12} strokeWidth={3} />}
        </div>
    );
}

// ---- File Type Icon ----
export function getFileExtension(filename: string, mime?: string): string {
    if (filename) {
        return filename.split('.').pop()?.toLowerCase() || '';
    }
    if (mime) {
        if (mime.includes('pdf')) return 'pdf';
        if (mime.includes('word') || mime.includes('document')) return 'doc';
        if (mime.includes('spreadsheet') || mime.includes('excel')) return 'xls';
        if (mime.includes('presentation') || mime.includes('powerpoint')) return 'ppt';
    }
    return '';
}

export function FileTypeIcon({ extension }: { extension: string }) {
    const iconConfig: Record<string, { color: string; label: string; bg: string }> = {
        pdf: { color: '#DC2626', label: 'PDF', bg: '#FEE2E2' },
        doc: { color: '#2563EB', label: 'DOC', bg: '#DBEAFE' },
        docx: { color: '#2563EB', label: 'DOC', bg: '#DBEAFE' },
        xls: { color: '#16A34A', label: 'XLS', bg: '#DCFCE7' },
        xlsx: { color: '#16A34A', label: 'XLS', bg: '#DCFCE7' },
        ppt: { color: '#EA580C', label: 'PPT', bg: '#FED7AA' },
        pptx: { color: '#EA580C', label: 'PPT', bg: '#FED7AA' },
        zip: { color: '#7C3AED', label: 'ZIP', bg: '#EDE9FE' },
        rar: { color: '#7C3AED', label: 'RAR', bg: '#EDE9FE' },
        txt: { color: '#6B7280', label: 'TXT', bg: '#F3F4F6' },
        csv: { color: '#16A34A', label: 'CSV', bg: '#DCFCE7' },
    };

    const config = iconConfig[extension] || { color: '#6B7280', label: extension.toUpperCase() || 'FILE', bg: '#F3F4F6' };

    return (
        <div style={{
            width: 48,
            height: 48,
            background: config.bg,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            marginBottom: 12,
            border: `1px solid ${config.color}20`,
        }}>
            <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
                <path d="M12 0H2C0.9 0 0 0.9 0 2V22C0 23.1 0.9 24 2 24H18C19.1 24 20 23.1 20 22V8L12 0Z" fill={config.bg} stroke={config.color} strokeWidth="1" />
                <path d="M12 0V8H20" fill={config.bg} stroke={config.color} strokeWidth="1" />
            </svg>
            <span style={{ fontSize: '0.55rem', fontWeight: 700, color: config.color, marginTop: 2 }}>{config.label}</span>
        </div>
    );
}

// ---- Color class mapper ----
export function getCardColorClass(bgColor: string): string {
    const colorMap: Record<string, string> = {
        '#FFFFFF': 'card-default',
        '#FFB5A7': 'card-coral',
        '#FDE68A': 'card-yellow',
        '#BFDBFE': 'card-blue',
        '#FBCFE8': 'card-pink',
        '#86EFAC': 'card-green',
        '#DDD6FE': 'card-purple',
        '#99F6E4': 'card-teal',
        '#E0E7FF': 'card-file',
        '#FEF3C7': 'card-image',
        '#FFFBEB': 'card-folder',
    };
    return colorMap[bgColor] || 'card-default';
}

// ---- Signed URL Cache + SecureImage ----
const CACHE_MAX_SIZE = 200;
const signedUrlCache = new Map<string, { url: string; expiry: number }>();

/** Evict expired + enforce max size (LRU-style: oldest entries first) */
function pruneCache() {
    const now = Date.now();
    // Remove expired
    for (const [key, entry] of signedUrlCache) {
        if (entry.expiry <= now) signedUrlCache.delete(key);
    }
    // If still over limit, drop oldest (Map iteration order = insertion order)
    if (signedUrlCache.size > CACHE_MAX_SIZE) {
        const excess = signedUrlCache.size - CACHE_MAX_SIZE;
        const keys = signedUrlCache.keys();
        for (let i = 0; i < excess; i++) {
            const { value } = keys.next();
            if (value) signedUrlCache.delete(value);
        }
    }
}

/** Clear the signed URL cache (called on sign out) */
export function clearSignedUrlCache() {
    signedUrlCache.clear();
}

export function SecureImage({ path, alt, style }: { path: string; alt: string; style?: React.CSSProperties }) {
    const user = useAppStore((s) => s.user);
    const [src, setSrc] = useState<string | null>(() => {
        if (!path) return null;
        if (path.startsWith('http') || path.startsWith('blob:')) return path;
        const cached = signedUrlCache.get(path);
        if (cached && cached.expiry > Date.now()) return cached.url;
        return null;
    });

    useEffect(() => {
        if (!path) return;
        if (path.startsWith('http') || path.startsWith('blob:')) {
            setSrc(path);
            return;
        }

        if (!user || user.id === 'demo') {
            return;
        }

        const cached = signedUrlCache.get(path);
        if (cached && cached.expiry > Date.now()) {
            setSrc(cached.url);
            return;
        }

        let isMounted = true;
        supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600, {
            transform: { width: 300, height: 300, resize: 'cover' }
        }).then(({ data }) => {
            if (isMounted && data?.signedUrl) {
                signedUrlCache.set(path, { url: data.signedUrl, expiry: Date.now() + 50 * 60 * 1000 });
                pruneCache();
                setSrc(data.signedUrl);
            } else {
                const { data: publicData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path, {
                    transform: { width: 300, height: 300, resize: 'cover' }
                });
                if (isMounted) {
                    signedUrlCache.set(path, { url: publicData.publicUrl, expiry: Date.now() + 50 * 60 * 1000 });
                    pruneCache();
                    setSrc(publicData.publicUrl);
                }
            }
        });

        return () => { isMounted = false; };
    }, [path, user]);

    const effectiveSrc = (path && path.startsWith('http')) ? path : src;
    if (!effectiveSrc) return <div style={{ ...style, background: '#f5f5f5' }} />;
    return <img src={effectiveSrc} alt={alt} style={style} loading="lazy" decoding="async" />;
}

// ---- Shared card event types ----
export interface CardEventProps {
    isSelected: boolean;
    isCut: boolean;
    onClick: (e: React.MouseEvent) => void;
    onDoubleClick: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onDragStart: (e: React.DragEvent) => void;
    compact?: boolean;
    hideControls?: boolean;
    variant?: 'masonry' | 'grid';
    gridStyles?: React.CSSProperties;
}

// ---- Format file size (re-export) ----
export { formatFileSize };

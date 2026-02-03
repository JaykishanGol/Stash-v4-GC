import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { GripVertical, StickyNote, FileText, Image, Link2, FolderClosed } from 'lucide-react';

export function UnscheduledSidebar() {
    const { items } = useAppStore();

    const [filter, setFilter] = useState<'note' | 'file' | 'image' | 'link' | 'folder'>('note');

    // Counts for debugging and UX
    const counts = {
        note: items.filter(i => i.type === 'note' && !i.deleted_at).length,
        file: items.filter(i => i.type === 'file' && !i.deleted_at).length,
        image: items.filter(i => i.type === 'image' && !i.deleted_at).length,
        link: items.filter(i => i.type === 'link' && !i.deleted_at).length,
        folder: items.filter(i => i.type === 'folder' && !i.deleted_at).length,
    };

    // Get items based on filter type (Show ALL items, including completed)
    const filteredItems = items.filter(item => {
        if (item.deleted_at) return false;
        return item.type === filter;
    });

    return (
        <div className="unscheduled-sidebar" style={{
            width: 340,
            borderLeft: '1px solid var(--border-light)',
            background: 'var(--bg-sidebar)',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--border-light)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px 0', letterSpacing: '-0.02em' }}>Library</h3>

                {/* Segmented Control Filters - Icon Only for cleaner look + Badges */}
                <div style={{
                    display: 'flex',
                    padding: 4,
                    background: 'var(--bg-app)',
                    borderRadius: 10,
                    border: '1px solid var(--border-light)',
                    gap: 2
                }}>
                    {(['note', 'file', 'image', 'link', 'folder'] as const).map((f) => {
                        const Icon = f === 'note' ? StickyNote :
                            f === 'file' ? FileText :
                                f === 'image' ? Image :
                                    f === 'link' ? Link2 : FolderClosed;

                        return (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                title={f.charAt(0).toUpperCase() + f.slice(1)}
                                style={{
                                    flex: 1,
                                    height: 36,
                                    padding: 0,
                                    borderRadius: 7,
                                    border: 'none',
                                    background: filter === f ? 'var(--bg-content)' : 'transparent',
                                    color: filter === f ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    boxShadow: filter === f ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    position: 'relative'
                                }}
                            >
                                <Icon size={16} />
                                {counts[f] > 0 && (
                                    <span style={{
                                        position: 'absolute',
                                        top: 8,
                                        right: 8,
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        background: filter === f ? 'var(--accent)' : 'var(--text-muted)',
                                        opacity: filter === f ? 1 : 0.4
                                    }} />
                                )}
                            </button>
                        );
                    })}
                </div>
                <div style={{
                    textAlign: 'center',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    marginTop: 8,
                    fontWeight: 500
                }}>
                    Showing {filter.charAt(0).toUpperCase() + filter.slice(1)}s ({counts[filter]})
                </div>
            </div>

            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
            }}>
                {filteredItems.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <GripVertical size={20} style={{ opacity: 0.3 }} />
                        </div>
                        <span style={{ fontSize: '0.9rem' }}>No {filter}s found</span>
                    </div>
                ) : (
                    filteredItems.map(item => (
                        <div
                            key={item.id}
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', item.id);
                                e.currentTarget.style.opacity = '0.5';
                            }}
                            onDragEnd={(e) => {
                                e.currentTarget.style.opacity = '1';
                            }}
                            className="draggable-card-item"
                            style={{
                                cursor: 'grab',
                                background: 'var(--bg-content)',
                                padding: '10px 12px',
                                borderRadius: '10px',
                                border: '1px solid var(--border-light)',
                                boxShadow: 'var(--shadow-xs)',
                                transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12
                            }}
                        >
                            <GripVertical size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />

                            <div style={{
                                width: 32, height: 32, borderRadius: 8,
                                background:
                                    item.type === 'note' ? '#FEF2F2' :
                                        item.type === 'file' ? '#EFF6FF' :
                                            item.type === 'image' ? '#FFFBEB' : '#F5F3FF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                border: `1px solid ${item.type === 'note' ? '#FEE2E2' :
                                    item.type === 'file' ? '#DBEAFE' :
                                        item.type === 'image' ? '#FEF3C7' : '#EDE9FE'
                                    }`
                            }}>
                                <div style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background:
                                        item.type === 'note' ? '#F87171' :
                                            item.type === 'file' ? '#60A5FA' :
                                                item.type === 'image' ? '#FBBF24' : '#A78BFA'
                                }} />
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: '0.85rem',
                                    color: 'var(--text-primary)',
                                    fontWeight: 500,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}>
                                    {item.title}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                    {item.type}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            <style>{`
                .draggable-card-item:hover {
                    box-shadow: var(--shadow-md);
                    transform: translateY(-2px);
                    border-color: var(--border-medium);
                }
                .draggable-card-item:active {
                    cursor: grabbing;
                    transform: scale(0.98);
                }
            `}</style>
        </div>
    );
}

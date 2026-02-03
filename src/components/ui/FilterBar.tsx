import {
    StickyNote,
    Link2,
    FileText,
    Image,
    FolderClosed,
    Flag,
    X
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { ItemType, PriorityLevel } from '../../lib/types';

const TYPE_OPTIONS: { type: ItemType | null; icon: React.ReactNode; label: string }[] = [
    { type: null, icon: null, label: 'All' },
    { type: 'note', icon: <StickyNote size={14} />, label: 'Notes' },
    { type: 'link', icon: <Link2 size={14} />, label: 'Links' },
    { type: 'file', icon: <FileText size={14} />, label: 'Files' },
    { type: 'image', icon: <Image size={14} />, label: 'Images' },
    { type: 'folder', icon: <FolderClosed size={14} />, label: 'Folders' },
];

const PRIORITY_OPTIONS: { priority: PriorityLevel | null; color: string; label: string }[] = [
    { priority: 'high', color: '#EF4444', label: 'High' },
    { priority: 'medium', color: '#F59E0B', label: 'Medium' },
    { priority: 'low', color: '#10B981', label: 'Low' },
];

export function FilterBar() {
    const { filters, setFilter, clearFilters, searchQuery } = useAppStore();

    const hasActiveFilters = filters.type !== null || filters.priority !== null || searchQuery;

    return (
        <div className="filter-bar">
            {/* Type Filters */}
            {TYPE_OPTIONS.map((option) => (
                <button
                    key={option.type || 'all'}
                    className={`filter-pill ${filters.type === option.type ? 'active' : ''}`}
                    onClick={() => setFilter('type', option.type === filters.type ? null : option.type)}
                >
                    {option.icon}
                    <span>{option.label}</span>
                </button>
            ))}

            <div className="filter-divider" style={{
                width: 1,
                height: 24,
                background: '#E5E7EB',
                margin: '0 4px'
            }} />

            {/* Priority Filters */}
            {PRIORITY_OPTIONS.map((option) => (
                <button
                    key={option.priority}
                    className={`filter-pill ${filters.priority === option.priority ? 'active' : ''}`}
                    onClick={() => setFilter('priority', option.priority === filters.priority ? null : option.priority)}
                    style={{
                        '--filter-color': option.color,
                    } as React.CSSProperties}
                >
                    <Flag size={14} style={{ color: option.color }} />
                    <span>{option.label}</span>
                </button>
            ))}

            {/* Clear All Button */}
            {hasActiveFilters && (
                <button
                    className="filter-pill filter-clear"
                    onClick={clearFilters}
                >
                    <X size={14} />
                    <span>Clear</span>
                </button>
            )}
        </div>
    );
}

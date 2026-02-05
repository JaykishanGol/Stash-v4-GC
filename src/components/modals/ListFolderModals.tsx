import { useState } from 'react';
import { X } from 'lucide-react';

// List Modal Component (Create / Edit)
export interface ListModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (name: string, color: string) => void;
    initialData?: { name: string; color: string };
    title?: string;
    submitLabel?: string;
}

const LIST_COLORS = [
    '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
    '#8B5CF6', '#EC4899', '#14B8A6', '#6366F1'
];

export function ListModal({ isOpen, onClose, onSubmit, initialData, title = 'New List', submitLabel = 'Create List' }: ListModalProps) {
    return (
        <ListModalContent
            key={isOpen ? 'open' : 'closed'}
            isOpen={isOpen}
            onClose={onClose}
            onSubmit={onSubmit}
            initialData={initialData}
            title={title}
            submitLabel={submitLabel}
        />
    );
}

function ListModalContent({ isOpen, onClose, onSubmit, initialData, title, submitLabel }: ListModalProps) {
    const [name, setName] = useState(initialData?.name || '');
    const [color, setColor] = useState(initialData?.color || LIST_COLORS[0]);

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (name.trim()) {
            onSubmit(name.trim(), color);
        }
    };

    return (
        <div className="modal-overlay active" onClick={onClose}>
            <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">{title}</h2>
                    <button className="modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    <div style={{ marginBottom: 16 }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#6B7280',
                            marginBottom: 8,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            List Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter list name..."
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                fontSize: '0.9375rem',
                                border: '2px solid #E5E7EB',
                                borderRadius: 10,
                                outline: 'none',
                                fontFamily: 'inherit',
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#F59E0B'}
                            onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                            autoFocus
                        />
                    </div>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#6B7280',
                            marginBottom: 8,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            Color
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {LIST_COLORS.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => setColor(c)}
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 10,
                                        backgroundColor: c,
                                        border: color === c ? '3px solid #1F2937' : '3px solid transparent',
                                        cursor: 'pointer',
                                        transition: 'transform 0.15s',
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                />
                            ))}
                        </div>
                    </div>
                </div>
                <div className="modal-footer">
                    <button onClick={onClose} className="btn btn-secondary">Cancel</button>
                    <button onClick={handleSubmit} className="btn btn-primary">{submitLabel}</button>
                </div>
            </div>
        </div>
    );
}

export interface NewFolderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (name: string) => void;
}

export function NewFolderModal({ isOpen, onClose, onSubmit }: NewFolderModalProps) {
    const [name, setName] = useState('');

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (name.trim()) {
            onSubmit(name.trim());
            setName('');
            onClose();
        }
    };

    return (
        <div className="modal-overlay active" onClick={onClose}>
            <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">New Folder</h2>
                    <button className="modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    <div style={{ marginBottom: 16 }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#6B7280',
                            marginBottom: 8,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            Folder Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter folder name..."
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                fontSize: '0.9375rem',
                                border: '2px solid #E5E7EB',
                                borderRadius: 10,
                                outline: 'none',
                                fontFamily: 'inherit',
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#F59E0B'}
                            onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                            autoFocus
                        />
                    </div>
                </div>
                <div className="modal-footer">
                    <button onClick={onClose} className="btn btn-secondary">Cancel</button>
                    <button onClick={handleSubmit} className="btn btn-primary">Create Folder</button>
                </div>
            </div>
        </div>
    );
}

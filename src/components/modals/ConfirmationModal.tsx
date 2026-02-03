import { X, AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isDanger?: boolean;
}

export function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    isDanger = false
}: ConfirmationModalProps) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay active" onClick={onClose}>
            <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {isDanger && <AlertTriangle size={20} color="#EF4444" />}
                        {title}
                    </h2>
                    <button className="modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body" style={{ padding: '20px 24px', color: '#4B5563', lineHeight: 1.5 }}>
                    {message}
                </div>
                <div className="modal-footer" style={{
                    padding: '16px 20px',
                    borderTop: '1px solid #E5E7EB',
                    display: 'flex',
                    gap: 12,
                    justifyContent: 'flex-end'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 16px',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            color: '#374151',
                            background: 'white',
                            border: '1px solid #D1D5DB',
                            borderRadius: 6,
                            cursor: 'pointer',
                        }}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={() => { onConfirm(); onClose(); }}
                        style={{
                            padding: '10px 16px',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            color: 'white',
                            background: isDanger ? '#EF4444' : '#3B82F6',
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

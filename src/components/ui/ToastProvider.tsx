import { useState, useCallback } from 'react';
import { Check, X, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { ToastContext, type ToastType } from './toast-context';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
    undoAction?: () => void;
    actionLabel?: string;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    // FIXED: Must be defined BEFORE showToast that uses it
    const dismissToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const showToast = useCallback((
        message: string,
        type: ToastType = 'info',
        options?: { duration?: number; undoAction?: () => void; actionLabel?: string }
    ) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const duration = options?.duration ?? 4000;

        setToasts(prev => [...prev, { 
            id, type, message, duration, 
            undoAction: options?.undoAction,
            actionLabel: options?.actionLabel 
        }]);

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                dismissToast(id);
            }, duration);
        }
    }, [dismissToast]);

    const handleUndo = useCallback((toast: Toast) => {
        if (toast.undoAction) {
            toast.undoAction();
        }
        dismissToast(toast.id);
    }, [dismissToast]);

    const getIcon = (type: ToastType) => {
        switch (type) {
            case 'success': return <Check size={14} />;
            case 'error': return <AlertCircle size={14} />;
            case 'warning': return <AlertTriangle size={14} />;
            case 'info': return <Info size={14} />;
        }
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="toast-container">
                {toasts.map((toast) => (
                    <div key={toast.id} className={`toast ${toast.type}`}>
                        <div className="toast-icon">
                            {getIcon(toast.type)}
                        </div>
                        <span className="toast-message">{toast.message}</span>
                        {toast.undoAction && (
                            <button
                                className="toast-undo"
                                onClick={() => handleUndo(toast)}
                            >
                                {toast.actionLabel || 'Undo'}
                            </button>
                        )}
                        <button
                            className="toast-close"
                            onClick={() => dismissToast(toast.id)}
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
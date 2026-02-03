import { useContext } from 'react';
import { ToastContext } from '../components/ui/toast-context';

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

export function useToastActions() {
    const { showToast } = useToast();

    return {
        success: (message: string, undoAction?: () => void) =>
            showToast(message, 'success', { undoAction }),
        error: (message: string) =>
            showToast(message, 'error', { duration: 6000 }),
        warning: (message: string) =>
            showToast(message, 'warning'),
        info: (message: string) =>
            showToast(message, 'info'),
    };
}

import { createContext } from 'react';

// Toast types
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastContextType {
    showToast: (message: string, type?: ToastType, options?: { duration?: number; undoAction?: () => void; actionLabel?: string }) => void;
}

export const ToastContext = createContext<ToastContextType | null>(null);

/**
 * UndoToast — Google Calendar style "Event deleted. Undo" toast
 *
 * Shows at the bottom of the screen after destructive actions.
 * Auto-dismisses after 8 seconds (matching Google Calendar).
 * Supports undo callback.
 */

import { useEffect, useState, useCallback, useRef } from 'react';

export interface UndoAction {
    id: string;
    message: string;
    undoFn: () => void;
}

interface UndoToastProps {
    action: UndoAction | null;
    onDismiss: () => void;
    duration?: number;
}

export function UndoToast({ action, onDismiss, duration = 8000 }: UndoToastProps) {
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (action) {
            setVisible(true);
            setExiting(false);

            // Clear existing timer
            if (timerRef.current) clearTimeout(timerRef.current);

            // Auto-dismiss
            timerRef.current = setTimeout(() => {
                dismiss();
            }, duration);
        } else {
            setVisible(false);
        }

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [action, duration]);

    const dismiss = useCallback(() => {
        setExiting(true);
        setTimeout(() => {
            setVisible(false);
            setExiting(false);
            onDismiss();
        }, 200);
    }, [onDismiss]);

    const handleUndo = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        action?.undoFn();
        setExiting(true);
        setTimeout(() => {
            setVisible(false);
            setExiting(false);
            onDismiss();
        }, 200);
    }, [action, onDismiss]);

    if (!visible || !action) return null;

    return (
        <div className={`undo-toast ${exiting ? 'undo-toast-exit' : 'undo-toast-enter'}`}>
            <span className="undo-toast-message">{action.message}</span>
            <button onClick={handleUndo} className="undo-toast-btn">
                Undo
            </button>
        </div>
    );
}

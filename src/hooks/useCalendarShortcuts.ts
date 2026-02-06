/**
 * useCalendarShortcuts — Google Calendar keyboard shortcuts
 *
 * Matches Google Calendar's shortcuts:
 *   t = Today
 *   d = Day view
 *   w = Week view
 *   m = Month view
 *   k / p = Previous period
 *   j / n = Next period
 *   c = Create event
 *   / = Search (optional)
 *   Escape = Close popover
 *
 * Only fires when no input/textarea/contenteditable is focused.
 */

import { useEffect, useRef } from 'react';

interface CalendarShortcutActions {
    goToToday: () => void;
    goToDay: () => void;
    goToWeek: () => void;
    goToMonth: () => void;
    navigateBack: () => void;
    navigateForward: () => void;
    createEvent: () => void;
    search?: () => void;
    onEscape?: () => void;
}

export function useCalendarShortcuts(actions: CalendarShortcutActions) {
    // Use ref to always have latest actions without re-binding
    const actionsRef = useRef(actions);
    actionsRef.current = actions;

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Don't fire when typing in inputs
            const target = e.target as HTMLElement;
            if (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' ||
                target.isContentEditable
            ) {
                // Still handle Escape in inputs for closing things
                if (e.key === 'Escape') {
                    actionsRef.current.onEscape?.();
                }
                return;
            }

            // Don't fire with modifier keys
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            const a = actionsRef.current;

            switch (e.key.toLowerCase()) {
                case 't':
                    e.preventDefault();
                    a.goToToday();
                    break;
                case 'd':
                    e.preventDefault();
                    a.goToDay();
                    break;
                case 'w':
                    e.preventDefault();
                    a.goToWeek();
                    break;
                case 'm':
                    e.preventDefault();
                    a.goToMonth();
                    break;
                case 'k':
                case 'p':
                    e.preventDefault();
                    a.navigateBack();
                    break;
                case 'j':
                case 'n':
                    e.preventDefault();
                    a.navigateForward();
                    break;
                case 'c':
                    e.preventDefault();
                    a.createEvent();
                    break;
                case '/':
                    if (a.search) {
                        e.preventDefault();
                        a.search();
                    }
                    break;
                case 'escape':
                    a.onEscape?.();
                    break;
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []); // Intentionally empty — actionsRef handles updates
}

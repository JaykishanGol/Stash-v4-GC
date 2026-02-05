import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus within a container element while active.
 * Returns a ref to attach to the modal/dialog container.
 *
 * Usage:
 *   const trapRef = useFocusTrap(isOpen);
 *   return <div ref={trapRef}>…</div>;
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(isActive: boolean) {
    const containerRef = useRef<T | null>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isActive || !containerRef.current) return;

        // Remember where focus was before the trap activated
        previousFocusRef.current = document.activeElement as HTMLElement;

        const container = containerRef.current;

        // Auto-focus first focusable element (or the container itself)
        const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusables.length > 0) {
            focusables[0].focus();
        } else {
            container.setAttribute('tabindex', '-1');
            container.focus();
        }

        function handleKeyDown(e: KeyboardEvent) {
            if (e.key !== 'Tab') return;

            const elements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
            if (elements.length === 0) return;

            const first = elements[0];
            const last = elements[elements.length - 1];

            if (e.shiftKey) {
                // Shift+Tab: wrap from first → last
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                // Tab: wrap from last → first
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            // Restore focus when trap deactivates
            previousFocusRef.current?.focus();
        };
    }, [isActive]);

    return containerRef;
}

import { useRef, useCallback } from 'react';

interface LongPressOptions {
    threshold?: number; // ms before considered long press
    onLongPress: () => void;
    onClick?: () => void;
}

/**
 * Hook to detect long-press gestures on touch/mouse
 * Used for mobile selection mode and context menus
 */
export function useLongPress({
    threshold = 400,
    onLongPress,
    onClick
}: LongPressOptions) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPress = useRef(false);
    const startPos = useRef<{ x: number; y: number } | null>(null);

    const start = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        isLongPress.current = false;

        // Get starting position
        if ('touches' in e) {
            startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else {
            startPos.current = { x: e.clientX, y: e.clientY };
        }

        timerRef.current = setTimeout(() => {
            isLongPress.current = true;
            onLongPress();
        }, threshold);
    }, [onLongPress, threshold]);

    const cancel = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const move = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        // Cancel if moved more than 10px (scrolling)
        if (!startPos.current) return;

        let currentPos: { x: number; y: number };
        if ('touches' in e) {
            currentPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else {
            currentPos = { x: e.clientX, y: e.clientY };
        }

        const distance = Math.sqrt(
            Math.pow(currentPos.x - startPos.current.x, 2) +
            Math.pow(currentPos.y - startPos.current.y, 2)
        );

        if (distance > 10) {
            cancel();
        }
    }, [cancel]);

    const end = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        cancel();
        startPos.current = null;

        // If it wasn't a long press and onClick is provided, trigger it
        if (!isLongPress.current && onClick) {
            onClick();
        }

        // Prevent default context menu on mobile
        if (isLongPress.current) {
            e.preventDefault();
        }
    }, [cancel, onClick]);

    return {
        onMouseDown: start,
        onMouseUp: end,
        onMouseLeave: cancel,
        onMouseMove: move,
        onTouchStart: start,
        onTouchEnd: end,
        onTouchMove: move,
        // Prevent context menu on long press
        onContextMenu: (e: React.MouseEvent) => {
            if (isLongPress.current) {
                e.preventDefault();
            }
        }
    };
}

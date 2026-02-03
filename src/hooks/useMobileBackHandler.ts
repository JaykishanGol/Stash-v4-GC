import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

export function useMobileBackHandler() {
    const {
        isSidebarOpen,
        isQuickAddOpen,
        isSchedulerOpen,
        toggleSidebar,
        closeQuickAdd,
        closeScheduler
    } = useAppStore();

    // Track if the current state change was caused by a popstate event
    const isPopping = useRef(false);

    // Generic handler for boolean states mapped to history
    const useHistoryState = (isOpen: boolean, stateName: string) => {
        useEffect(() => {
            if (isOpen) {
                // Modal opened: Push a new history state
                // We use the state object to identify OUR states
                window.history.pushState({ [stateName]: true }, '');
            } else {
                // Modal closed
                if (isPopping.current) {
                    // Closed via Back Button: State already popped. Reset flag.
                    isPopping.current = false;
                } else {
                    // Closed via UI (X button): We need to pop the state we pushed
                    if (window.history.state && window.history.state[stateName]) {
                        window.history.back();
                    }
                }
            }
        }, [isOpen, stateName]);
    };

    // Apply to states
    // Note: React effects run after render.
    
    // We need a global popstate listener to handle the "Close" action
    useEffect(() => {
        const handlePopState = () => {
            // Flag that we are processing a pop
            isPopping.current = true;

            const state = useAppStore.getState();
            
            // Priority Check (LIFO logic roughly, or specific order)
            
            if (state.isSchedulerOpen) {
                closeScheduler();
                return;
            }

            if (state.isQuickAddOpen) {
                closeQuickAdd();
                return;
            }

            if (state.isSidebarOpen && window.innerWidth < 768) {
                toggleSidebar(); // Use action instead of direct set
                return;
            }
            
            // If nothing matched, it's a normal navigation (or exit).
            isPopping.current = false; // Reset if we didn't "handle" it via store
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [closeScheduler, closeQuickAdd, toggleSidebar]); // Add deps

    // Register Push Logic
    useHistoryState(isSchedulerOpen, 'scheduler');
    useHistoryState(isQuickAddOpen, 'quickAdd');
    
    // Sidebar is special: only push on mobile
    useEffect(() => {
        const isMobile = window.innerWidth < 768;
        if (isSidebarOpen && isMobile) {
            window.history.pushState({ sidebar: true }, '');
        } else if (!isSidebarOpen && isMobile) {
            if (isPopping.current) {
                isPopping.current = false;
            } else {
                 if (window.history.state && window.history.state.sidebar) {
                    window.history.back();
                }
            }
        }
    }, [isSidebarOpen]);
}

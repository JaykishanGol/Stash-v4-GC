import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * Theme hook: syncs Zustand theme state to the DOM (data-theme attribute).
 * Also detects system preference on first load if no persisted preference exists.
 */
export function useTheme() {
    const theme = useAppStore((s) => s.theme);
    const toggleTheme = useAppStore((s) => s.toggleTheme);

    // Apply theme to DOM
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        // Also update meta theme-color for mobile browsers
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', theme === 'dark' ? '#121212' : '#F5F3EF');
        }
    }, [theme]);

    // Detect system preference changes
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e: MediaQueryListEvent) => {
            // Only auto-switch if the user hasn't explicitly set a preference
            // We check localStorage to see if theme was explicitly set
            const stored = localStorage.getItem('stash-app-storage');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    // If theme is already persisted, respect user's choice
                    if (parsed?.state?.theme) return;
                } catch {
                    // ignore parse errors
                }
            }
            // Auto-switch based on system
            const currentTheme = useAppStore.getState().theme;
            const systemTheme = e.matches ? 'dark' : 'light';
            if (currentTheme !== systemTheme) {
                toggleTheme();
            }
        };
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [toggleTheme]);

    return { theme, toggleTheme };
}

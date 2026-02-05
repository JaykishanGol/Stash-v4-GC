import { Sidebar } from './Sidebar';
import { MainCanvas } from './MainCanvas';
import { RouteSyncer } from './RouteSyncer';
import { MobileNav } from './MobileNav';
import { useLocalScheduler } from '../../hooks/useLocalScheduler';
import { useAppStore } from '../../store/useAppStore';
import { ComponentErrorBoundary } from '../ui/ComponentErrorBoundary';

export function Layout() {
    // Activate Offline Watchdog
    useLocalScheduler();
    const isAuthModalOpen = useAppStore((s) => s.isAuthModalOpen);

    return (
        <div className="app-container">
            <RouteSyncer />
            {!isAuthModalOpen && (
                <ComponentErrorBoundary name="Sidebar">
                    <Sidebar />
                </ComponentErrorBoundary>
            )}
            <ComponentErrorBoundary name="Main Content">
                <MainCanvas />
            </ComponentErrorBoundary>
            <ComponentErrorBoundary name="Navigation" compact>
                <MobileNav />
            </ComponentErrorBoundary>
        </div>
    );
}

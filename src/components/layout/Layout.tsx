import { Sidebar } from './Sidebar';
import { MainCanvas } from './MainCanvas';
import { RouteSyncer } from './RouteSyncer';
import { MobileNav } from './MobileNav';
import { useLocalScheduler } from '../../hooks/useLocalScheduler';
import { useAppStore } from '../../store/useAppStore';

export function Layout() {
    // Activate Offline Watchdog
    useLocalScheduler();
    const isAuthModalOpen = useAppStore((s) => s.isAuthModalOpen);

    return (
        <div className="app-container">
            <RouteSyncer />
            {!isAuthModalOpen && <Sidebar />}
            <MainCanvas />
            <MobileNav />
        </div>
    );
}

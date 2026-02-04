import { Sidebar } from './Sidebar';
import { MainCanvas } from './MainCanvas';
import { RouteSyncer } from './RouteSyncer';
import { MobileNav } from './MobileNav';
import { useLocalScheduler } from '../../hooks/useLocalScheduler';

export function Layout() {
    // Activate Offline Watchdog
    useLocalScheduler();

    return (
        <div className="app-container">
            <RouteSyncer />
            <Sidebar />
            <MainCanvas />
            <MobileNav />
        </div>
    );
}

import { Sidebar } from './Sidebar';
import { MainCanvas } from './MainCanvas';
import { RouteSyncer } from './RouteSyncer';
import { useLocalScheduler } from '../../hooks/useLocalScheduler';

export function Layout() {
    // Activate Offline Watchdog
    useLocalScheduler();

    return (
        <div className="app-container">
            <RouteSyncer />
            <Sidebar />
            <MainCanvas />
        </div>
    );
}

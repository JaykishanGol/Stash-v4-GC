import { Home, Calendar, Plus, ListTodo, Menu } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAppStore } from '../../store/useAppStore';

export function MobileNav() {
    const [, setLocation] = useLocation();
    const {
        activeView,
        // setActiveView, // Handled by route
        openQuickAdd,
        toggleSidebar,
        isSidebarOpen,
        isHeaderVisible,
        isQuickAddOpen
    } = useAppStore();

    // Hide if header is hidden (scroll) OR Quick Add modal is open OR Sidebar is open
    const isHidden = !isHeaderVisible || isQuickAddOpen || isSidebarOpen;

    return (
        <nav className={`mobile-nav ${isHidden ? 'nav-hidden' : ''}`}>
            <button
                className={`nav-tab ${activeView === 'today' ? 'active' : ''}`}
                onClick={() => setLocation('/')}
            >
                <Home size={22} />
                <span>Home</span>
            </button>

            <button
                className={`nav-tab ${activeView === 'upcoming' ? 'active' : ''}`}
                onClick={() => setLocation('/upcoming')}
            >
                <Calendar size={22} />
                <span>Agenda</span>
            </button>

            <div className="add-tab-wrapper">
                <button
                    className="fab-btn-circle"
                    onClick={() => openQuickAdd('note')}
                >
                    <Plus size={28} />
                </button>
            </div>

            <button
                className={`nav-tab ${activeView === 'tasks' ? 'active' : ''}`}
                onClick={() => setLocation('/tasks')}
            >
                <ListTodo size={22} />
                <span>Tasks</span>
            </button>

            <button
                className={`nav-tab ${isSidebarOpen ? 'active' : ''}`}
                onClick={toggleSidebar}
            >
                <Menu size={22} />
                <span>Menu</span>
            </button>

            <style>{`
                .mobile-nav {
                    display: none; /* Hidden on Desktop */
                    position: fixed;
                    bottom: 0; /* Flush to bottom */
                    left: 0;
                    right: 0;
                    height: 72px;
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(0, 0, 0, 0.05);
                    /* Full Capsule Shape */
                    border-radius: 0; /* No border radius when flush to bottom */ 
                    z-index: 1000;
                    justify-content: space-between;
                    align-items: center; 
                    padding: 0 16px; 
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
                    transition: transform 0.4s cubic-bezier(0.2, 0, 0, 1);
                }

                @media (max-width: 768px) {
                    .mobile-nav {
                        display: flex;
                    }
                }

                .mobile-nav.nav-hidden {
                    transform: translateY(140%);
                }

                .nav-tab {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: transparent;
                    border: none;
                    color: #9CA3AF;
                    gap: 4px;
                    padding: 0;
                    height: 100%;
                    cursor: pointer;
                    position: relative;
                }

                .nav-tab span {
                    font-size: 0.65rem;
                    font-weight: 600;
                    transition: all 0.2s ease;
                    margin-top: 2px;
                }

                .nav-tab svg {
                    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.2s;
                }

                /* Active State with subtle background */
                .nav-tab.active {
                    color: #F59E0B;
                }

                .nav-tab.active svg {
                    transform: translateY(-2px);
                    filter: drop-shadow(0 4px 6px rgba(245, 158, 11, 0.3));
                }
                
                .nav-tab:active svg {
                    transform: scale(0.9);
                }

                .add-tab-wrapper {
                    flex: 0 0 64px; /* Fixed width for center button */
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 4px;
                }

                .fab-btn-circle {
                    width: 52px;
                    height: 52px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #1F2937 0%, #000000 100%);
                    border: 2px solid rgba(255,255,255,0.1);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
                    cursor: pointer;
                    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                .fab-btn-circle:active {
                    transform: scale(0.9);
                }
            `}</style>
        </nav>
    );
}

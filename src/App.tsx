import { useEffect } from 'react';
import { Router } from 'wouter';
import { Layout } from './components/layout/Layout';
import { QuickAddModal } from './components/modals/QuickAddModal';
import { SchedulerModal } from './components/modals/SchedulerModal';
import { InfoPanel } from './components/modals/InfoPanel';
import { FilePreviewModal } from './components/modals/FilePreviewModal';
import { AuthModal } from './components/auth/AuthModal';
import { ToastProvider } from './components/ui/ToastProvider';
import { ToastListener } from './components/ui/ToastListener';
import { BulkActionsBar } from './components/ui/BulkActionsBar';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import { MobileNav } from './components/layout/MobileNav';
import { NotificationCenter } from './components/ui/NotificationCenter';
import { ShareIntentModal } from './components/modals/ShareIntentModal';
import { DragDropOverlay } from './components/capture/CaptureEngine';
import { useSmartPaste } from './hooks/useSmartPaste';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { useAuth } from './hooks/useAuth';
import { useAppStore } from './store/useAppStore';
import { useMobileBackHandler } from './hooks/useMobileBackHandler';
import { useRealtimeSubscription } from './hooks/useRealtime';
import { persistentSyncQueue } from './lib/persistentQueue';
import { getPendingShares, processShare, clearPendingShares } from './lib/shareHandler';
import './index.css';

function App() {
  // Initialize auth and capture hooks
  const { isLoading } = useAuth();
  const {
    isAuthModalOpen,
    closeAuthModal,
    loadUserData,
    user,
    isHeaderVisible,
    isQuickAddOpen,
    fetchNotifications,
    setPendingShareItem,
    addNotification // Import for debug toast
  } = useAppStore();

  useSmartPaste();
  useKeyboardShortcuts();
  useKeyboardNavigation(); // Premium keyboard navigation
  useMobileBackHandler(); // Handle mobile back gestures
  useRealtimeSubscription(); // Enable Realtime Sync

  // Process any pending offline sync operations on startup
  useEffect(() => {
    persistentSyncQueue.process();
  }, []);

  // Fetch persistent notifications on load
  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [user, fetchNotifications]);

  // Handle Share Target
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('share_target')) {
      console.log('Share target detected');
      addNotification('info', 'Importing...', 'Processing shared content');

      getPendingShares().then(async (shares) => {
        console.log('Shares found:', shares);
        if (shares.length > 0) {
          const share = shares[0]; // Process first one
          // Clean up DB immediately so we don't re-process on reload, 
          // but we have the data in memory now 'share' variable
          await clearPendingShares();

          const newItem = processShare(share, user?.id || 'demo');
          if (newItem) {
            console.log('Share processed into item:', newItem);
            setPendingShareItem(newItem);
          } else {
            console.error('Failed to process share data');
            addNotification('error', 'Import Failed', 'Could not process shared content');
          }
        }
      });
      // Clean URL
      url.searchParams.delete('share_target');
      window.history.replaceState({}, '', url.toString());
    }
  }, [user, setPendingShareItem, addNotification]);

  // Auto-close sidebar on mobile
  useEffect(() => {
    if (window.innerWidth < 768) {
      useAppStore.setState({ isSidebarOpen: false });
    }
  }, []);

  // Show loading state
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#F8FAFC',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div className="spinner" style={{
          width: 40,
          height: 40,
          border: '3px solid #E5E7EB',
          borderTopColor: '#F59E0B',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <span style={{ color: '#6B7280', fontWeight: 500 }}>Loading your stash...</span>
      </div>
    );
  }

  return (
    <AppErrorBoundary>
      <Router>
        <ToastProvider>
          <ToastListener />
          <Layout />
          <QuickAddModal />
          <SchedulerModal />
          <InfoPanel />
          <FilePreviewModal />
          <ShareIntentModal />
          <BulkActionsBar />
          <DragDropOverlay />
          <MobileNav />

          {/* Mobile Fixed Notification Bell - Forced Positioning */}
          <div
            className={`mobile-bell-fixed ${(!isHeaderVisible || isQuickAddOpen) ? 'bell-hidden' : ''}`}
            style={{
              position: 'fixed',
              top: '16px',
              right: '16px',
              zIndex: 9999,
              margin: 0
            }}
          >
            <NotificationCenter />
          </div>

          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={closeAuthModal}
            onSuccess={loadUserData}
          />
        </ToastProvider>
      </Router>
    </AppErrorBoundary>
  );
}

export default App;


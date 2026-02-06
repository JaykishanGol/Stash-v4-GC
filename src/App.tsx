import { useEffect, lazy, Suspense } from 'react';
import { Router } from 'wouter';
import { Layout } from './components/layout/Layout';
import { QuickAddModal } from './components/modals/QuickAddModal';
import { AuthModal } from './components/auth/AuthModal';
import { ToastProvider } from './components/ui/ToastProvider';
import { ToastListener } from './components/ui/ToastListener';
import { BulkActionsBar } from './components/ui/BulkActionsBar';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import { ComponentErrorBoundary } from './components/ui/ComponentErrorBoundary';
import { NotificationCenter } from './components/ui/NotificationCenter';
import { DragDropOverlay } from './components/capture/CaptureEngine';
import { useSmartPaste } from './hooks/useSmartPaste';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import { useAppStore } from './store/useAppStore';
import { useMobileBackHandler } from './hooks/useMobileBackHandler';
import { useRealtimeSubscription } from './hooks/useRealtime';
import { persistentSyncQueue } from './lib/persistentQueue';
import { getPendingShares, processShare, clearPendingShares } from './lib/shareHandler';
import { isSupabaseConfigured } from './lib/supabase';
import './index.css';

// Lazy-loaded modals for better initial bundle size
const SchedulerModal = lazy(() => import('./components/modals/SchedulerModal').then(m => ({ default: m.SchedulerModal })));
const InfoPanel = lazy(() => import('./components/modals/InfoPanel').then(m => ({ default: m.InfoPanel })));
const FilePreviewModal = lazy(() => import('./components/modals/FilePreviewModal').then(m => ({ default: m.FilePreviewModal })));
const SettingsModal = lazy(() => import('./components/modals/SettingsModal').then(m => ({ default: m.SettingsModal })));
const ShareIntentModal = lazy(() => import('./components/modals/ShareIntentModal').then(m => ({ default: m.ShareIntentModal })));

// Production environment check - warn if Supabase is misconfigured
if (import.meta.env.PROD && !isSupabaseConfigured()) {
  console.error(
    '[CRITICAL] Supabase is not configured in production! ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.'
  );
}

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
    setPendingShareItems,
    addNotification // Import for debug toast
  } = useAppStore();

  useSmartPaste();
  useKeyboardShortcuts();
  useKeyboardNavigation(); // Premium keyboard navigation
  useMobileBackHandler(); // Handle mobile back gestures
  useRealtimeSubscription(); // Enable Realtime Sync
  useTheme(); // Apply theme (data-theme attr) + system preference detection

  // Process any pending offline sync operations on startup
  useEffect(() => {
    persistentSyncQueue.process();
  }, []);

  // Listen for service worker notification action messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleSWMessage = (event: MessageEvent) => {
      const { type, action, data } = event.data || {};
      if (type !== 'NOTIFICATION_ACTION' || !data?.itemId) return;

      const store = useAppStore.getState();
      const id = data.itemId;
      const itemType = data.type || 'item';

      if (action === 'complete') {
        if (itemType === 'task') {
          store.updateTask(id, { is_completed: true });
        } else {
          store.updateItem(id, { is_completed: true });
        }
        addNotification('success', 'Completed', 'Item marked as done');
      } else if (action === 'snooze') {
        const newTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        if (itemType === 'task') {
          store.updateTask(id, { scheduled_at: newTime });
        } else {
          store.updateItem(id, { scheduled_at: newTime });
        }
        addNotification('info', 'Snoozed', 'Reminder snoozed for 10 minutes');
      } else {
        // Default click - open the item
        if (itemType === 'task') {
          store.setSelectedTask(id);
        } else {
          const item = store.items.find(i => i.id === id);
          if (item) store.setEditingItem(item);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage);
  }, [addNotification]);

  useEffect(() => {
    document.body.classList.toggle('auth-modal-open', isAuthModalOpen);
    document.documentElement.classList.toggle('auth-modal-open', isAuthModalOpen);
    return () => {
      document.body.classList.remove('auth-modal-open');
      document.documentElement.classList.remove('auth-modal-open');
    };
  }, [isAuthModalOpen]);

  useEffect(() => {
    if (isAuthModalOpen && window.innerWidth < 768) {
      useAppStore.setState({ isSidebarOpen: false });
    }
  }, [isAuthModalOpen]);

  // Fetch persistent notifications on load
  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [user, fetchNotifications]);

  // Handle Share Target
  useEffect(() => {
    // Don't process shares until auth has finished loading
    if (isLoading) return;

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

          const newItems = processShare(share, user?.id || 'demo');
          if (newItems && newItems.length > 0) {
            console.log('Share processed into items:', newItems);
            setPendingShareItems(newItems);
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

    // Handle notification deep-link actions (open, complete, snooze)
    const openType = url.searchParams.get('open');
    const openId = url.searchParams.get('id');
    const action = url.searchParams.get('action');

    if (openType && openId && user) {
      setTimeout(() => {
        if (openType === 'task') {
          useAppStore.getState().setSelectedTask(openId);
        } else {
          const item = useAppStore.getState().items.find(i => i.id === openId);
          if (item) useAppStore.getState().setEditingItem(item);
        }
      }, 500);
      // Clean URL
      url.searchParams.delete('open');
      url.searchParams.delete('id');
      window.history.replaceState({}, '', url.toString());
    }

    if (action && openId && user) {
      setTimeout(() => {
        const store = useAppStore.getState();
        if (action === 'complete') {
          if (url.searchParams.get('type') === 'task') {
            store.updateTask(openId, { is_completed: true });
          } else {
            store.updateItem(openId, { is_completed: true });
          }
          addNotification('success', 'Completed', 'Item marked as done');
        } else if (action === 'snooze') {
          const minutes = parseInt(url.searchParams.get('minutes') || '10');
          const newTime = new Date(Date.now() + minutes * 60 * 1000).toISOString();
          if (url.searchParams.get('type') === 'task') {
            store.updateTask(openId, { scheduled_at: newTime });
          } else {
            store.updateItem(openId, { scheduled_at: newTime });
          }
          addNotification('info', 'Snoozed', `Reminder snoozed for ${minutes} minutes`);
        }
      }, 500);
      // Clean URL
      url.searchParams.delete('action');
      url.searchParams.delete('type');
      url.searchParams.delete('id');
      url.searchParams.delete('minutes');
      window.history.replaceState({}, '', url.toString());
    }
  }, [user, isLoading, setPendingShareItems, addNotification]);

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
          <Suspense fallback={null}>
            <ComponentErrorBoundary name="Scheduler" compact>
              <SchedulerModal />
            </ComponentErrorBoundary>
            <ComponentErrorBoundary name="Info Panel" compact>
              <InfoPanel />
            </ComponentErrorBoundary>
            <ComponentErrorBoundary name="File Preview" compact>
              <FilePreviewModal />
            </ComponentErrorBoundary>
            <ComponentErrorBoundary name="Share" compact>
              <ShareIntentModal />
            </ComponentErrorBoundary>
            <ComponentErrorBoundary name="Settings" compact>
              <SettingsModal />
            </ComponentErrorBoundary>
          </Suspense>
          <BulkActionsBar />
          <DragDropOverlay />

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


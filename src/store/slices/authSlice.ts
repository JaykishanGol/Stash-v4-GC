import type { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { clearSignedUrlCache } from '../../components/cards/ItemCard';
import { STORAGE_KEY } from '../../lib/constants';
import { tombstoneManager } from '../../lib/tombstones';
import type { AppState } from '../types';

export interface AuthSlice {
  user: { id: string; email: string } | null;
  isAuthModalOpen: boolean;
  isLoading: boolean;

  setUser: (user: { id: string; email: string } | null) => void;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  setLoading: (loading: boolean) => void;
  signOut: () => Promise<void>;
}

// Use AppState as the full store type for cross-slice access
export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set, get, _store) => ({
  user: null,
  isAuthModalOpen: false,
  isLoading: false,

  setUser: (user) => set({ user }),
  openAuthModal: () => set({ isAuthModalOpen: true, isSidebarOpen: false }),
  closeAuthModal: () => set({ isAuthModalOpen: false }),
  setLoading: (loading) => set({ isLoading: loading }),
  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[Auth] signOut network error (continuing local cleanup):', err);
    }
    set({ user: null });
    
    // Clear all user data from the store (typed access to DataSlice)
    const clearAllUserData = get().clearAllUserData;
    if (clearAllUserData) {
      clearAllUserData();
    }
    
    // Clear signed URL cache
    clearSignedUrlCache();
    
    // Clear persisted localStorage to prevent data rehydration
    localStorage.removeItem(STORAGE_KEY);
    
    // Clear sync queue and tombstones to prevent cross-user data leaks
    localStorage.removeItem('stash_sync_queue');
    localStorage.removeItem('stash_sync_stats');
    tombstoneManager.clear();
    
    console.log('[Auth] Signed out and cleared all user data, queue, and tombstones');
  },
});

import type { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { clearSignedUrlCache } from '../../components/cards/ItemCard';

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

export const createAuthSlice: StateCreator<AuthSlice, [], [], AuthSlice> = (set, _get, store) => ({
  user: null,
  isAuthModalOpen: false,
  isLoading: false,

  setUser: (user) => set({ user }),
  openAuthModal: () => set({ isAuthModalOpen: true, isSidebarOpen: false } as any),
  closeAuthModal: () => set({ isAuthModalOpen: false }),
  setLoading: (loading) => set({ isLoading: loading }),
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null });
    
    // Clear all user data from the store
    const fullStore = store.getState() as any;
    if (fullStore.clearAllUserData) {
      fullStore.clearAllUserData();
    }
    
    // Clear signed URL cache
    clearSignedUrlCache();
    
    // Clear persisted localStorage to prevent data rehydration
    localStorage.removeItem('stash-storage');
    
    console.log('[Auth] Signed out and cleared all user data');
  },
});

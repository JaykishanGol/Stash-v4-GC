import type { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';

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

export const createAuthSlice: StateCreator<AuthSlice> = (set) => ({
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
  },
});

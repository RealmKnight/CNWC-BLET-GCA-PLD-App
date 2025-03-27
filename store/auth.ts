import { create } from "zustand";
import { AuthState, Member } from "@/types";
import { supabase } from "@/lib/supabase";

export const useAuthStore = create<
  AuthState & {
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    setUser: (user: Member | null) => void;
    setSession: (session: any | null) => void;
    setError: (error: string | null) => void;
    setLoading: (isLoading: boolean) => void;
  }
>((set) => ({
  user: null,
  session: null,
  isLoading: true,
  error: null,

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setError: (error) => set({ error }),
  setLoading: (isLoading) => set({ isLoading }),

  signIn: async (email, password) => {
    try {
      set({ isLoading: true, error: null });
      const {
        data: { session },
        error,
      } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (session?.user) {
        const { data: member, error: memberError } = await supabase
          .from("members")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (memberError) throw memberError;

        set({
          user: member,
          session,
          isLoading: false,
          error: null,
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "An error occurred",
        isLoading: false,
      });
    }
  },

  signOut: async () => {
    try {
      set({ isLoading: true, error: null });
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      set({
        user: null,
        session: null,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "An error occurred",
        isLoading: false,
      });
    }
  },
}));

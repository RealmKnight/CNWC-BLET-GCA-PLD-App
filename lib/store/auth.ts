import { create } from "zustand";
import { AuthState, AuthUser, Member } from "../types/auth";
import { supabase } from "../supabase/client";
import { AuthError } from "../errors/types";

interface AuthStore extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUser: (user: AuthUser) => void;
  associateMemberPin: (pin: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  isLoading: true,
  isAuthenticated: false,
  user: null,
  error: null,

  signIn: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null });

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw new AuthError(authError.message);
      if (!authData.user) throw new AuthError("No user data returned");

      // Check if user is company admin
      const isCompanyAdmin = authData.user.user_metadata?.role === "company_admin";

      if (isCompanyAdmin) {
        set({
          user: {
            id: authData.user.id,
            email: authData.user.email!,
            isCompanyAdmin: true,
          },
          isAuthenticated: true,
          isLoading: false,
        });
        return;
      }

      // If not company admin, get member data
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("*")
        .eq("id", authData.user.id)
        .single();

      if (memberError) throw new AuthError("Failed to fetch member data");
      if (!memberData) throw new AuthError("No member data found");

      set({
        user: {
          id: authData.user.id,
          email: authData.user.email!,
          isCompanyAdmin: false,
          member: memberData as Member,
        },
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error : new Error("An unknown error occurred"),
        isLoading: false,
      });
      throw error;
    }
  },

  signOut: async () => {
    try {
      set({ isLoading: true, error: null });
      const { error } = await supabase.auth.signOut();
      if (error) throw new AuthError(error.message);

      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error : new Error("An unknown error occurred"),
        isLoading: false,
      });
      throw error;
    }
  },

  signUp: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw new AuthError(error.message);
      if (!data.user) throw new AuthError("No user data returned");

      // Note: Don't set the user here as they need to:
      // 1. Verify their email
      // 2. Associate their PIN number
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error : new Error("An unknown error occurred"),
        isLoading: false,
      });
      throw error;
    }
  },

  resetPassword: async (email: string) => {
    try {
      set({ isLoading: true, error: null });
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw new AuthError(error.message);
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error : new Error("An unknown error occurred"),
        isLoading: false,
      });
      throw error;
    }
  },

  updateUser: (user: AuthUser) => {
    set({ user });
  },

  associateMemberPin: async (pin: string) => {
    try {
      set({ isLoading: true, error: null });

      const session = await supabase.auth.getSession();
      if (!session.data.session?.user) {
        throw new AuthError("No authenticated user found");
      }

      const userId = session.data.session.user.id;

      // Get member record by PIN
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("*")
        .eq("pin_number", pin)
        .single();

      if (memberError || !memberData) {
        throw new AuthError("Invalid PIN number");
      }

      // Update member record with user ID
      const { error: updateError } = await supabase.from("members").update({ id: userId }).eq("pin_number", pin);

      if (updateError) {
        throw new AuthError("Failed to associate member record");
      }

      set({
        user: {
          id: userId,
          email: session.data.session.user.email!,
          isCompanyAdmin: false,
          member: memberData as Member,
        },
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error : new Error("An unknown error occurred"),
        isLoading: false,
      });
      throw error;
    }
  },

  refreshSession: async () => {
    try {
      set({ isLoading: true, error: null });

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw new AuthError(sessionError.message);

      if (!session) {
        set({ isAuthenticated: false, user: null, isLoading: false });
        return;
      }

      const isCompanyAdmin = session.user.user_metadata?.role === "company_admin";

      if (isCompanyAdmin) {
        set({
          user: {
            id: session.user.id,
            email: session.user.email!,
            isCompanyAdmin: true,
          },
          isAuthenticated: true,
          isLoading: false,
        });
        return;
      }

      // Get member data
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (memberError || !memberData) {
        set({ isAuthenticated: false, user: null, isLoading: false });
        return;
      }

      set({
        user: {
          id: session.user.id,
          email: session.user.email!,
          isCompanyAdmin: false,
          member: memberData as Member,
        },
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error : new Error("An unknown error occurred"),
        isLoading: false,
      });
    }
  },
}));

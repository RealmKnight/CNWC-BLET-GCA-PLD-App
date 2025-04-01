import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "../utils/supabase";
import { Database } from "../types/supabase";
import { router } from "expo-router";
import { Platform, AppState } from "react-native";
import { UserRole, UserProfile } from "@/types/auth";
import { useUserStore } from "@/store/userStore";

type Member = Database["public"]["Tables"]["members"]["Row"];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  member: Member | null;
  isCompanyAdmin: boolean;
  isLoading: boolean;
  userRole: UserRole | null;
  signOut: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  associateMember: (pinNumber: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  associateMemberWithPin: (pin: string) => Promise<void>;
}

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [appState, setAppState] = useState(AppState.currentState);

  // Add refs to track auth state
  const isUpdatingAuth = useRef(false);
  const pendingAuthUpdate = useRef<{ session: Session | null; source: string } | null>(null);
  const appStateTimeout = useRef<NodeJS.Timeout | null>(null);
  const initialAuthCompleteRef = useRef(false);

  async function fetchMemberData(userId: string) {
    try {
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("*")
        .eq("id", userId)
        .single();

      if (memberError) throw memberError;

      if (memberData) {
        console.log("[Auth] Member data loaded:", {
          id: memberData.id,
          role: memberData.role,
          name: `${memberData.first_name} ${memberData.last_name}`,
        });
      }
      return memberData;
    } catch (error) {
      console.error("[Auth] Error fetching member data:", error);
      throw error;
    }
  }

  const updateAuthState = async (newSession: Session | null, source: string) => {
    // If already updating, queue the update
    if (isUpdatingAuth.current) {
      console.log("[Auth] Update already in progress, queueing update from:", source);
      pendingAuthUpdate.current = { session: newSession, source };
      return;
    }

    try {
      isUpdatingAuth.current = true;
      console.log(`[Auth] Updating auth state from ${source}`);

      const newUser = newSession?.user ?? null;
      const currentUser = user;

      // Skip update if nothing has changed and we have complete data
      if (
        newUser?.id === currentUser?.id &&
        member !== null &&
        (source.includes("APP_STATE") ||
          source.includes("state_change_SIGNED_IN") ||
          (source === "initial" && initialAuthCompleteRef.current))
      ) {
        console.log("[Auth] Skipping redundant auth update");
        return;
      }

      // Only set loading if:
      // 1. Not a user metadata update
      // 2. Not an app state change
      // 3. Not a sign-in event when we already have a session
      // 4. Not a redundant session check
      // 5. Not after initial auth is complete
      const shouldSetLoading =
        !source.includes("USER_UPDATED") &&
        !source.includes("APP_STATE") &&
        !(source.includes("state_change_SIGNED_IN") && !!session) &&
        !(source === "initial" && !!session && !!member) &&
        !(initialAuthCompleteRef.current && source.includes("state_change_"));

      if (shouldSetLoading) {
        console.log("[Auth] Setting loading state for auth update");
        setIsLoading(true);
      }

      console.log("[Auth] Setting session and user:", {
        hasSession: !!newSession,
        userId: newUser?.id,
        email: newUser?.email,
      });

      setSession(newSession);
      setUser(newUser);

      if (newUser) {
        // Check for company admin role first
        const isCompanyAdmin = newUser.user_metadata?.role === "company_admin";
        if (isCompanyAdmin) {
          console.log("[Auth] User is a company admin, skipping member data fetch");
          setMember(null);
          setUserRole(null);
          useUserStore.getState().reset();
          // Delay navigation to ensure root layout is mounted
          setTimeout(() => {
            try {
              router.replace("/company-admin");
            } catch (error) {
              console.warn("[Auth] Navigation failed, will retry on next state update:", error);
            }
          }, 100);
          return;
        }

        console.log("[Auth] User is not a company admin, proceeding with member data fetch");
        try {
          // Skip member refetch if we already have the correct data
          const shouldSkipMemberFetch =
            source.includes("USER_UPDATED") ||
            source.includes("APP_STATE") ||
            (source.includes("state_change_SIGNED_IN") && member?.id === newUser.id) ||
            (source === "initial" && member?.id === newUser.id) ||
            (initialAuthCompleteRef.current && member?.id === newUser.id);

          if (!shouldSkipMemberFetch) {
            const memberData = await fetchMemberData(newUser.id);
            if (memberData) {
              console.log("[Auth] Setting member data and role:", {
                id: memberData.id,
                role: memberData.role,
                name: `${memberData.first_name} ${memberData.last_name}`,
              });
              setMember(memberData);
              setUserRole(memberData.role as UserRole);
              // Sync with user store
              useUserStore.getState().setMember(memberData);
              useUserStore.getState().setUserRole(memberData.role as UserRole);
            } else {
              console.warn("[Auth] No member data found");
              setMember(null);
              setUserRole(null);
              // Reset user store
              useUserStore.getState().reset();
            }
          } else {
            console.log("[Auth] Skipping member fetch for:", source);
          }
        } catch (error) {
          console.error("[Auth] Error fetching member data:", error);
          setMember(null);
          setUserRole(null);
          // Reset user store
          useUserStore.getState().reset();
        }
      } else {
        console.log("[Auth] No user, clearing member data and role");
        setMember(null);
        setUserRole(null);
        // Reset user store
        useUserStore.getState().reset();
      }
    } finally {
      if (!source.includes("USER_UPDATED") && !source.includes("APP_STATE")) {
        console.log("[Auth] Finished updating auth state, setting isLoading to false");
        setIsLoading(false);
      }

      isUpdatingAuth.current = false;

      // Process any pending updates
      if (pendingAuthUpdate.current) {
        const { session: pendingSession, source: pendingSource } = pendingAuthUpdate.current;
        pendingAuthUpdate.current = null;
        await updateAuthState(pendingSession, pendingSource);
      }
    }
  };

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      if (!mounted) return;

      try {
        console.log("[Auth] Starting initial auth check...");
        if (Platform.OS === "web" && typeof window === "undefined") return;

        // Add a small delay on web to ensure root layout is mounted
        if (Platform.OS === "web") {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("[Auth] Session error:", error);
          throw error;
        }

        console.log("[Auth] Initial session check:", {
          status: initialSession ? "active" : "none",
          email: initialSession?.user?.email,
          userId: initialSession?.user?.id,
        });

        if (mounted) {
          if (initialSession) {
            console.log("[Auth] Processing initial session");
            await updateAuthState(initialSession, "initial");
          } else {
            console.log("[Auth] No initial session, setting isLoading false");
            setIsLoading(false);
          }
          initialAuthCompleteRef.current = true;
        }
      } catch (error) {
        console.error("[Auth] Initial auth error:", error);
        if (mounted) {
          await updateAuthState(null, "error");
        }
        initialAuthCompleteRef.current = true;
      }
    }

    // Handle app state changes with debounce
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      console.log("[Auth] App state changed:", { from: appState, to: nextAppState });

      // Clear any existing timeout
      if (appStateTimeout.current) {
        clearTimeout(appStateTimeout.current);
      }

      // Set a new timeout for handling the app state change
      appStateTimeout.current = setTimeout(async () => {
        if (appState.match(/inactive|background/) && nextAppState === "active" && mounted) {
          console.log("[Auth] App came to foreground, checking session");
          const {
            data: { session: currentSession },
          } = await supabase.auth.getSession();
          if (currentSession && mounted) {
            await updateAuthState(currentSession, "APP_STATE");
          }
        }
        if (mounted) {
          setAppState(nextAppState);
        }
      }, 100);
    });

    console.log("[Auth] Starting initialization");
    initAuth();

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("[Auth] Auth state change:", {
        event,
        email: session?.user?.email,
        userId: session?.user?.id,
        initialAuthComplete: initialAuthCompleteRef.current,
      });

      if (!mounted) return;

      // Skip auth updates during initialization
      if (!initialAuthCompleteRef.current) {
        console.log("[Auth] Waiting for initial auth to complete...");
        return;
      }

      await updateAuthState(session, `state_change_${event}`);
    });

    return () => {
      mounted = false;
      if (appStateTimeout.current) {
        clearTimeout(appStateTimeout.current);
      }
      subscription.remove();
      authSubscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      console.log("[Auth] Sign in attempt:", email);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      console.log("[Auth] Sign in successful:", email);
    } catch (error) {
      console.error("[Auth] Sign in error:", error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;
    } catch (error) {
      throw error;
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
    } catch (error) {
      throw error;
    }
  };

  const associateMember = async (pinNumber: string) => {
    if (!user) throw new Error("No user logged in");

    try {
      // Call our validation function
      const { data: validationResult, error: validationError } = await supabase.rpc("validate_member_association", {
        pin_number: pinNumber,
      });

      if (validationError) throw validationError;
      if (!validationResult?.length || !validationResult[0].is_valid) {
        throw new Error(validationResult?.[0]?.error_message || "Invalid PIN number");
      }

      // If validation passed, update the member
      const { error: updateError } = await supabase.from("members").update({ user_id: user.id }).eq("pin", pinNumber);

      if (updateError) throw updateError;

      // Refresh auth state
      await updateAuthState(session, "associateMember");
    } catch (error) {
      console.error("Error associating member:", error);
      throw error;
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user?.id) throw new Error("No user logged in");

    try {
      // Update member data
      const { error: memberError } = await supabase.from("members").update(updates).eq("id", user.id);

      if (memberError) throw memberError;

      // Refresh member data
      await updateAuthState(session, "updateProfile");
    } catch (error) {
      console.error("[Auth] Error updating profile:", error);
      throw error;
    }
  };

  const associateMemberWithPin = async (pin: string) => {
    try {
      if (!user) throw new Error("No user logged in");

      const { data, error } = await supabase
        .from("members")
        .update({ id: user.id })
        .eq("pin_number", pin)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error("No member found with that PIN");

      setMember(data);
      setUserRole(data.role as UserRole);
    } catch (error) {
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    session,
    member,
    isCompanyAdmin: user?.user_metadata.role === "company_admin",
    isLoading,
    userRole,
    signOut,
    signIn,
    signUp,
    associateMember,
    resetPassword,
    updateProfile,
    associateMemberWithPin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

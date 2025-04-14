import { createContext, useContext, useEffect, useState, ReactNode, useRef, useMemo, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "../utils/supabase";
import { Database } from "../types/supabase";
import { router } from "expo-router";
import { Platform, AppState } from "react-native";
import { UserRole, UserProfile } from "@/types/auth";
import { useUserStore } from "@/store/userStore";
import * as Linking from "expo-linking";

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
  resetPassword: (email: string) => Promise<void>;
  exchangeCodeForSession: (code: string) => Promise<void>;
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

  // Stable fetchMemberData (depends on supabase which is stable)
  const fetchMemberData = useCallback(async (userId: string) => {
    try {
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        // Select new ID fields and remove old text fields
        .select("*, division_id, current_zone_id, home_zone_id, calendar_id")
        .eq("id", userId)
        .maybeSingle();

      if (memberError) throw memberError;

      if (memberData) {
        console.log("[Auth] Member data loaded:", {
          id: memberData.id,
          role: memberData.role,
          divisionId: memberData.division_id, // Log new ID
          calendarId: memberData.calendar_id, // Log new ID
          name: `${memberData.first_name} ${memberData.last_name}`,
        });
      }
      return memberData;
    } catch (error) {
      console.error("[Auth] Error fetching member data:", error);
      throw error; // Re-throw error after logging
    }
  }, []); // Empty dependency array as supabase is stable

  // Stable updateAuthState (depends on stable fetchMemberData and state setters)
  const updateAuthState = useCallback(
    async (newSession: Session | null, source: string) => {
      // If already updating, queue the update
      if (isUpdatingAuth.current) {
        console.log("[Auth] Update already in progress, queueing update from:", source);
        pendingAuthUpdate.current = { session: newSession, source };
        return;
      }

      let shouldSetLoading = false;

      try {
        isUpdatingAuth.current = true;
        console.log(`[Auth] Updating auth state from ${source}`);

        const newUser = newSession?.user ?? null;
        // Get current user from state directly for comparison
        const currentUserId = user?.id; // Get ID from state
        const currentAccessToken = session?.access_token; // Get token from state

        // Skip update if user ID and access token are the same AND it's a background/refresh event
        if (
          newUser?.id === currentUserId &&
          newSession?.access_token === currentAccessToken &&
          (source.includes("APP_STATE") || source.includes("state_change_SIGNED_IN"))
        ) {
          console.log("[Auth] Skipping redundant auth update (user ID and access token match)");
          isUpdatingAuth.current = false; // Reset flag
          // Process pending updates if any
          if (pendingAuthUpdate.current) {
            const { session: pendingSession, source: pendingSource } = pendingAuthUpdate.current;
            pendingAuthUpdate.current = null;
            await updateAuthState(pendingSession, pendingSource); // Recursive call needs await
          }
          return;
        }

        // Simplified loading logic
        shouldSetLoading =
          newUser?.id !== currentUserId ||
          (source === "initial" && !initialAuthCompleteRef.current) ||
          source === "signIn" ||
          source === "signUp";

        if (shouldSetLoading) {
          // Only set loading to true if it's currently false
          setIsLoading(true); // Explicitly set loading true here
          console.log("[Auth] Setting isLoading=true for auth update:", source);
        } else {
          console.log("[Auth] Skipping isLoading=true for this auth update:", source);
        }

        console.log("[Auth] Setting session and user:", {
          hasSession: !!newSession,
          userId: newUser?.id,
          email: newUser?.email,
        });

        setSession(newSession);
        setUser(newUser);

        if (newUser) {
          const isCompanyAdmin = newUser.user_metadata?.role === "company_admin";
          if (isCompanyAdmin) {
            console.log("[Auth] User is a company admin, skipping member data fetch");
            setMember(null);
            setUserRole(null);
            useUserStore.getState().reset();
            setTimeout(() => {
              try {
                router.replace("/company-admin");
              } catch (error) {
                console.warn("[Auth] Navigation failed during admin redirect:", error);
              }
            }, 100);
            // Return early AFTER setting state but BEFORE resetting loading potentially
            // The finally block will handle isLoading
            return;
          }

          console.log("[Auth] User is not a company admin, proceeding with member data fetch");
          try {
            const currentMemberId = member?.id; // Get from state
            const shouldSkipMemberFetch =
              source.includes("USER_UPDATED") ||
              source.includes("APP_STATE") ||
              (source.includes("state_change_SIGNED_IN") && currentMemberId === newUser.id) ||
              (source === "initial" && currentMemberId === newUser.id) ||
              (initialAuthCompleteRef.current && currentMemberId === newUser.id);

            if (!shouldSkipMemberFetch) {
              console.log("[Auth] Fetching member data for non-admin user:", newUser.id);
              const memberData = await fetchMemberData(newUser.id); // Use memoized version
              if (memberData) {
                console.log("[Auth] Setting member data and role:", {
                  id: memberData.id,
                  role: memberData.role,
                  divisionId: memberData.division_id, // Log new ID
                  calendarId: memberData.calendar_id, // Log new ID
                });
                setMember(memberData);
                setUserRole(memberData.role as UserRole);
                useUserStore.getState().setMember(memberData);
                useUserStore.getState().setUserRole(memberData.role as UserRole);
              } else {
                console.warn("[Auth] No member data found for user:", newUser.id);
                setMember(null);
                setUserRole(null);
                useUserStore.getState().reset();
              }
            } else {
              console.log("[Auth] Skipping member fetch for:", source);
            }
          } catch (error) {
            console.error("[Auth] Error during member data fetch:", error);
            setMember(null);
            setUserRole(null);
            useUserStore.getState().reset();
          }
        } else {
          console.log("[Auth] No user, clearing member data and role");
          setMember(null);
          setUserRole(null);
          useUserStore.getState().reset();
        }
      } finally {
        // Always set loading false if it was set true, or if initial load completes
        if (shouldSetLoading || (source === "initial" && !initialAuthCompleteRef.current)) {
          console.log("[Auth] Finished auth update, setting isLoading false");
          setIsLoading(false); // Set loading false here
        }
        isUpdatingAuth.current = false;

        // Process any pending updates AFTER resetting the flag and loading state
        if (pendingAuthUpdate.current) {
          console.log("[Auth] Processing pending auth update");
          const { session: pendingSession, source: pendingSource } = pendingAuthUpdate.current;
          pendingAuthUpdate.current = null;
          await updateAuthState(pendingSession, pendingSource); // Ensure this completes
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [fetchMemberData, user?.id, session?.access_token, member?.id]
  ); // Add state values used in checks

  // Effect for initial load and auth state changes
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      if (!mounted) return;
      // ... (rest of initAuth, uses updateAuthState)
      try {
        console.log("[Auth] Starting initial auth check...");
        if (Platform.OS === "web" && typeof window === "undefined") return;

        if (Platform.OS === "web") {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("[Auth] Session error:", error);
          // Don't throw here, let updateAuthState handle null session
        }

        console.log("[Auth] Initial session check:", {
          status: initialSession ? "active" : "none",
          userId: initialSession?.user?.id,
        });

        if (mounted) {
          // Await the initial update to ensure loading state is handled correctly
          await updateAuthState(initialSession, "initial");
          initialAuthCompleteRef.current = true; // Mark complete AFTER first update
          console.log("[Auth] Initial auth processing complete.");
        }
      } catch (error) {
        console.error("[Auth] Initial auth error:", error);
        if (mounted) {
          await updateAuthState(null, "error"); // Ensure state is cleared on error
          initialAuthCompleteRef.current = true; // Mark complete even on error
        }
      }
    }

    // App state listener (uses updateAuthState)
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      console.log("[Auth] App state changed:", { from: appState, to: nextAppState });

      if (appStateTimeout.current) {
        clearTimeout(appStateTimeout.current);
      }

      appStateTimeout.current = setTimeout(async () => {
        if (appState.match(/inactive|background/) && nextAppState === "active" && mounted) {
          console.log("[Auth] App came to foreground, checking session");
          try {
            const {
              data: { session: currentSession },
              error,
            } = await supabase.auth.getSession();
            if (error) {
              console.error("[Auth] Error getting session on foreground:", error);
            } else if (currentSession && mounted) {
              await updateAuthState(currentSession, "APP_STATE");
            }
          } catch (error) {
            console.error("[Auth] Exception getting session on foreground:", error);
          }
        }
        if (mounted) {
          setAppState(nextAppState);
        }
      }, 300); // Increased debounce slightly
    });

    console.log("[Auth] Starting initialization");
    initAuth(); // Call async init function

    // Auth state change listener (uses updateAuthState)
    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("[Auth] Auth state change event:", {
        event,
        userId: session?.user?.id,
        hasSession: !!session,
        initialAuthComplete: initialAuthCompleteRef.current,
      });

      if (!mounted) return;

      if (!initialAuthCompleteRef.current) {
        console.log("[Auth] Auth state change ignored, initial auth not complete.");
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
      console.log("[Auth] AuthProvider unmounted, cleaned up listeners.");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateAuthState]); // Depend only on the stable updateAuthState

  // --- Memoized Functions ---
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      console.log("[Auth] Sign in attempt:", email);
      // updateAuthState will be triggered by onAuthStateChange
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      console.log("[Auth] Sign in successful trigger:", email);
    } catch (error) {
      console.error("[Auth] Sign in error:", error);
      throw error; // Re-throw
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    try {
      // updateAuthState will be triggered by onAuthStateChange
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
    } catch (error) {
      console.error("[Auth] Sign up error:", error);
      throw error; // Re-throw
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      // updateAuthState will be triggered by onAuthStateChange
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      console.log("[Auth] Sign out successful trigger");
    } catch (error) {
      console.error("[Auth] Sign out error:", error);
      throw error; // Re-throw
    }
  }, []);

  const resetPassword = async (email: string) => {
    try {
      // Use web URL instead of expo deep link URL
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.EXPO_PUBLIC_WEBSITE_URL}/(auth)/change-password`,
      });
      if (error) throw error;
    } catch (error) {
      console.error("Error sending password reset email:", error);
      throw error;
    }
  };

  const exchangeCodeForSession = async (code: string) => {
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;

      // Use the session data if needed but don't return it
      if (data.session) {
        await updateAuthState(data.session, "exchangeCodeForSession");
      }
    } catch (error) {
      console.error("Error exchanging code for session:", error);
      throw error;
    }
  };

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!user?.id) throw new Error("No user logged in");
      const userId = user.id; // Capture stable userId
      try {
        const { error: memberError } = await supabase.from("members").update(updates).eq("id", userId);
        if (memberError) throw memberError;

        // Refresh member data by re-fetching session which triggers updateAuthState
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        await updateAuthState(currentSession, "updateProfile"); // Use stable updateAuthState
      } catch (error) {
        console.error("[Auth] Error updating profile:", error);
        throw error; // Re-throw
      }
    },
    [user?.id, updateAuthState]
  ); // Depend on user ID and stable updateAuthState

  const associateMemberWithPin = useCallback(
    async (pin: string) => {
      if (!user?.id) throw new Error("No user logged in");
      const userId = user.id;
      try {
        // Convert pin to bigint by removing any non-numeric characters and parsing
        const numericPin = parseInt(pin.replace(/\D/g, ""), 10);
        if (isNaN(numericPin)) throw new Error("Invalid PIN format");

        // First verify the PIN exists and isn't already associated
        const { data: members, error: checkError } = await supabase
          .from("members")
          .select("id, pin_number")
          .eq("pin_number", numericPin)
          .maybeSingle();

        if (checkError) throw checkError;
        if (!members) throw new Error("No member found with that PIN");

        // If member already has an ID and it's not this user's ID, it's taken
        if (members.id && members.id !== userId) {
          throw new Error("This PIN is already associated with another user");
        }

        // Update the member record with the user's ID
        const { data: updatedMember, error: updateError } = await supabase
          .from("members")
          .update({ id: userId })
          .eq("pin_number", numericPin)
          .select()
          .maybeSingle();

        if (updateError) {
          console.error("[Auth] Update error:", updateError);
          throw updateError;
        }
        if (!updatedMember) {
          // If update succeeded but returned no data, fetch the member data directly
          const { data: fetchedMember, error: fetchError } = await supabase
            .from("members")
            // Select new fields
            .select("*, division_id, current_zone_id, home_zone_id, calendar_id")
            .eq("id", userId)
            .maybeSingle();

          if (fetchError) throw fetchError;
          if (!fetchedMember) throw new Error("Failed to associate member");

          console.log("[Auth] Successfully associated member (fetched after update):", {
            userId,
            pin: numericPin,
            memberId: fetchedMember.id,
            role: fetchedMember.role,
            divisionId: fetchedMember.division_id,
            calendarId: fetchedMember.calendar_id,
          });

          // Update local state with fetched data
          setMember(fetchedMember);
          setUserRole(fetchedMember.role as UserRole);
          useUserStore.getState().setMember(fetchedMember);
          useUserStore.getState().setUserRole(fetchedMember.role as UserRole);
        } else {
          console.log("[Auth] Successfully associated member:", {
            userId,
            pin: numericPin,
            memberId: updatedMember.id,
            role: updatedMember.role,
          });

          // Update local state with returned data
          setMember(updatedMember);
          setUserRole(updatedMember.role as UserRole);
          useUserStore.getState().setMember(updatedMember);
          useUserStore.getState().setUserRole(updatedMember.role as UserRole);
        }

        // Refresh session to trigger auth state update
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        await updateAuthState(currentSession, "associateMemberWithPin");
      } catch (error) {
        console.error("[Auth] Error associating member with PIN:", error);
        throw error;
      }
    },
    [user?.id, updateAuthState]
  );

  // --- Memoized Context Value ---
  const value = useMemo(
    () => ({
      user,
      session,
      member,
      // Calculate derived state directly in the memoized value
      isCompanyAdmin: user?.user_metadata.role === "company_admin",
      isLoading,
      userRole,
      // Pass memoized functions
      signOut,
      signIn,
      signUp,
      resetPassword,
      exchangeCodeForSession,
      updateProfile,
      associateMemberWithPin,
    }),
    [
      user,
      session,
      member,
      isLoading,
      userRole,
      // Function dependencies (already stable via useCallback)
      signOut,
      signIn,
      signUp,
      resetPassword,
      exchangeCodeForSession,
      updateProfile,
      associateMemberWithPin,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

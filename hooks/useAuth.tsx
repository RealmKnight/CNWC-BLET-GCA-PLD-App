import { createContext, useContext, useEffect, useState, ReactNode, useRef, useMemo, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "../utils/supabase";
import { Database } from "../types/supabase";
import { router } from "expo-router";
import { Platform, AppState } from "react-native";
import { UserRole, UserProfile } from "@/types/auth";
import { useUserStore } from "@/store/userStore";
import * as Linking from "expo-linking";
import { useNotificationStore } from "@/store/notificationStore";

declare global {
  interface Window {
    __passwordResetInProgress?: boolean;
  }
}

type Member = Database["public"]["Tables"]["members"]["Row"];

// Define the possible auth statuses for navigation control
type AuthStatus =
  | "loading" // Initial check in progress
  | "signedOut" // No session, should be on sign-in
  | "needsAssociation" // Session exists, but no matching member record
  | "signedInMember" // Session exists, member record found
  | "signedInAdmin" // Session exists, user is a company admin
  | "passwordReset"; // Special state for password reset flow

interface AuthContextType {
  user: User | null;
  session: Session | null;
  member: Member | null;
  isCompanyAdmin: boolean; // Keep for potential direct checks elsewhere
  userRole: UserRole | null;
  authStatus: AuthStatus; // <-- Replace isLoading and isMemberCheckComplete
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
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading"); // <-- Initialize new state
  const [appState, setAppState] = useState(AppState.currentState);
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false); // Keep derived state

  // Refs remain the same
  const isUpdatingAuth = useRef(false);
  const pendingAuthUpdate = useRef<{ session: Session | null; source: string } | null>(null);
  const appStateTimeout = useRef<NodeJS.Timeout | null>(null);
  const initialAuthCompleteRef = useRef(false);

  // fetchMemberData remains the same
  const fetchMemberData = useCallback(async (userId: string) => {
    try {
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("*, division_id, current_zone_id, home_zone_id, calendar_id")
        .eq("id", userId)
        .maybeSingle();

      if (memberError) throw memberError;

      if (memberData) {
        console.log("[Auth] Member data loaded:", {
          id: memberData.id,
          role: memberData.role,
          divisionId: memberData.division_id,
          calendarId: memberData.calendar_id,
          name: `${memberData.first_name} ${memberData.last_name}`,
        });
      } else {
        console.log("[Auth] No member data found for user ID:", userId);
      }
      return memberData;
    } catch (error) {
      console.error("[Auth] Error fetching member data:", error);
      throw error;
    }
  }, []);

  // Rework updateAuthState to set authStatus
  const updateAuthState = useCallback(
    async (newSession: Session | null, source: string) => {
      // Prevent concurrent updates
      if (isUpdatingAuth.current) {
        console.log("[Auth] Update already in progress, queueing update from:", source);
        pendingAuthUpdate.current = { session: newSession, source };
        return;
      }
      isUpdatingAuth.current = true;

      // Always reset to loading if it's the initial call before completion
      if (source === "initial" && !initialAuthCompleteRef.current) {
        setAuthStatus("loading");
        console.log("[Auth] Setting authStatus=loading for initial check");
      }

      let finalStatus: AuthStatus = "loading"; // Default status while processing
      let fetchedMemberData: Member | null = null; // Store fetched data locally
      let localIsCompanyAdmin = false; // Store admin status locally

      try {
        // Basic state updates
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setMember(null); // Reset member initially
        setUserRole(null);
        setIsCompanyAdmin(false); // Reset derived state

        // Determine final status based on the new session
        if (typeof window !== "undefined" && window.__passwordResetInProgress) {
          console.log("[Auth] Password reset in progress, setting status.");
          finalStatus = "passwordReset";
          // Also update base state for consistency if needed by UI during reset
          setIsCompanyAdmin(false);
        } else if (newSession) {
          // Fetch fresh user data to check metadata reliably
          const {
            data: { user: refreshedUser },
            error: refreshError,
          } = await supabase.auth.getUser();

          if (refreshError) {
            console.error("[Auth] Error refreshing user data:", refreshError);
            finalStatus = "signedOut"; // Treat as signed out if user refresh fails
            useUserStore.getState().reset();
          } else if (refreshedUser) {
            console.log(
              "[Auth] Refreshed user data obtained, checking role:",
              refreshedUser.email,
              refreshedUser.user_metadata
            );
            localIsCompanyAdmin = refreshedUser.user_metadata?.role === "company_admin";
            setIsCompanyAdmin(localIsCompanyAdmin); // Update derived state

            if (localIsCompanyAdmin) {
              console.log("[Auth] User is company admin.");
              finalStatus = "signedInAdmin";
              useUserStore.getState().reset(); // Reset member store for admin
            } else {
              console.log("[Auth] User is not company admin, fetching member data:", refreshedUser.id);
              try {
                fetchedMemberData = await fetchMemberData(refreshedUser.id);
                if (fetchedMemberData) {
                  console.log("[Auth] Member data found.");
                  // Set member state *after* determining status
                  setMember(fetchedMemberData);
                  setUserRole(fetchedMemberData.role as UserRole);
                  useUserStore.getState().setMember(fetchedMemberData); // Update zustand store
                  useUserStore.getState().setUserRole(fetchedMemberData.role as UserRole);
                  finalStatus = "signedInMember";
                } else {
                  console.log("[Auth] No member data found after fetch.");
                  finalStatus = "needsAssociation";
                  useUserStore.getState().reset(); // Reset member store if no association
                }
              } catch (error) {
                console.error("[Auth] Error during member data fetch:", error);
                finalStatus = "signedOut"; // Or handle error state differently?
                useUserStore.getState().reset();
              }
            }
          } else {
            console.warn("[Auth] Refreshed user data was null.");
            finalStatus = "signedOut"; // Treat as signed out
            useUserStore.getState().reset();
            setIsCompanyAdmin(false);
          }
        } else {
          console.log("[Auth] No session.");
          finalStatus = "signedOut";
          useUserStore.getState().reset();
          setIsCompanyAdmin(false);
        }
      } finally {
        console.log(`[Auth] Final authStatus determined: ${finalStatus} (source: ${source})`);
        setAuthStatus(finalStatus); // Set the final determined status

        // Mark initial auth as complete if this was the initial call
        if (source === "initial") {
          initialAuthCompleteRef.current = true;
          console.log("[Auth] Initial auth processing complete flag set.");
        }

        isUpdatingAuth.current = false;
        // Process pending updates if any
        if (pendingAuthUpdate.current) {
          console.log("[Auth] Processing pending auth update");
          const { session: pendingSession, source: pendingSource } = pendingAuthUpdate.current;
          pendingAuthUpdate.current = null;
          // Use `queueMicrotask` to avoid deep recursion/stack issues if updates happen rapidly
          queueMicrotask(() => {
            void updateAuthState(pendingSession, pendingSource);
          });
        }
      }
    },
    // Keep dependency array minimal, relies on internal logic and stable fetchMemberData/setters
    [fetchMemberData]
  );

  // Effect for initial load and auth state changes
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      if (!mounted) return;
      console.log("[Auth] Starting initial auth check...");
      try {
        // Small delay for web to allow potential redirects/URL changes to settle
        if (Platform.OS === "web") {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }

        // Set password reset flag based on URL *before* getSession
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const urlParams = new URLSearchParams(window.location.hash.substring(1)); // Check hash for Supabase params
          if (urlParams.get("type") === "recovery") {
            console.log("[Auth Init] Detected password recovery type in URL hash.");
            window.__passwordResetInProgress = true;
          }
        }

        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession();
        if (error) console.error("[Auth] Session error:", error);

        console.log("[Auth] Initial session check result:", { hasSession: !!initialSession });
        if (mounted) {
          await updateAuthState(initialSession, "initial");
        }
      } catch (error) {
        console.error("[Auth] Initial auth error:", error);
        if (mounted) {
          await updateAuthState(null, "error"); // Ensure state is cleared on error
        }
      }
      // No need to set initialAuthCompleteRef here, updateAuthState handles it
    }

    // App state listener
    const appStateSubscription = AppState.addEventListener("change", async (nextAppState) => {
      if (mounted && appState.match(/inactive|background/) && nextAppState === "active") {
        console.log("[Auth] App came to foreground, re-checking auth state.");
        try {
          const {
            data: { session: foregroundSession },
            error: fgError,
          } = await supabase.auth.getSession();
          if (fgError) {
            console.error("[Auth AppState] Error getting session on foreground:", fgError);
            // Decide how to handle error - maybe trigger update with null?
            // await updateAuthState(null, "APP_STATE_ERROR");
            return;
          }

          // Compare fetched session with the *current* state session
          const currentStateSession = session; // Capture current state session
          const currentStateUser = user; // Capture current state user

          const sessionPresenceChanged = !!foregroundSession !== !!currentStateSession;
          const userIdChanged = foregroundSession?.user?.id !== currentStateUser?.id;
          // Optional: Check if access token changed for refresh scenarios
          // const tokenChanged = foregroundSession?.access_token !== currentStateSession?.access_token;

          if (mounted && (sessionPresenceChanged || userIdChanged) /* || tokenChanged */) {
            console.log("[Auth] Session changed on foreground, updating state.");
            await updateAuthState(foregroundSession, "APP_STATE");
          } else if (mounted) {
            console.log("[Auth] Session unchanged on foreground.");
          }
        } catch (error) {
          console.error("[Auth AppState] Exception getting session on foreground:", error);
        }
      }
      if (mounted) {
        setAppState(nextAppState);
      }
    });

    // Auth state change listener
    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      console.log(`[Auth] onAuthStateChange event: ${event}`, { hasSession: !!session });

      // Only process events *after* initial check is complete to avoid races
      if (!initialAuthCompleteRef.current && event !== "INITIAL_SESSION") {
        console.log("[Auth] Ignoring event before initial auth complete:", event);
        return;
      }
      // Special handling for password recovery event
      if (event === "PASSWORD_RECOVERY") {
        console.log("[Auth] Password recovery event received.");
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.__passwordResetInProgress = true;
        }
        setAuthStatus("passwordReset"); // Directly set status
        return; // Don't run full updateAuthState for this event
      }

      // Run the full update process for relevant events
      await updateAuthState(session, `state_change_${event}`);
    });

    // Initial call
    initAuth();

    return () => {
      mounted = false;
      appStateSubscription.remove();
      authSubscription.unsubscribe();
      console.log("[Auth] AuthProvider unmounted, cleaned up listeners.");
    };
  }, [updateAuthState]); // *** REMOVED session and user?.id dependencies ***

  // --- Memoized Functions ---
  const signIn = useCallback(async (email: string, password: string) => {
    console.log("[Auth] Sign in attempt:", email);
    // updateAuthState triggered by onAuthStateChange
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("[Auth] Sign in error:", error);
      setAuthStatus("signedOut"); // Reset status on error
      throw error;
    }
    // Don't set status here, wait for onAuthStateChange -> updateAuthState
    console.log("[Auth] Sign in successful trigger:", email);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    console.log("[Auth] Sign up attempt:", email);
    // updateAuthState triggered by onAuthStateChange
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      console.error("[Auth] Sign up error:", error);
      setAuthStatus("signedOut"); // Reset status on error
      throw error;
    }
    // Don't set status here, wait for onAuthStateChange -> updateAuthState
    console.log("[Auth] Sign up successful trigger:", email);
  }, []);

  const signOut = useCallback(async () => {
    console.log("[Auth] Attempting sign out");
    setAuthStatus("loading"); // Show loading briefly during sign out
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.warn("[Auth] Supabase sign out error:", error);
        // Still proceed to clear state locally
      }
      // Clear local state *after* Supabase call (success or fail)
      setSession(null);
      setUser(null);
      setMember(null);
      setUserRole(null);
      setIsCompanyAdmin(false);
      useUserStore.getState().reset();

      // Clear password reset flag on sign out
      if (Platform.OS === "web" && typeof window !== "undefined") {
        delete window.__passwordResetInProgress;
      }

      console.log("[Auth] Local state cleared, setting status to signedOut");
      setAuthStatus("signedOut"); // Explicitly set final status

      // Navigate via router AFTER state is cleared and status is set
      // Use queueMicrotask to ensure navigation happens after state updates settle
      queueMicrotask(() => {
        try {
          router.replace("/sign-in");
          console.log("[Auth] Navigation to /sign-in initiated after sign out.");
        } catch (navError) {
          console.error("[Auth] Navigation error during sign out redirect:", navError);
        }
      });
    } catch (error) {
      console.error("[Auth] Error during signOut process:", error);
      setAuthStatus("signedOut"); // Ensure signed out state on error
      // Attempt navigation even on error
      queueMicrotask(() => {
        try {
          router.replace("/sign-in");
        } catch (navError) {
          console.error("[Auth] Navigation error during sign out fallback:", navError);
        }
      });
    }
  }, []);

  const resetPassword = async (email: string) => {
    console.log("[Auth] Sending password reset email to:", email);
    setAuthStatus("loading"); // Indicate loading
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { data, error: resetError } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email: email,
        options: {
          redirectTo: `${process.env.EXPO_PUBLIC_WEBSITE_URL}/change-password`,
        },
      });
      if (resetError || !data?.properties?.action_link) throw resetError || new Error("Link generation failed");
      const functionUrl = "https://ymkihdiegkqbeegfebse.supabase.co/functions/v1/send-email";
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          to: email,
          subject: "Reset Your Password - BLET CN/WC GCA PLD App",
          content: `
            <div style="text-align: center; padding: 20px;">
              <img src="https://ymkihdiegkqbeegfebse.supabase.co/storage/v1/object/public/public_assets/logo/BLETblackgold.png"
                   alt="BLET Logo"
                   style="max-width: 200px; height: auto;">
              <h1 style="color: #003366;">Reset Your Password</h1>
              <p style="font-size: 16px; line-height: 1.5;">
                We received a request to reset your password for the BLET CN/WC GCA PLD App.
              </p>
              <p style="font-size: 16px; line-height: 1.5;">
                <a href="${data.properties.action_link}" style="background-color: #003366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
                  Reset Password
                </a>
              </p>
              <p style="font-style: italic; color: #666; margin-top: 20px;">
                If you did not request a password reset, you can ignore this email.
              </p>
              <p style="font-style: italic; color: #666;">
                This is an automated message from the BLET CN/WC GCA PLD App.
              </p>
            </div>
          `,
        }),
      });
      if (!response.ok) throw new Error("Failed to send custom email");
      console.log("[Auth] Password reset email sent successfully");
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      await updateAuthState(currentSession, "resetPasswordComplete");
    } catch (error) {
      console.error("[Auth] Error sending password reset email:", error);
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      await updateAuthState(currentSession, "resetPasswordError");
      throw error;
    }
  };

  const exchangeCodeForSession = useCallback(async (code: string) => {
    console.log("[Auth] Exchanging code for session");
    setAuthStatus("loading"); // Show loading
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      console.log("[Auth] Code exchanged successfully", { hasSession: !!data.session });
      // Let onAuthStateChange handle the session update via updateAuthState
      // No need to call updateAuthState directly here if onAuthStateChange is reliable
    } catch (error) {
      console.error("[Auth] Error exchanging code:", error);
      setAuthStatus("signedOut"); // Fallback to signed out on error
      throw error;
    }
  }, []); // No dependencies needed

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!user?.id) throw new Error("No user logged in");
      const userId = user.id;
      console.log("[Auth] Updating profile for user:", userId);
      try {
        const { error: memberError } = await supabase.from("members").update(updates).eq("id", userId);
        if (memberError) throw memberError;
        console.log("[Auth] Profile update successful, refreshing auth state.");
        // Refresh auth state to reflect potential changes
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        await updateAuthState(currentSession, "updateProfile");
      } catch (error) {
        console.error("[Auth] Error updating profile:", error);
        throw error;
      }
    },
    [user?.id, updateAuthState]
  );

  const associateMemberWithPin = useCallback(
    async (pin: string) => {
      if (!user?.id) {
        setAuthStatus("signedOut"); // Ensure state reflects reality
        throw new Error("No user logged in for association");
      }
      const userId = user.id;
      console.log("[Auth] Attempting association for user:", userId, "with PIN:", pin);
      setAuthStatus("loading"); // Show loading during association attempt
      try {
        // ... (PIN validation and check logic remains the same)
        const numericPin = parseInt(pin.replace(/\D/g, ""), 10);
        if (isNaN(numericPin)) throw new Error("Invalid PIN format");
        const { data: members, error: checkError } = await supabase
          .from("members")
          .select("id, pin_number")
          .eq("pin_number", numericPin)
          .maybeSingle();
        if (checkError) throw checkError;
        if (!members) throw new Error("No member found with that PIN");
        if (members.id && members.id !== userId) throw new Error("This PIN is already associated with another user");

        // Update the member record
        const { data: updatedMember, error: updateError } = await supabase
          .from("members")
          .update({ id: userId })
          .eq("pin_number", numericPin)
          .select("*, division_id, current_zone_id, home_zone_id, calendar_id") // Select all needed fields
          .single(); // Use single() as we expect one row updated

        if (updateError) throw updateError;
        if (!updatedMember) throw new Error("Failed to associate member or retrieve updated record");

        console.log("[Auth] Association successful:", { userId, pin: numericPin, memberId: updatedMember.id });
        // Update state directly AND trigger full auth state refresh
        setMember(updatedMember);
        setUserRole(updatedMember.role as UserRole);
        useUserStore.getState().setMember(updatedMember);
        useUserStore.getState().setUserRole(updatedMember.role as UserRole);
        setAuthStatus("signedInMember"); // Set status immediately

        // Trigger a full refresh via updateAuthState to ensure consistency
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        await updateAuthState(currentSession, "associateMemberWithPin");
      } catch (error) {
        console.error("[Auth] Error associating member with PIN:", error);
        // Determine status based on error (maybe stay needsAssociation?)
        setAuthStatus("needsAssociation"); // Revert status on error
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
      isCompanyAdmin, // Keep derived state
      userRole,
      authStatus, // Expose new status
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
      isCompanyAdmin,
      userRole,
      authStatus, // Add authStatus dependency
      // Function dependencies (stable via useCallback)
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

// useAuth hook remains the same
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

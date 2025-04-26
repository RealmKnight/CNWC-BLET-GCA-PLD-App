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
import { useCalendarStore } from "@/store/calendarStore";
import { useVacationCalendarStore } from "@/store/vacationCalendarStore";
import { format } from "date-fns";

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

  // Refs
  const isUpdatingAuth = useRef(false);
  const pendingAuthUpdate = useRef<{ session: Session | null; source: string } | null>(null);
  const appStateTimeout = useRef<NodeJS.Timeout | null>(null);
  const initialAuthCompleteRef = useRef(false);
  // Refs for cleanup functions
  const notificationCleanupRef = useRef<(() => void) | null>(null);
  const calendarCleanupRef = useRef<(() => void) | null>(null);
  const vacationCalendarCleanupRef = useRef<(() => void) | null>(null);
  const myTimeCleanupRef = useRef<(() => void) | null>(null); // Placeholder
  // Refs for state comparison in listeners
  const appStateRef = useRef(AppState.currentState);
  const sessionRef = useRef(session);

  // Effect to keep sessionRef updated
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

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

  // --- Helper Function for Cleanup ---
  const runCleanupActions = useCallback(() => {
    console.log("[Auth] Running cleanup actions...");
    if (notificationCleanupRef.current) {
      console.log("[Auth] Cleaning up notification subscription...");
      notificationCleanupRef.current();
      notificationCleanupRef.current = null;
    }
    if (calendarCleanupRef.current) {
      console.log("[Auth] Cleaning up PLD/SDV calendar subscription/state...");
      calendarCleanupRef.current(); // Assuming calendarStore.cleanupCalendarState returns void or similar
      calendarCleanupRef.current = null;
    }
    if (vacationCalendarCleanupRef.current) {
      console.log("[Auth] Cleaning up Vacation calendar state...");
      vacationCalendarCleanupRef.current(); // Call vacation calendar cleanup
      vacationCalendarCleanupRef.current = null;
    }
    if (myTimeCleanupRef.current) {
      console.log("[Auth] Cleaning up MyTime resources (placeholder)...");
      myTimeCleanupRef.current();
      myTimeCleanupRef.current = null;
    }
    // Reset initialized flags in stores
    useNotificationStore.getState().setIsInitialized(false);
    useCalendarStore.getState().setIsInitialized(false); // Explicitly reset PLD/SDV
    useVacationCalendarStore.getState().setIsInitialized(false); // Explicitly reset Vacation
    // Need to reset myTime flag once implemented
    console.log("[Auth] Cleanup actions complete.");
  }, []);

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
      let refreshedUser: User | null = newSession?.user ?? null; // Store user locally

      try {
        // Basic state updates
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setMember(null); // Reset member initially
        setUserRole(null);
        setIsCompanyAdmin(false); // Reset derived state

        if (typeof window !== "undefined" && window.__passwordResetInProgress) {
          console.log("[Auth] Password reset in progress, setting status.");
          finalStatus = "passwordReset";
          // Also update base state for consistency if needed by UI during reset
          setIsCompanyAdmin(false);
        } else if (newSession) {
          // Fetch fresh user data only if needed or potentially stale
          // Simplified: assume newSession.user is fresh enough for this check
          // but we might need to re-fetch if roles can change externally
          refreshedUser = newSession.user;

          if (refreshedUser) {
            console.log("[Auth] User obtained, checking role:", refreshedUser.email, refreshedUser.user_metadata);
            localIsCompanyAdmin = refreshedUser.user_metadata?.role === "company_admin";
            setIsCompanyAdmin(localIsCompanyAdmin);

            if (localIsCompanyAdmin) {
              console.log("[Auth] User is company admin.");
              finalStatus = "signedInAdmin";
              useUserStore.getState().reset();
              // --- Potentially initialize admin-specific things here ---
              // Example: Fetch admin-specific data if needed
              // Ensure previous member state/subscriptions are cleaned up
              runCleanupActions();
            } else {
              console.log("[Auth] User is not company admin, fetching member data:", refreshedUser.id);
              try {
                fetchedMemberData = await fetchMemberData(refreshedUser.id);
                if (fetchedMemberData) {
                  console.log("[Auth] Member data found.");
                  setMember(fetchedMemberData);
                  setUserRole(fetchedMemberData.role as UserRole);
                  useUserStore.getState().setMember(fetchedMemberData);
                  useUserStore.getState().setUserRole(fetchedMemberData.role as UserRole);
                  finalStatus = "signedInMember";

                  // --- CENTRALIZED INITIALIZATION LOGIC ---
                  console.log("[Auth] Starting centralized initialization for member...");
                  const pinNumber = fetchedMemberData.pin_number;
                  const userId = refreshedUser.id;
                  const calendarId = fetchedMemberData.calendar_id;

                  // --- Define Date Ranges ---
                  const today = new Date();
                  // PLD/SDV Range: Today -> 6 months from now
                  const pldStartDate = format(today, "yyyy-MM-dd");
                  const pldEndDate = format(
                    new Date(today.getFullYear(), today.getMonth() + 6, today.getDate()),
                    "yyyy-MM-dd"
                  );
                  // Vacation Range: Jan 1st -> Dec 31st of current year
                  const currentYear = today.getFullYear();
                  const vacationStartDate = `${currentYear}-01-01`;
                  const vacationEndDate = `${currentYear}-12-31`;

                  console.log("[Auth Init] Date Ranges:", {
                    pldStartDate,
                    pldEndDate,
                    vacationStartDate,
                    vacationEndDate,
                  });

                  // Initialize stores concurrently
                  const initializationPromises = [];

                  // 1. Notification Store
                  const notificationStore = useNotificationStore.getState();
                  if (!notificationStore.isInitialized && pinNumber && userId) {
                    console.log("[Auth Init] Initializing Notification Store...");
                    initializationPromises.push(
                      (async () => {
                        try {
                          await notificationStore.fetchMessages(pinNumber, userId);
                          const unsubscribe = notificationStore.subscribeToMessages(pinNumber);
                          notificationCleanupRef.current = unsubscribe; // Store cleanup
                          notificationStore.setIsInitialized(true);
                          console.log("[Auth Init] Notification Store Initialized.");
                        } catch (error) {
                          console.error("[Auth Init] Error initializing Notification Store:", error);
                          notificationStore.setIsInitialized(false); // Ensure not initialized on error
                        } finally {
                        }
                      })()
                    );
                  } else {
                    console.log(
                      `[Auth Init] Skipping Notification Store init. Initialized: ${notificationStore.isInitialized}, Pin: ${pinNumber}, UserID: ${userId}`
                    );
                  }

                  // 2. PLD/SDV Calendar Store
                  const calendarStore = useCalendarStore.getState();
                  if (!calendarStore.isInitialized && calendarId) {
                    console.log("[Auth Init] Initializing PLD/SDV Calendar Store...");
                    calendarStore.setIsLoading(true);
                    calendarStore.setError(null);
                    initializationPromises.push(
                      (async () => {
                        try {
                          // Use PLD/SDV specific date range
                          await calendarStore.loadInitialData(pldStartDate, pldEndDate, calendarId);
                          calendarStore.setIsInitialized(true);
                          calendarCleanupRef.current = calendarStore.cleanupCalendarState;
                          console.log("[Auth Init] PLD/SDV Calendar Store Initialized.");
                        } catch (error) {
                          console.error("[Auth Init] Error initializing PLD/SDV Calendar Store:", error);
                          calendarStore.setIsInitialized(false);
                        } finally {
                          calendarStore.setIsLoading(false);
                        }
                      })()
                    );
                  } else {
                    console.log(
                      `[Auth Init] Skipping PLD/SDV Calendar Store init. Initialized: ${calendarStore.isInitialized}, CalendarID: ${calendarId}`
                    );
                  }

                  // 3. Vacation Calendar Store
                  const vacationStore = useVacationCalendarStore.getState();
                  if (!vacationStore.isInitialized && calendarId) {
                    console.log("[Auth Init] Initializing Vacation Calendar Store...");
                    vacationStore.setIsLoading(true);
                    vacationStore.setError(null);
                    initializationPromises.push(
                      (async () => {
                        try {
                          // Use Vacation specific date range
                          await vacationStore.loadInitialData(vacationStartDate, vacationEndDate, calendarId);
                          vacationStore.setIsInitialized(true);
                          vacationCalendarCleanupRef.current = vacationStore.cleanupCalendarState;
                          console.log("[Auth Init] Vacation Calendar Store Initialized.");
                        } catch (error) {
                          console.error("[Auth Init] Error initializing Vacation Calendar Store:", error);
                          vacationStore.setIsInitialized(false);
                        } finally {
                          vacationStore.setIsLoading(false);
                        }
                      })()
                    );
                  } else {
                    console.log(
                      `[Auth Init] Skipping Vacation Calendar Store init. Initialized: ${vacationStore.isInitialized}, CalendarID: ${calendarId}`
                    );
                  }

                  // 4. MyTime Hook (Placeholder - requires similar structure)
                  // if (!myTimeHook.isInitialized && ...) {
                  //   initializationPromises.push(async () => { ... });
                  // }

                  // Wait for all initializations to attempt completion
                  await Promise.allSettled(initializationPromises);
                  console.log("[Auth] Centralized initialization attempt complete.");

                  // --- END CENTRALIZED INITIALIZATION LOGIC ---
                } else {
                  console.log("[Auth] No matching member record found, needs association.");
                  finalStatus = "needsAssociation";
                  useUserStore.getState().reset();
                  runCleanupActions(); // Clean up any stale subscriptions if user switches
                }
              } catch (error) {
                console.error("[Auth] Error during member check/initialization:", error);
                finalStatus = "signedOut"; // Treat as error, force sign out/re-auth
                // Cleanup is important here
                runCleanupActions();
              }
            }
          } else {
            console.log("[Auth] No user in session, setting status to signedOut.");
            finalStatus = "signedOut";
            runCleanupActions(); // Clean up any stale subscriptions
          }
        } else {
          console.log("[Auth] No session found, setting status to signedOut.");
          finalStatus = "signedOut";
          runCleanupActions(); // Clean up any stale subscriptions
        }
      } catch (error) {
        console.error("[Auth] Critical error in updateAuthState:", error);
        finalStatus = "signedOut"; // Fallback to signedOut on unexpected errors
        runCleanupActions(); // Ensure cleanup happens
      } finally {
        console.log(`[Auth] Final authStatus from source '${source}': ${finalStatus}`);
        setAuthStatus(finalStatus);
        if (source === "initial") {
          initialAuthCompleteRef.current = true; // Mark initial auth check as complete
          console.log("[Auth] Initial auth check marked complete.");
        }
        isUpdatingAuth.current = false;

        // Check if there was a pending update while this one was running
        if (pendingAuthUpdate.current) {
          console.log("[Auth] Processing queued auth update from:", pendingAuthUpdate.current.source);
          const { session: pendingSession, source: pendingSource } = pendingAuthUpdate.current;
          pendingAuthUpdate.current = null; // Clear the queue
          // Use setTimeout to avoid potential deep recursion/stack issues
          setTimeout(() => updateAuthState(pendingSession, pendingSource), 0);
        }
      }
    },
    [fetchMemberData, runCleanupActions] // Include runCleanupActions dependency
  );

  // --- Authentication Listener ---
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[Auth] onAuthStateChange Event: ${event}`, session ? `User: ${session.user.id}` : "No session");

      // Handle special password recovery case
      if (event === "PASSWORD_RECOVERY") {
        console.log("[Auth] Password recovery event detected.");
        // Set a global flag or context state to indicate password reset flow
        // This helps prevent automatic redirects before reset is complete
        if (typeof window !== "undefined") {
          window.__passwordResetInProgress = true;
        }
        setAuthStatus("passwordReset"); // Set status directly
        return; // Don't proceed with regular updateAuthState
      }

      // Clear the password reset flag if event is not recovery
      if (typeof window !== "undefined" && event !== "PASSWORD_RECOVERY") {
        delete window.__passwordResetInProgress;
      }

      // Determine source for debugging
      let source = `authStateChange-${event}`;

      // Only call updateAuthState if session state actually changes
      // Comparing simple presence might be sufficient
      // More robust: compare user ID if sessions exist
      const currentSessionUserId = sessionRef.current?.user?.id;
      const newSessionUserId = session?.user?.id;

      if (currentSessionUserId !== newSessionUserId) {
        console.log(
          `[Auth] Session user change detected (${currentSessionUserId} -> ${newSessionUserId}), calling updateAuthState.`
        );
        updateAuthState(session, source);
      } else {
        console.log(`[Auth] Auth state change (${event}), but session user unchanged. Skipping updateAuthState.`);
        // If the event is USER_UPDATED, we might still want to refetch member data if role could change
        // For now, assume role changes require re-login or are handled elsewhere.
      }
    });

    // Initial check
    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        console.log(
          "[Auth] Initial getSession result:",
          initialSession ? `User: ${initialSession.user.id}` : "No session"
        );
        // Only call update if initialAuthCompleteRef is false
        if (!initialAuthCompleteRef.current) {
          updateAuthState(initialSession, "initial");
        } else {
          console.log("[Auth] Skipping initial updateAuthState as initial check already completed.");
        }
      })
      .catch((error) => {
        console.error("[Auth] Error during initial getSession:", error);
        if (!initialAuthCompleteRef.current) {
          updateAuthState(null, "initial-error"); // Ensure loading state resolves
        }
      });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [updateAuthState]); // Add updateAuthState as dependency

  // --- AppState Listener ---
  useEffect(() => {
    const handleAppStateChange = (nextAppState: any) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === "active") {
        console.log("[Auth] App has come to the foreground!");

        // Debounce the check slightly to avoid rapid calls
        if (appStateTimeout.current) {
          clearTimeout(appStateTimeout.current);
        }

        appStateTimeout.current = setTimeout(() => {
          console.log("[Auth] Checking session validity on app focus...");
          supabase.auth
            .getSession()
            .then(({ data: { session: currentValidSession } }) => {
              const currentSessionUserId = sessionRef.current?.user?.id;
              const validSessionUserId = currentValidSession?.user?.id;
              console.log("[Auth] Focus check comparison:", { currentSessionUserId, validSessionUserId });
              if (currentSessionUserId !== validSessionUserId) {
                console.log("[Auth] Session changed while app was in background. Updating auth state.");
                updateAuthState(currentValidSession, "appStateChange-focus-diff");
              } else {
                console.log("[Auth] Session still valid on app focus.");
                // Optional: Verify realtime connections or trigger a light refresh if needed
              }
            })
            .catch((error) => {
              console.error("[Auth] Error checking session on app focus:", error);
              // Decide if this error should trigger a sign-out
              // updateAuthState(null, "appStateChange-error");
            });
        }, 500); // 500ms debounce
      }
      appStateRef.current = nextAppState;
      setAppState(nextAppState); // Keep state updated if needed elsewhere
      console.log("[Auth] AppState changed to:", nextAppState);
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
      if (appStateTimeout.current) {
        clearTimeout(appStateTimeout.current);
      }
    };
  }, [updateAuthState]); // updateAuthState dependency

  // --- Authentication Functions ---
  const signIn = async (email: string, password: string) => {
    setAuthStatus("loading"); // Show loading during sign-in attempt
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // onAuthStateChange will handle the session update and trigger updateAuthState
    } catch (error: any) {
      console.error("[Auth] Sign in error:", error);
      setAuthStatus("signedOut"); // Revert status on error
      throw error; // Re-throw for UI handling
    }
  };

  const signUp = async (email: string, password: string) => {
    setAuthStatus("loading");
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: Linking.createURL("/") },
      });
      if (error) throw error;
      // User needs to confirm email, state remains loading/signedOut until confirmed
      // Maybe add a specific status like 'needsEmailConfirmation'?
      // For now, rely on onAuthStateChange after confirmation link is clicked
      alert("Sign up successful! Please check your email to confirm.");
    } catch (error: any) {
      console.error("[Auth] Sign up error:", error);
      setAuthStatus("signedOut");
      throw error;
    }
  };

  const signOut = async () => {
    console.log("[Auth] Attempting sign out...");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("[Auth] Error during sign out:", error);
        // Still attempt cleanup even if Supabase signout fails
      } else {
        console.log("[Auth] Supabase sign out successful.");
      }
      // Clear local state immediately regardless of Supabase call success
      // setAuthStatus("signedOut"); // Let onAuthStateChange handle this
      // Reset local state immediately
      setSession(null);
      setUser(null);
      setMember(null);
      setUserRole(null);
      setIsCompanyAdmin(false);
      useUserStore.getState().reset();
      // Run cleanup
      runCleanupActions();
      // DO NOT NAVIGATE HERE - let _layout handle it based on authStatus change
      // router.replace('/sign-in'); // REMOVED
    } catch (error) {
      console.error("[Auth] Unexpected error during sign out process:", error);
      // Attempt cleanup even on unexpected errors
      runCleanupActions();
      setAuthStatus("signedOut"); // Force status update on error
    }
  };

  // resetPassword remains the same
  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: Linking.createURL("/reset-password"), // URL for the password update form
      });
      if (error) throw error;
      alert("Password reset email sent! Please check your inbox.");
    } catch (error) {
      console.error("Error sending password reset email:", error);
      throw error;
    }
  };

  // exchangeCodeForSession remains the same
  const exchangeCodeForSession = async (code: string) => {
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      // Session should be set via onAuthStateChange listener
    } catch (error) {
      console.error("Error exchanging code for session:", error);
      throw error;
    }
  };

  // updateProfile remains the same (but might need role check for security)
  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) throw new Error("Not authenticated");
    try {
      // Add checks here if certain profile fields should only be updated by specific roles
      const { error } = await supabase.auth.updateUser({ data: updates });
      if (error) throw error;
      // Re-fetch user data or rely on onAuthStateChange if metadata updates trigger it
    } catch (error) {
      console.error("Error updating profile:", error);
      throw error;
    }
  };

  // associateMemberWithPin remains the same
  const associateMemberWithPin = async (pin: string) => {
    if (!user) throw new Error("Not authenticated");
    try {
      const { data, error } = await supabase.rpc("associate_member_with_pin", {
        input_pin: parseInt(pin, 10),
        input_user_id: user.id,
        input_email: user.email || "",
      });

      if (error) throw error;

      if (data) {
        // Association successful, re-trigger auth state update to fetch member data
        updateAuthState(session, "associationSuccess");
      } else {
        throw new Error("PIN association failed. Please check the PIN and try again.");
      }
    } catch (error) {
      console.error("Error associating member with PIN:", error);
      throw error;
    }
  };

  // Memoize the context value
  const value = useMemo(
    () => ({
      user,
      session,
      member,
      isCompanyAdmin,
      userRole,
      authStatus,
      signOut,
      signIn,
      signUp,
      resetPassword,
      exchangeCodeForSession,
      updateProfile,
      associateMemberWithPin,
    }),
    [user, session, member, isCompanyAdmin, userRole, authStatus, signOut] // Keep minimal deps
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook to use the AuthContext
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

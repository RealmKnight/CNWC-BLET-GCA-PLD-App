import { createContext, useContext, useEffect, useState, ReactNode, useRef, useMemo, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "../utils/supabase";
import { Database } from "../types/supabase";
import * as Linking from "expo-linking";
import { Platform, AppState } from "react-native";
import { UserRole, UserProfile } from "@/types/auth";
import { useUserStore } from "@/store/userStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useCalendarStore, setupCalendarSubscriptions } from "@/store/calendarStore";
import { useVacationCalendarStore, setupVacationCalendarSubscriptions } from "@/store/vacationCalendarStore";
import { useAdminNotificationStore } from "@/store/adminNotificationStore";
import { format } from "date-fns";
import { useTimeStore } from "@/store/timeStore";
// Import the notification service integration function
import { initializeNotificationServiceIntegration } from "@/utils/notificationService";

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
  | "signedInAdmin"; // Session exists, user is a company admin

interface AuthContextType {
  user: User | null;
  session: Session | null;
  member: Member | null;
  isCompanyAdmin: boolean; // Keep for potential direct checks elsewhere
  userRole: UserRole | null;
  authStatus: AuthStatus; // <-- Replace isLoading and isMemberCheckComplete
  isPasswordRecoveryFlow: boolean; // <-- ADDED FLAG
  signOut: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  associateMemberWithPin: (pin: string) => Promise<void>;
  signalPasswordRecoveryStart: () => void; // <-- ADDED FUNCTION
  clearPasswordRecoveryFlag: () => void; // <-- ADDED FUNCTION
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
  const [isPasswordRecoveryFlow, setIsPasswordRecoveryFlow] = useState(false); // <-- ADDED STATE

  // Refs
  const isUpdatingAuth = useRef(false);
  const pendingAuthUpdate = useRef<{ session: Session | null; source: string } | null>(null);
  const appStateTimeout = useRef<NodeJS.Timeout | null>(null);
  const initialAuthCompleteRef = useRef(false);
  // Add a ref to track successfully initialized user IDs
  const initializedUserIdRef = useRef<string | null>(null);
  // Refs for cleanup functions
  const notificationCleanupRef = useRef<(() => void) | null>(null);
  const calendarCleanupRef = useRef<(() => void) | null>(null);
  const vacationCalendarCleanupRef = useRef<(() => void) | null>(null);
  const adminNotificationCleanupRef = useRef<(() => void) | null>(null); // Add ref for admin store cleanup
  // Refs for state comparison in listeners
  const appStateRef = useRef(AppState.currentState);
  const sessionRef = useRef(session);

  // Initialize notification service integration once when component mounts
  useEffect(() => {
    console.log("[Auth] Initializing notification service integration...");
    try {
      initializeNotificationServiceIntegration();
      console.log("[Auth] Notification service integration initialized successfully");
    } catch (error) {
      console.error("[Auth] Error initializing notification service integration:", error);
    }
  }, []); // Empty dependency array - runs once on mount

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

    // Clean up any existing subscriptions by calling their cleanup functions
    if (notificationCleanupRef.current) {
      console.log("[Auth] Cleaning up notification subscription...");
      notificationCleanupRef.current();
      notificationCleanupRef.current = null;
    }

    if (calendarCleanupRef.current) {
      console.log("[Auth] Cleaning up PLD/SDV calendar subscription/state...");
      calendarCleanupRef.current();
      calendarCleanupRef.current = null;
    }

    if (vacationCalendarCleanupRef.current) {
      console.log("[Auth] Cleaning up Vacation calendar state...");
      vacationCalendarCleanupRef.current();
      vacationCalendarCleanupRef.current = null;
    }

    // --- Cleanup for Time Store ---
    console.log("[Auth] Cleaning up Time Store...");
    try {
      useTimeStore.getState().cleanup(); // Call the store's cleanup directly
    } catch (error) {
      console.error("[Auth] Error cleaning up Time Store:", error);
    }

    // --- Cleanup for Admin Notifications ---
    if (adminNotificationCleanupRef.current) {
      console.log("[Auth] Cleaning up Admin Notification subscription...");
      adminNotificationCleanupRef.current();
      adminNotificationCleanupRef.current = null;
    }

    // Reset initialized flags in stores - doing this for all user types to ensure clean state
    useNotificationStore.getState().setIsInitialized(false);
    useCalendarStore.getState().setIsInitialized(false);
    useVacationCalendarStore.getState().setIsInitialized(false);
    useUserStore.getState().reset();

    // Call explicit cleanup on admin notification store
    useAdminNotificationStore.getState().cleanupAdminNotifications();

    // Reset initialized flag for Time Store
    useTimeStore.getState().setIsInitialized(false);

    console.log("[Auth] Cleanup actions complete.");
  }, []);

  // Add a new helper function to initialize all stores after auth is confirmed
  const initializeUserStores = useCallback(async (userId: string, calendarId: string | null) => {
    console.log("[Auth] Initializing user stores with userId:", userId, "calendarId:", calendarId);

    try {
      // UPDATED INITIALIZATION ORDER: Notification Store → Calendar → Vacation Calendar → Time Store → Admin Store
      // This prioritizes urgent notifications while other stores initialize

      // 1. Initialize notification store for the user (MOVED TO FIRST POSITION)
      const notificationStore = useNotificationStore.getState();
      if (!notificationStore.isInitialized) {
        console.log("[Auth] Initializing notification store...");
        // Set up notification subscription and store cleanup function
        const notificationCleanup = notificationStore.subscribeToMessages(userId);
        notificationCleanupRef.current = notificationCleanup;

        // Fetch initial messages with just userId (function will query pin number from member data)
        await notificationStore.fetchMessages(userId, userId);
        console.log("[Auth] Notification store initialized");
      }

      // Initialize calendar-dependent stores only if calendarId is available
      if (calendarId) {
        // 2. Initialize calendar store
        const calendarStore = useCalendarStore.getState();
        if (!calendarStore.isInitialized) {
          console.log("[Auth] Initializing calendar store...");
          // Get current date for date range
          const now = new Date();
          const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const endDate = new Date(now.getFullYear(), now.getMonth() + 8, 0);
          const formattedStartDate = format(startDate, "yyyy-MM-dd");
          const formattedEndDate = format(endDate, "yyyy-MM-dd");

          await calendarStore.loadInitialData(formattedStartDate, formattedEndDate, calendarId);
          console.log("[Auth] Calendar store initialized");

          // Set up calendar subscriptions and store cleanup function
          const calendarCleanup = setupCalendarSubscriptions();
          calendarCleanupRef.current = calendarCleanup;
        }

        // 3. Initialize vacation calendar store
        const vacationCalendarStore = useVacationCalendarStore.getState();
        if (!vacationCalendarStore.isInitialized) {
          console.log("[Auth] Initializing vacation calendar store...");
          // Get current date for date range
          const now = new Date();
          const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const endDate = new Date(now.getFullYear(), now.getMonth() + 8, 0);
          const formattedStartDate = format(startDate, "yyyy-MM-dd");
          const formattedEndDate = format(endDate, "yyyy-MM-dd");

          await vacationCalendarStore.loadInitialData(formattedStartDate, formattedEndDate, calendarId);
          console.log("[Auth] Vacation calendar store initialized");

          // Set up vacation calendar subscriptions and store cleanup function
          const vacationCalendarCleanup = setupVacationCalendarSubscriptions();
          vacationCalendarCleanupRef.current = vacationCalendarCleanup;
        }

        // 4. Initialize Time Store
        console.log("[Auth] Initializing time store...");
        try {
          const timeStore = useTimeStore.getState();
          if (!timeStore.isInitialized) {
            console.log("[Auth] TimeStore not initialized, proceeding with initialization.");
            await timeStore.initialize(userId);
            console.log("[Auth] Time store initialized successfully");
          } else {
            console.log("[Auth] TimeStore ALREADY INITIALIZED, skipping re-initialization.");
          }
        } catch (error) {
          console.error("[Auth] Error initializing Time Store:", error);
          // Decide how to handle store init error (e.g., log, set global error state?)
          // For now, just logging.
        }
      } else {
        console.log("[Auth] No calendar ID found for member, skipping calendar store initialization.");
      }

      // 5. Initialize MyTime hook
      // console.log("[Auth] Initializing myTime hook..."); // Remove old init call
      // try {
      // const { cleanup: myTimeCleanup } = await initializeMyTimeHook(userId, true); // Remove old init call
      // myTimeCleanupRef.current = myTimeCleanup; // Remove old init call
      // console.log("[Auth] MyTime hook initialized successfully"); // Remove old init call
      // } catch (error) {
      // console.error("[Auth] Error initializing MyTime hook:", error); // Remove old init call
      // Handle error appropriately
      // }

      console.log("[Auth] All stores initialized successfully");
    } catch (error) {
      console.error("[Auth] Error initializing stores:", error);
      // We don't throw here to prevent breaking the auth flow
      // Instead, individual stores will handle their own error states
    }
  }, []);

  // Add a new helper function to initialize admin-specific stores
  const initializeAdminStores = useCallback(
    async (userId: string, role: UserRole | "company_admin" | null = null, divisionId: number | null = null) => {
      console.log("[Auth] Initializing admin stores with userId:", userId, "role:", role);

      try {
        // Initialize admin notification store
        const adminNotificationStore = useAdminNotificationStore.getState();
        if (!adminNotificationStore.isInitialized && userId) {
          console.log("[Auth] Initializing admin notification store...");
          // Convert role to array of roles for the store
          const userRoles: UserRole[] = [];
          // Add the user's role if it's a valid admin role
          if (role && role !== "company_admin" && role !== "user") {
            userRoles.push(role as UserRole);
          }

          // Call initialize with proper parameters
          const isCompanyAdmin = role === "company_admin";
          const cleanup = adminNotificationStore.initializeAdminNotifications(
            userId,
            userRoles,
            divisionId,
            isCompanyAdmin
          );

          if (cleanup) {
            adminNotificationCleanupRef.current = cleanup;
            console.log("[Auth] Admin notification cleanup function stored");
          }
        }

        console.log("[Auth] Admin stores initialized successfully");
      } catch (error) {
        console.error("[Auth] Error initializing admin stores:", error);
      }
    },
    []
  );

  const updateAuthState = useCallback(
    async (newSession: Session | null, source: string) => {
      // Prevent concurrent updates
      if (isUpdatingAuth.current) {
        console.log("[Auth] Update already in progress, queueing update from:", source);
        pendingAuthUpdate.current = { session: newSession, source };
        return;
      }
      isUpdatingAuth.current = true;

      console.log(
        `[Auth] Starting updateAuthState. Source: ${source}. Current User: ${user?.id}, New Session User: ${newSession?.user?.id}`
      );

      // --- Smart Cleanup Logic ---
      const previousUserId = user?.id; // Store current user ID before potential state changes
      const newUserId = newSession?.user?.id;

      // Enhanced cleanup check logic - only cleanup if:
      // 1. User has changed AND
      // 2. This is not the user we've just initialized successfully
      const needsCleanup =
        (previousUserId !== newUserId || (!newUserId && previousUserId)) && // User change
        newUserId !== initializedUserIdRef.current; // Not the user we just initialized

      if (needsCleanup) {
        console.log(
          `[Auth] User change detected (Previous: ${previousUserId}, New: ${newUserId}). Running cleanup actions.`
        );
        runCleanupActions();
      } else if (newUserId === initializedUserIdRef.current) {
        console.log(`[Auth] Skipping cleanup for already initialized user ID: ${newUserId}`);
      } else {
        console.log(`[Auth] User ID unchanged (${newUserId}). Skipping cleanup.`);
      }
      // --- End Smart Cleanup Logic ---

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
        // Basic state updates - Only update if changed or needed based on cleanup
        if (needsCleanup) {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          setMember(null); // Reset member on cleanup
          setUserRole(null);
          setIsCompanyAdmin(false); // Reset derived state
        } else {
          // If no cleanup needed, session might still need update if token refreshed, etc.
          setSession(newSession);
        }

        if (newSession) {
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

              // CRITICAL: Set auth status immediately for company admin too
              console.log(`[Auth IMMEDIATE] Setting authStatus to ${finalStatus} for company admin`);
              setAuthStatus(finalStatus);

              // Create a minimal representation based on the *required* fields for the frontend type
              const adminMemberRep: Partial<Member> = {
                id: refreshedUser.id, // Use the auth ID
                role: "user", // Set a default valid role from UserRole type
                first_name: "Company", // Placeholder name
                last_name: "Admin", // Placeholder name
                // Keep only fields confirmed to be in the frontend Member type definition
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                division_id: null,
                calendar_id: null,
                current_zone_id: null,
                home_zone_id: null,
                phone_number: null,
                status: "ACTIVE",
                company_hire_date: null,
                date_of_birth: null,
                wc_sen_roster: null, // Keep if confirmed in type
                deleted: false,
                pin_number: undefined,
              };

              // Use setMember with the partial admin representation (cast needed)
              useUserStore.getState().setMember(adminMemberRep as Member);
              // Set userRole in store to null, as 'company_admin' isn't a UserRole
              useUserStore.getState().setUserRole(null);
              console.log("[Auth] Set minimal userStore state for company admin:", { id: refreshedUser.id });

              // Initialize admin-specific stores after setting up user store
              // Ensure this only runs if needed (e.g., first time or after cleanup)
              if (needsCleanup || !adminNotificationCleanupRef.current) {
                // Example condition
                await initializeAdminStores(refreshedUser.id, "company_admin");
              }

              // Mark this user as successfully initialized
              initializedUserIdRef.current = refreshedUser.id;
              console.log(`[Auth] Marked user ${refreshedUser.id} as successfully initialized`);
            } else {
              // MEMBER FLOW - Try to get member data
              console.log("[Auth] Checking for member data...");
              try {
                fetchedMemberData = await fetchMemberData(refreshedUser.id);
              } catch (memberError) {
                console.error("[Auth] Error fetching member data:", memberError);
              }

              if (fetchedMemberData) {
                console.log("[Auth] Found member data, setting up user account...");
                setMember(fetchedMemberData);
                // Set appropriate auth status
                finalStatus = "signedInMember";
                const memberRole = fetchedMemberData.role as UserRole;
                setUserRole(memberRole);

                // CRITICAL: Set auth status immediately so navigation logic can proceed
                console.log(`[Auth IMMEDIATE] Setting authStatus to ${finalStatus}`);
                setAuthStatus(finalStatus);

                // Save to userStore right away
                useUserStore.getState().setMember(fetchedMemberData);
                useUserStore.getState().setUserRole(memberRole);

                // Initialize all user-specific stores and hooks after confirming member data
                // The initialize function within each store already prevents re-initialization
                if (fetchedMemberData.id) {
                  await initializeUserStores(fetchedMemberData.id, fetchedMemberData.calendar_id);

                  // Check if the member has an admin role (not "user") and initialize admin stores if needed
                  if (memberRole !== "user") {
                    console.log("[Auth] Member has admin role:", memberRole, "initializing admin stores");
                    // Ensure this only runs if needed (e.g., first time or after cleanup)
                    if (needsCleanup || !adminNotificationCleanupRef.current) {
                      // Example condition
                      await initializeAdminStores(
                        fetchedMemberData.id,
                        memberRole,
                        fetchedMemberData.division_id ? Number(fetchedMemberData.division_id) : null
                      );
                    }
                  }

                  // Mark this user as successfully initialized
                  initializedUserIdRef.current = fetchedMemberData.id;
                  console.log(`[Auth] Marked user ${fetchedMemberData.id} as successfully initialized`);
                } else {
                  console.error("[Auth] Member data has null ID, cannot initialize stores");
                }
              } else {
                // No member data found - need association
                console.log("[Auth] No member data found, account needs association");
                finalStatus = "needsAssociation";
                console.log(`[Auth IMMEDIATE] Setting authStatus to ${finalStatus}`);
                setAuthStatus(finalStatus);
              }
            }
          } else {
            // We have a session but no user - should not happen under normal operation
            console.warn("[Auth] Session exists but no user found - unusual state");
            finalStatus = "signedOut";
            console.log(`[Auth IMMEDIATE] Setting authStatus to ${finalStatus} (unusual)`);
            setAuthStatus(finalStatus);
          }
        } else {
          // No session - definitively signed out
          console.log("[Auth] No session, user is signed out");
          finalStatus = "signedOut";
          console.log(`[Auth IMMEDIATE] Setting authStatus to ${finalStatus}`);
          setAuthStatus(finalStatus);
          // Ensure state reflects sign-out if cleanup wasn't triggered (edge case)
          if (!needsCleanup) {
            setMember(null);
            setUserRole(null);
            setIsCompanyAdmin(false);
          }

          // Clear the initialized user ID ref on sign out
          if (initializedUserIdRef.current) {
            console.log(`[Auth] Clearing initialized user ID: ${initializedUserIdRef.current}`);
            initializedUserIdRef.current = null;
          }
        }

        console.log("[Auth] Auth state update complete from source:", source);
        initialAuthCompleteRef.current = true;
      } catch (err) {
        // Handle any errors during the auth status check
        console.error("[Auth] Error during auth state update:", err);
        finalStatus = "signedOut"; // Default to signed out on error
        setAuthStatus(finalStatus);
        initialAuthCompleteRef.current = true; // Mark as complete even on error
      } finally {
        // Reset the updating flag
        isUpdatingAuth.current = false;

        // Handle any pending update if it exists
        if (pendingAuthUpdate.current) {
          const { session: pendingSession, source: pendingSource } = pendingAuthUpdate.current;
          console.log("[Auth] Processing pending update from:", pendingSource);
          pendingAuthUpdate.current = null; // Clear before processing
          updateAuthState(pendingSession, pendingSource);
        }
      }
    },
    [fetchMemberData, runCleanupActions, initializeUserStores, initializeAdminStores]
  );

  // --- Authentication Listener ---
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[Auth] onAuthStateChange Event: ${event}`, session ? `User: ${session.user.id}` : "No session");

      // Determine source for debugging
      let source = `authStateChange-${event}`;

      // Only call updateAuthState if session state actually changes
      const currentSessionUserId = sessionRef.current?.user?.id;
      const newSessionUserId = session?.user?.id;

      if (currentSessionUserId !== newSessionUserId) {
        console.log(
          `[Auth] Session user change detected (${currentSessionUserId} -> ${newSessionUserId}), calling updateAuthState.`
        );
        updateAuthState(session, source);
      } else {
        console.log(`[Auth] Auth state change (${event}), but session user unchanged. Skipping updateAuthState.`);
      }
    });

    // Always get the current session - Supabase may have already set it up from URL parameters
    console.log("[Auth] Performing initial session check");
    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        console.log(
          "[Auth] Initial getSession result:",
          initialSession ? `User: ${initialSession.user.id}` : "No session"
        );
        // Always update auth state with the initial session
        updateAuthState(initialSession, "initial");
      })
      .catch((error) => {
        console.error("[Auth] Error during initial getSession:", error);
        updateAuthState(null, "initial-error");
      });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [updateAuthState]);

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
        options: { emailRedirectTo: Linking.createURL("/(auth)/sign-in") },
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
    try {
      console.log("[Auth] Signing out and cleaning up all state...");

      // Clear the initialized user ID before cleanup
      initializedUserIdRef.current = null;

      // First, run our cleanup function to properly release resources
      runCleanupActions();

      // Then perform actual sign out
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      console.log("[Auth] Sign out successful");
    } catch (error) {
      console.error("[Auth] Error during sign out:", error);
    }
  };

  // resetPassword function update
  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: Linking.createURL("/change-password"), // Use root path for password reset
      });
      if (error) throw error;
      alert("Password reset email sent! Please check your inbox.");
    } catch (error) {
      console.error("Error sending password reset email:", error);
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

  // --- Add functions for managing the flag ---
  const signalPasswordRecoveryStart = useCallback(() => {
    console.log("[Auth] Signaling start of password recovery flow");
    setIsPasswordRecoveryFlow(true);
  }, []);

  const clearPasswordRecoveryFlag = useCallback(() => {
    if (isPasswordRecoveryFlow) {
      // Only log if it was actually true
      console.log("[Auth] Clearing password recovery flag");
      setIsPasswordRecoveryFlow(false);
    }
  }, [isPasswordRecoveryFlow]); // Depend on the flag itself

  // Memoize the context value
  const value = useMemo(
    () => ({
      user,
      session,
      member,
      isCompanyAdmin,
      userRole,
      authStatus,
      isPasswordRecoveryFlow, // <-- ADDED
      signOut,
      signIn,
      signUp,
      resetPassword,
      updateProfile,
      associateMemberWithPin,
      signalPasswordRecoveryStart, // <-- ADDED
      clearPasswordRecoveryFlag, // <-- ADDED
    }),
    [
      user,
      session,
      member,
      isCompanyAdmin,
      userRole,
      authStatus,
      isPasswordRecoveryFlow, // <-- ADDED DEPENDENCY
      signOut, // Keep minimal deps for functions
      signalPasswordRecoveryStart,
      clearPasswordRecoveryFlag,
    ]
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

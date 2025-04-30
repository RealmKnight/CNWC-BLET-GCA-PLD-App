import { createContext, useContext, useEffect, useState, ReactNode, useRef, useMemo, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "../utils/supabase";
import { Database } from "../types/supabase";
import * as Linking from "expo-linking";
import { Platform, AppState } from "react-native";
import { UserRole, UserProfile } from "@/types/auth";
import { useUserStore } from "@/store/userStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useCalendarStore } from "@/store/calendarStore";
import { useVacationCalendarStore } from "@/store/vacationCalendarStore";
import { useAdminNotificationStore } from "@/store/adminNotificationStore";
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
  // Refs for cleanup functions
  const notificationCleanupRef = useRef<(() => void) | null>(null);
  const calendarCleanupRef = useRef<(() => void) | null>(null);
  const vacationCalendarCleanupRef = useRef<(() => void) | null>(null);
  const myTimeCleanupRef = useRef<(() => void) | null>(null); // Placeholder
  const adminNotificationCleanupRef = useRef<(() => void) | null>(null); // Add ref for admin store cleanup
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

    if (myTimeCleanupRef.current) {
      console.log("[Auth] Cleaning up MyTime resources (placeholder)...");
      myTimeCleanupRef.current();
      myTimeCleanupRef.current = null;
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

    // Call explicit cleanup on admin notification store
    useAdminNotificationStore.getState().cleanupAdminNotifications();

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

              // --- MODIFICATION START ---
              // useUserStore.getState().reset(); // REMOVED: Don't reset for admin
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
              // --- MODIFICATION END ---

              // Ensure previous member state/subscriptions are cleaned up
              runCleanupActions(); // Run cleanup *before* initializing new stores

              // Reuse the initialization logic from the member section
              const userId = refreshedUser.id;
              const assignedDivisionId = null;
              const effectiveUserRoles: UserRole[] = []; // Pass empty array

              // COMPANY ADMIN SHOULD ONLY INITIALIZE ADMIN NOTIFICATION STORE
              // Skip Calendar, Vacation Calendar, and regular Notification initializations for company admins
              const adminNotificationStore = useAdminNotificationStore.getState();
              if (!adminNotificationStore.isInitialized && userId) {
                console.log("[Auth Init - Admin] Initializing Admin Notification Store...");
                try {
                  const cleanupFn = adminNotificationStore.initializeAdminNotifications(
                    userId,
                    effectiveUserRoles,
                    assignedDivisionId,
                    true // Pass true for isCompanyAdmin
                  );
                  adminNotificationCleanupRef.current = cleanupFn; // Store cleanup
                  console.log(
                    "[Auth Init - Admin] Admin Notification Store Initialized (subscription setup initiated)."
                  );
                } catch (error) {
                  console.error("[Auth Init - Admin] Error initializing Admin Notification Store:", error);
                }
              } else {
                console.log(
                  `[Auth Init - Admin] Skipping Admin Notification Store init. Initialized: ${adminNotificationStore.isInitialized}, UserID: ${userId}`
                );
              }
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

                  // CRITICAL: Set auth status immediately after determining member status
                  // This allows the UI to become interactive while data loads in background
                  console.log(`[Auth IMMEDIATE] Setting authStatus to ${finalStatus}`);
                  setAuthStatus(finalStatus);

                  // --- CENTRALIZED INITIALIZATION LOGIC ---
                  console.log("[Auth] Starting background initialization for member...");
                  const pinNumber = fetchedMemberData.pin_number;
                  const userId = refreshedUser.id;
                  const calendarId = fetchedMemberData.calendar_id;
                  const assignedDivisionId = fetchedMemberData.division_id; // Get assigned division ID
                  const effectiveUserRoles = [fetchedMemberData.role as UserRole]; // Basic role, could fetch effective roles if needed

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

                  // Check if we should initialize member-specific stores (not for company admins)
                  const shouldInitializeMemberStores = !localIsCompanyAdmin;

                  // 1. Notification Store - Only for regular members
                  if (shouldInitializeMemberStores) {
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

                    // 2. PLD/SDV Calendar Store - Only for regular members
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

                    // 3. Vacation Calendar Store - Only for regular members
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
                  } else {
                    console.log("[Auth Init] Skipping member-specific store initialization for company admin");
                  }

                  // --- 4. Admin Notification Store --- (initialize for both members and admins)
                  const adminNotificationStore = useAdminNotificationStore.getState();
                  if (!adminNotificationStore.isInitialized && userId) {
                    // Use the correct log prefix based on whether this is a company admin or regular member
                    const logPrefix = shouldInitializeMemberStores
                      ? "[Auth Init - Member]"
                      : "[Auth Init - Member Admin]";
                    console.log(`${logPrefix} Initializing Admin Notification Store...`);
                    initializationPromises.push(
                      (async () => {
                        try {
                          // Pass necessary info: userId, roles, assigned division
                          const cleanupFn = adminNotificationStore.initializeAdminNotifications(
                            userId,
                            effectiveUserRoles,
                            assignedDivisionId,
                            false // Pass false for isCompanyAdmin for members
                          );
                          adminNotificationCleanupRef.current = cleanupFn; // Store cleanup
                          console.log(
                            `${logPrefix} Admin Notification Store Initialized (subscription setup initiated).`
                          );
                        } catch (error) {
                          console.error(`${logPrefix} Error initializing Admin Notification Store:`, error);
                          // isInitialized is handled within the store's init function
                        }
                      })()
                    );
                  } else {
                    const logPrefix = shouldInitializeMemberStores
                      ? "[Auth Init - Member]"
                      : "[Auth Init - Member Admin]";
                    console.log(
                      `${logPrefix} Skipping Admin Notification Store init. Initialized: ${adminNotificationStore.isInitialized}, UserID: ${userId}`
                    );
                  }
                  // --- End Admin Notification Store ---

                  // 5. MyTime Hook (Placeholder - requires similar structure)
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

                  // Set auth status immediately
                  console.log(`[Auth IMMEDIATE] Setting authStatus to ${finalStatus}`);
                  setAuthStatus(finalStatus);

                  useUserStore.getState().reset();
                  runCleanupActions(); // Clean up any stale subscriptions if user switches
                }
              } catch (error) {
                console.error("[Auth] Error during member check/initialization:", error);
                finalStatus = "signedOut"; // Treat as error, force sign out/re-auth

                // Set auth status immediately
                console.log(`[Auth IMMEDIATE] Setting authStatus to ${finalStatus} due to error`);
                setAuthStatus(finalStatus);

                // Cleanup is important here
                runCleanupActions();
              }
            }
          } else {
            console.log("[Auth] No user in session, setting status to signedOut.");
            finalStatus = "signedOut";

            // Set auth status immediately
            console.log(`[Auth IMMEDIATE] Setting authStatus to ${finalStatus}`);
            setAuthStatus(finalStatus);

            runCleanupActions(); // Clean up any stale subscriptions
          }
        } else {
          console.log("[Auth] No session found, setting status to signedOut.");
          finalStatus = "signedOut";

          // Set auth status immediately
          console.log(`[Auth IMMEDIATE] Setting authStatus to ${finalStatus}`);
          setAuthStatus(finalStatus);

          runCleanupActions(); // Clean up any stale subscriptions
        }

        // We've already set the auth status immediately in each condition above
        // No need for a final setAuthStatus call here
      } catch (error) {
        console.error("[Auth] Critical error in updateAuthState's main try block:", error);
        finalStatus = "signedOut"; // Fallback to signedOut on unexpected errors

        // Set status immediately in catch block too
        console.log(`[Auth CATCH] Setting authStatus to ${finalStatus} due to error`);
        setAuthStatus(finalStatus);

        runCleanupActions(); // Ensure cleanup happens
      } finally {
        // Only handle cleanup, pending updates, and marking completion
        // Store initialization is now handled in the main block when member data is confirmed

        // Mark initial auth check as complete
        if (source === "initial") {
          initialAuthCompleteRef.current = true;
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

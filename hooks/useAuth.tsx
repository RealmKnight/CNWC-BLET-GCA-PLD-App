import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "../utils/supabase";
import { Database } from "../types/supabase";
import { router, useRootNavigation } from "expo-router";
import { Platform } from "react-native";
import { UserRole, UserProfile } from "@/types/auth";

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
  const rootNavigation = useRootNavigation();

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

  async function handleUserRouting(currentUser: User) {
    try {
      console.log("[Auth] Processing user:", currentUser.email);
      const memberData = await fetchMemberData(currentUser.id);

      if (memberData) {
        console.log("[Auth] Setting role:", memberData.role);
        setMember(memberData);
        setUserRole(memberData.role as UserRole);
      } else {
        console.log("[Auth] No member data found");
        setMember(null);
        setUserRole(null);
      }
    } catch (error) {
      console.error("[Auth] Error processing user:", error);
      setMember(null);
      setUserRole(null);
      throw error;
    }
  }

  // Effect to handle auth state
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        console.log("[Auth] Initializing...");
        // Skip auth initialization during SSR
        if (Platform.OS === "web" && typeof window === "undefined") {
          return;
        }

        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("[Auth] Session error:", error);
          throw error;
        }

        console.log("[Auth] Session check:", {
          status: initialSession ? "active" : "none",
          email: initialSession?.user?.email,
        });

        if (mounted) {
          setSession(initialSession);
          setUser(initialSession?.user ?? null);

          if (initialSession?.user) {
            await handleUserRouting(initialSession.user);
          }

          setIsLoading(false);
        }
      } catch (error) {
        console.error("[Auth] Initialization error:", error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    console.log("[Auth] Starting initialization");
    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("[Auth] State change:", { event, email: session?.user?.email });
      if (!mounted) return;

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await handleUserRouting(session.user);
      } else {
        setMember(null);
        setUserRole(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
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
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("*")
        .eq("pin_number", pinNumber)
        .single();

      if (memberError) throw memberError;
      if (!memberData) throw new Error("Invalid PIN number");

      // Check if member is already associated
      if (memberData.id) {
        throw new Error("This PIN is already associated with another user");
      }

      const { error: updateError } = await supabase.from("members").update({ id: user.id }).eq("pin_number", pinNumber);

      if (updateError) throw updateError;

      setMember(memberData);
      await handleUserRouting(user);
    } catch (error) {
      console.error("Error associating member:", error);
      throw error;
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) throw new Error("No user logged in");

    try {
      const { error } = await supabase.auth.updateUser({
        data: updates,
      });

      if (error) throw error;
    } catch (error) {
      console.error("Error updating profile:", error);
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

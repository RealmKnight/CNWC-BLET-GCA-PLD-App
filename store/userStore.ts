import { create } from "zustand";
import { Database } from "@/types/supabase";
import { UserRole } from "@/types/auth";
import { supabase } from "@/utils/supabase"; // Import supabase

type Member = Database["public"]["Tables"]["members"]["Row"];

// Phone verification types
type PhoneVerificationStatus =
  | "not_started"
  | "pending"
  | "verified"
  | "locked_out";

interface PhoneVerificationState {
  phoneNumber: string | null;
  isPhoneVerified: boolean;
  phoneVerificationStatus: PhoneVerificationStatus;
  smsOptOut: boolean;
  smsLockoutUntil: string | null;
  lastVerificationAttempt: string | null;
}

interface UserState {
  member: Member | null;
  userRole: UserRole | null;
  division: string | null;
  calendar_id: string | null;
  phoneVerification: PhoneVerificationState;
  setMember: (member: Member | null) => Promise<void>;
  setUserRole: (role: UserRole | null) => void;
  setDivision: (division: string | null) => void;
  setCalendarId: (calendarId: string | null) => void;
  updatePhoneVerification: (updates: Partial<PhoneVerificationState>) => void;
  setPhoneNumber: (phoneNumber: string | null) => void;
  setVerificationStatus: (status: PhoneVerificationStatus) => void;
  setSmsOptOut: (optOut: boolean) => void;
  setSmsLockout: (lockoutUntil: string | null) => void;
  reset: () => void;
}

// Helper function to fetch division name (can be moved)
async function getDivisionName(divisionId: number): Promise<string | null> {
  if (!divisionId) return null;
  try {
    console.log("[UserStore] Fetching division name for ID:", divisionId);
    const { data, error } = await supabase
      .from("divisions")
      .select("name")
      .eq("id", divisionId)
      .single();
    if (error) throw error;
    console.log("[UserStore] Fetched division name:", data?.name);
    return data?.name ?? null;
  } catch (error) {
    console.error("[UserStore] Error fetching division name:", error);
    return null;
  }
}

export const useUserStore = create<UserState>((set, get) => ({
  member: null,
  userRole: null,
  division: null,
  calendar_id: null,
  phoneVerification: {
    phoneNumber: null,
    isPhoneVerified: false,
    phoneVerificationStatus: "not_started",
    smsOptOut: false,
    smsLockoutUntil: null,
    lastVerificationAttempt: null,
  },
  setMember: async (member) => {
    console.log(
      "[UserStore] Setting member:",
      member
        ? {
          id: member.id,
          role: member.role,
          division_id: member.division_id,
          calendar_id: member.calendar_id,
        }
        : "null",
    );

    let divisionName: string | null = null;
    if (member?.division_id) {
      // Fetch division name if member and division_id exist
      divisionName = await getDivisionName(member.division_id);
    }

    // Update state with member, calendar_id, and fetched division name
    set({
      member,
      calendar_id: member?.calendar_id || null,
      division: divisionName,
    });

    console.log("[UserStore] State updated:", {
      memberId: member?.id || null,
      divisionName,
      calendar_id: member?.calendar_id || null,
    });
  },
  setUserRole: (userRole) => set({ userRole }),
  setDivision: (division) => {
    console.log("[UserStore] Setting division:", division);
    set({ division });
  },
  setCalendarId: (calendarId) => {
    console.log("[UserStore] Setting calendar_id:", calendarId);
    set({ calendar_id: calendarId });
  },
  updatePhoneVerification: (updates) => {
    console.log("[UserStore] Updating phone verification:", updates);
    set((state) => ({
      phoneVerification: { ...state.phoneVerification, ...updates },
    }));
  },
  setPhoneNumber: (phoneNumber) => {
    console.log(
      "[UserStore] Setting phone number:",
      phoneNumber ? "***masked***" : null,
    );
    set((state) => ({
      phoneVerification: { ...state.phoneVerification, phoneNumber },
    }));
  },
  setVerificationStatus: (status) => {
    console.log("[UserStore] Setting verification status:", status);
    set((state) => ({
      phoneVerification: {
        ...state.phoneVerification,
        phoneVerificationStatus: status,
        isPhoneVerified: status === "verified",
      },
    }));
  },
  setSmsOptOut: (optOut) => {
    console.log("[UserStore] Setting SMS opt-out:", optOut);
    set((state) => ({
      phoneVerification: { ...state.phoneVerification, smsOptOut: optOut },
    }));
  },
  setSmsLockout: (lockoutUntil) => {
    console.log("[UserStore] Setting SMS lockout:", lockoutUntil);
    set((state) => ({
      phoneVerification: {
        ...state.phoneVerification,
        smsLockoutUntil: lockoutUntil,
        phoneVerificationStatus: lockoutUntil
          ? "locked_out"
          : state.phoneVerification.phoneVerificationStatus,
      },
    }));
  },
  reset: () => {
    console.log("[UserStore] Resetting state");
    set({
      member: null,
      userRole: null,
      division: null,
      calendar_id: null,
      phoneVerification: {
        phoneNumber: null,
        isPhoneVerified: false,
        phoneVerificationStatus: "not_started",
        smsOptOut: false,
        smsLockoutUntil: null,
        lastVerificationAttempt: null,
      },
    });
  },
}));

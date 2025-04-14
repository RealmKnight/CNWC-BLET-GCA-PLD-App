import { create } from "zustand";
import { Database } from "@/types/supabase";
import { UserRole } from "@/types/auth";
import { supabase } from "@/utils/supabase"; // Import supabase

type Member = Database["public"]["Tables"]["members"]["Row"];

interface UserState {
  member: Member | null;
  userRole: UserRole | null;
  division: string | null;
  calendar_id: string | null;
  setMember: (member: Member | null) => Promise<void>;
  setUserRole: (role: UserRole | null) => void;
  setDivision: (division: string | null) => void;
  setCalendarId: (calendarId: string | null) => void; // New method to directly set calendar_id
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
  reset: () => {
    console.log("[UserStore] Resetting state");
    set({ member: null, userRole: null, division: null, calendar_id: null });
  },
}));

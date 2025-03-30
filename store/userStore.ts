import { create } from "zustand";
import { Database } from "@/types/supabase";
import { UserRole } from "@/types/auth";

type Member = Database["public"]["Tables"]["members"]["Row"];

interface UserState {
  member: Member | null;
  userRole: UserRole | null;
  division: string | null;
  setMember: (member: Member | null) => void;
  setUserRole: (role: UserRole | null) => void;
  setDivision: (division: string | null) => void;
  reset: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  member: null,
  userRole: null,
  division: null,
  setMember: (member) => set({ member, division: member?.division || null }),
  setUserRole: (userRole) => set({ userRole }),
  setDivision: (division) => set({ division }),
  reset: () => set({ member: null, userRole: null, division: null }),
}));

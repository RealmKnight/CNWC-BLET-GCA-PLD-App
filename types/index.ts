import { Database } from "./supabase";

export type Member = Database["public"]["Tables"]["members"]["Row"];
export type Division = Database["public"]["Enums"]["division"];
export type Zone = Database["public"]["Enums"]["zone"];
export type Role = Database["public"]["Enums"]["role"];
export type LeaveType = Database["public"]["Enums"]["leave_type"];
export type RequestStatus = Database["public"]["Enums"]["pld_sdv_status"];
export type SystemSeniorityType = Database["public"]["Enums"]["sys_seniority_type"];

export type LeaveRequest = Database["public"]["Tables"]["pld_sdv_requests"]["Row"];
export type LeaveAllotment = Database["public"]["Tables"]["pld_sdv_allotments"]["Row"];
export type VacationAllotment = Database["public"]["Tables"]["vacation_allotments"]["Row"];

// Auth store types
export interface AuthState {
  user: Member | null;
  session: any | null;
  isLoading: boolean;
  error: string | null;
}

// Helper type for calculating PLD entitlement
export interface PLDEntitlement {
  maxPLDs: number;
  yearsOfService: number;
  nextIncrease: Date | null;
}

export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  subject: string;
  content: string;
  is_read: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

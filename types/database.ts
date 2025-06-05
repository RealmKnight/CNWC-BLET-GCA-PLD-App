export interface Database {
    public: {
        Tables: {
            members: {
                Row: {
                    id: string;
                    created_at?: string;
                    first_name: string | null;
                    last_name: string | null;
                    pin_number: number;
                    zone?: string;
                    zone_id?: number;
                    division?: string;
                    division_id?: number;
                    role?: string;
                    role_id?: number;
                    status?: string;
                    status_id?: number;
                };
            };
            pld_sdv_requests: {
                Row: {
                    id: string;
                    created_at?: string;
                    member_id: string;
                    division: string;
                    zone_id?: number;
                    request_date: string;
                    leave_type: "PLD" | "SDV";
                    status:
                        | "pending"
                        | "approved"
                        | "denied"
                        | "waitlisted"
                        | "cancellation_pending"
                        | "cancelled"
                        | "transferred";
                    requested_at: string;
                    waitlist_position?: number;
                    responded_at?: string;
                    responded_by?: string;
                    paid_in_lieu?: boolean;
                };
            };
            zones: {
                Row: {
                    id: number;
                    created_at?: string;
                    name: string;
                    division_id: number;
                };
            };
        };
    };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
    Database["public"]["Tables"][T]["Row"];
export type Member = Tables<"members">;
export type Request = Tables<"pld_sdv_requests">;
export type Zone = Tables<"zones">;

export interface RequestWithMember extends Request {
    member: Member;
}

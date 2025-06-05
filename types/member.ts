export interface Member {
    id: string;
    created_at?: string;
    username?: string;
    pin_number: number;
    company_hire_date?: string;
    engineer_date?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    zone?: string;
    zone_id?: number;
    division?: string;
    division_id?: number;
    role?: string;
    role_id?: number;
    status?: string;
    status_id?: number;
    phone_number?: string;
    date_of_birth?: string;
    system_sen_type?: string;
    prior_vac_sys?: number | string | null;
    misc_notes?: string;
    current_zone_id?: number;
    home_zone_id?: number;
}

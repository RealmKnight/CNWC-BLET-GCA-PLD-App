export interface Zone {
    id: number;
    name: string;
    division_id: number;
    created_at: string;
    updated_at: string;
}

export interface Division {
    id: number;
    name: string;
    created_at: string;
    updated_at: string;
}

export interface Allotment {
    id: number;
    zone_id: number;
    start_date: string;
    end_date: string;
    created_at: string;
    updated_at: string;
}

// Added Calendar interface based on refactor plan
export interface Calendar {
    id: string; // uuid
    division_id: number;
    name: string;
    description: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

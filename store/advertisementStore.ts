import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { Platform } from "react-native";

export interface Advertisement {
    id: string;
    title: string;
    description: string;
    image_url: string;
    destination_url: string;
    file_type: string;
    placement_locations: string[];
    status: "draft" | "active" | "inactive";
    weight: number;
    start_date: string;
    end_date: string;
}

interface AdvertisementState {
    advertisements: Record<string, Advertisement[]>;
    rotatingAds: Record<string, Advertisement[]>;
    currentRotationIndex: Record<string, number>;
    isLoading: boolean;
    error: Error | null;
    fetchAdvertisements: (location: string) => Promise<void>;
    fetchAdvertisementsForRotation: (
        location: string,
        count?: number,
    ) => Promise<void>;
    logAdvertisementEvent: (
        adId: string,
        eventType: "impression" | "view" | "click",
        location: string,
    ) => Promise<void>;
    getNextRotationAd: (location: string) => Advertisement | null;
}

export const useAdvertisementStore = create<AdvertisementState>((set, get) => ({
    advertisements: {},
    rotatingAds: {},
    currentRotationIndex: {},
    isLoading: false,
    error: null,

    fetchAdvertisements: async (location: string) => {
        const deviceType = Platform.OS === "web" ? "web" : "mobile";

        try {
            set({ isLoading: true, error: null });

            const { data, error } = await supabase.rpc(
                "get_active_advertisements",
                {
                    location_filter: location,
                    device_filter: deviceType,
                },
            );

            if (error) throw error;

            // Update state with fetched ads for this location
            set((state) => ({
                advertisements: {
                    ...state.advertisements,
                    [location]: data || [],
                },
                isLoading: false,
            }));
        } catch (error) {
            console.error("Error fetching advertisements:", error);
            set({ error: error as Error, isLoading: false });
        }
    },

    fetchAdvertisementsForRotation: async (location: string, count = 3) => {
        const deviceType = Platform.OS === "web" ? "web" : "mobile";

        try {
            set({ isLoading: true, error: null });

            const { data, error } = await supabase.rpc(
                "get_advertisements_for_rotation",
                {
                    location_filter: location,
                    device_filter: deviceType,
                    limit_count: count,
                },
            );

            if (error) throw error;

            // Update state with fetched ads for rotation
            set((state) => ({
                rotatingAds: {
                    ...state.rotatingAds,
                    [location]: data || [],
                },
                // Initialize or reset rotation index
                currentRotationIndex: {
                    ...state.currentRotationIndex,
                    [location]: 0,
                },
                isLoading: false,
            }));
        } catch (error) {
            console.error("Error fetching advertisements for rotation:", error);
            set({ error: error as Error, isLoading: false });
        }
    },

    getNextRotationAd: (location: string) => {
        const state = get();
        const ads = state.rotatingAds[location] || [];

        if (ads.length === 0) return null;

        const currentIndex = state.currentRotationIndex[location] || 0;
        const ad = ads[currentIndex];

        // Update index for next time
        set((state) => ({
            currentRotationIndex: {
                ...state.currentRotationIndex,
                [location]: (currentIndex + 1) % ads.length,
            },
        }));

        return ad;
    },

    logAdvertisementEvent: async (
        adId: string,
        eventType: "impression" | "view" | "click",
        location: string,
    ) => {
        try {
            const { error } = await supabase.rpc("log_advertisement_event", {
                ad_id: adId,
                event: eventType,
                member: null, // Will be set from userStore in the component
                loc: location,
                device: Platform.OS,
                platform: Platform.OS === "web" ? "web" : "mobile",
            });

            if (error) throw error;
        } catch (error) {
            console.error(`Error logging ${eventType} event:`, error);
        }
    },
}));

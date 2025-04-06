// Set environment variables first
process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

import "@testing-library/jest-dom";
import { createClient } from "@supabase/supabase-js";
import { ReactNode } from "react";

// Mock date-fns
jest.mock("date-fns", () => ({
    addDays: jest.fn((date: Date) => date),
    isAfter: jest.fn(() => false),
    isBefore: jest.fn(() => false),
    parseISO: jest.fn((date: string) => new Date(date)),
    startOfDay: jest.fn((date: Date) => date),
    format: jest.fn((date: Date) => "2024-01-01"),
}));

jest.mock("date-fns-tz", () => ({
    format: jest.fn((date: Date) => "2024-01-01"),
}));

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
}));

// Mock SecureStore
jest.mock("expo-secure-store", () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
}));

// Mock Platform
jest.mock("react-native", () => ({
    Platform: {
        OS: "ios",
    },
}));

// Mock Supabase client
jest.mock("@supabase/supabase-js", () => ({
    createClient: jest.fn(() => ({
        from: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            single: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            rpc: jest.fn().mockReturnThis(),
            gte: jest.fn().mockReturnThis(),
            lte: jest.fn().mockReturnThis(),
        })),
        auth: {
            getUser: jest.fn(),
            signOut: jest.fn(),
        },
        rpc: jest.fn(),
    })),
}));

// Mock date to ensure consistent testing
const mockDate = new Date("2024-03-20T12:00:00Z");
global.Date.now = jest.fn(() => mockDate.getTime());

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    })),
});

// Mock Expo Router
jest.mock("expo-router", () => ({
    useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        back: jest.fn(),
    }),
    useLocalSearchParams: () => ({}),
}));

// Mock Safe Area Context
jest.mock("react-native-safe-area-context", () => ({
    SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

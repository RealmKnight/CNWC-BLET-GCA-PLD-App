// Mock React Native modules before imports
jest.mock("react-native-url-polyfill/auto", () => {
    global.URL = URL;
    global.URLSearchParams = URLSearchParams;
});

// Mock environment variables
process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "test-key";

// Mock React Native's Platform
jest.mock("react-native", () => ({
    Platform: {
        OS: "ios",
    },
}));

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
}));

// Mock expo-secure-store
jest.mock("expo-secure-store", () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
}));

// Import testing libraries
import "@testing-library/jest-native/extend-expect";

// Mock zustand persist
jest.mock("zustand/middleware", () => ({
    ...jest.requireActual("zustand/middleware"),
    persist: () => (config: any) => config,
}));

// Add any additional setup code here

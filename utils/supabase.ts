import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { Database } from "@/types/supabase";

// Get the Supabase URL and anon key from environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

// Helper to check if we're in a browser environment
const isBrowser = () => Platform.OS === "web" && typeof window !== "undefined";

// Custom storage object that handles both web and native platforms
const customStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Platform.OS === "web") {
        if (!isBrowser()) return null;
        return window.localStorage.getItem(key);
      }
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error("Error getting item from storage:", error);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (Platform.OS === "web") {
        if (!isBrowser()) return;
        window.localStorage.setItem(key, value);
      } else {
        await SecureStore.setItemAsync(key, value);
      }
    } catch (error) {
      console.error("Error setting item in storage:", error);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      if (Platform.OS === "web") {
        if (!isBrowser()) return;
        window.localStorage.removeItem(key);
      } else {
        await SecureStore.deleteItemAsync(key);
      }
    } catch (error) {
      console.error("Error removing item from storage:", error);
    }
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
  global: {
    headers: {
      "X-Client-Info": "supabase-js-client",
    },
  },
  db: {
    schema: "public",
  },
});

// Grace period (ms) before we consider a token 'about to expire'
export const TOKEN_EXPIRY_BUFFER_MS = 15_000;

/**
 * Ensures we have a fresh access-token. If the current token is
 * already valid for > TOKEN_EXPIRY_BUFFER_MS it just resolves quickly.
 * Otherwise it triggers `supabase.auth.refreshSession()`.
 * Returns the (possibly refreshed) session object.
 */
export async function refreshSessionIfNeeded() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) throw error;

    const expiresAtSec = session?.expires_at ?? 0;
    const msUntilExpiry = expiresAtSec * 1000 - Date.now();
    if (msUntilExpiry > TOKEN_EXPIRY_BUFFER_MS) {
      return session;
    }

    const { data: refreshed, error: refreshErr } = await supabase.auth
      .refreshSession();
    if (refreshErr) throw refreshErr;
    return refreshed.session;
  } catch (err) {
    console.warn("[supabase] refreshSessionIfNeeded failed", err);
    throw err;
  }
}

// Keep realtime sockets up-to-date when Supabase refreshes the token internally
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "TOKEN_REFRESHED" && session?.access_token) {
    try {
      // propagate new JWT to open realtime connections
      supabase.realtime.setAuth(session.access_token);
    } catch (e) {
      console.error(
        "[supabase] Error propagating refreshed token to realtime",
        e,
      );
    }
  }
});

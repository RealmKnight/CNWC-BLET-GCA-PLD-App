import { create } from "zustand";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "@/utils/supabase";
import Constants from "expo-constants";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerForPushNotificationsAsync } from "@/utils/notificationService";

interface PushTokenState {
    expoPushToken: string | null;
    devicePushToken: string | null;
    isRegistered: boolean;
    isLoading: boolean;
    error: string | null;
    lastRegistrationDate: string | null;
    permissionStatus: "granted" | "denied" | "undetermined" | "error";

    // Methods
    init: () => Promise<void>;
    registerDevice: (userId: string) => Promise<string | null>;
    unregisterDevice: () => Promise<void>;
    refreshToken: (userId: string) => Promise<string | null>;
    clearTokens: () => Promise<void>;
    checkPermissionStatus: () => Promise<
        "granted" | "denied" | "undetermined" | "error"
    >;
    markNotificationDelivered: (
        messageId: string,
        status?: string,
    ) => Promise<void>;
}

export const usePushTokenStore = create<PushTokenState>((set, get) => {
    return {
        expoPushToken: null,
        devicePushToken: null,
        isRegistered: false,
        isLoading: false,
        error: null,
        lastRegistrationDate: null,
        permissionStatus: "undetermined",

        // Initialize state from storage
        init: async () => {
            try {
                console.log("[PushToken] Initializing push token store");
                set({ isLoading: true });

                // Load token from storage
                console.log("[PushToken] Checking for stored token...");
                const storedToken = await AsyncStorage.getItem("@pushToken");

                if (storedToken) {
                    console.log(
                        "[PushToken] Found stored token, validating...",
                    );
                    try {
                        const tokenData = JSON.parse(storedToken);

                        // Check if token data is still valid (not older than 30 days)
                        const lastRegistration = new Date(
                            tokenData.lastRegistrationDate,
                        );
                        const now = new Date();
                        const daysSinceRegistration =
                            (now.getTime() - lastRegistration.getTime()) /
                            (1000 * 60 * 60 * 24);

                        if (daysSinceRegistration < 30) {
                            console.log(
                                "[PushToken] Token is valid, setting state",
                            );
                            set({
                                expoPushToken: tokenData.expoPushToken,
                                isRegistered: true,
                                lastRegistrationDate:
                                    tokenData.lastRegistrationDate,
                            });
                            console.log(
                                "[PushToken] Loaded valid token from storage:",
                                tokenData.expoPushToken,
                            );
                        } else {
                            console.log(
                                "[PushToken] Stored token is too old, will need to register a new one",
                            );
                            await AsyncStorage.removeItem("@pushToken");
                        }
                    } catch (parseError) {
                        console.error(
                            "[PushToken] Error parsing stored token:",
                            parseError,
                        );
                        await AsyncStorage.removeItem("@pushToken");
                    }
                } else {
                    console.log("[PushToken] No stored token found");
                }

                // Check current permission status
                console.log("[PushToken] Checking permission status...");
                const status = await get().checkPermissionStatus();
                console.log("[PushToken] Permission status:", status);

                set({ isLoading: false });
                console.log("[PushToken] Initialization complete");
            } catch (error) {
                console.error(
                    "[PushToken] Error initializing push token store:",
                    error,
                );
                set({
                    isLoading: false,
                    error: "Failed to initialize token store",
                });
            }
        },

        registerDevice: async (userId: string) => {
            if (!userId) {
                set({ error: "User ID required for token registration" });
                return null;
            }

            try {
                set({ isLoading: true, error: null });

                // Check permission status first
                const { status } = await Notifications.getPermissionsAsync();
                set({
                    permissionStatus: status as
                        | "granted"
                        | "denied"
                        | "undetermined",
                });

                if (status !== "granted") {
                    const { status: newStatus } = await Notifications
                        .requestPermissionsAsync();
                    set({
                        permissionStatus: newStatus as
                            | "granted"
                            | "denied"
                            | "undetermined",
                    });

                    if (newStatus !== "granted") {
                        set({
                            error: "Permission denied for notifications",
                            isLoading: false,
                        });
                        return null;
                    }
                }

                // Get token from Expo
                const token = await registerForPushNotificationsAsync();

                if (!token) {
                    throw new Error("Failed to get push token");
                }

                // Get device information
                const deviceId = await getUniqueDeviceId();
                const deviceName = Device.deviceName || "Unknown Device";
                const appVersion = Constants.expoConfig?.version || "unknown";

                // Store token in database
                const { error: dbError } = await supabase.from(
                    "user_push_tokens",
                )
                    .upsert({
                        user_id: userId,
                        push_token: token,
                        device_id: deviceId,
                        device_name: deviceName,
                        platform: Platform.OS,
                        app_version: appVersion,
                        is_active: true,
                        last_used: new Date().toISOString(),
                    }, {
                        onConflict: "user_id, device_id",
                    });

                if (dbError) {
                    // If the error is because the table doesn't exist yet, we'll create it
                    if (dbError.code === "42P01") { // relation does not exist
                        console.log(
                            "[PushToken] Table doesn't exist yet, will be created in Phase 1",
                        );
                    } else {
                        throw dbError;
                    }
                }

                // Store in localStorage for persistence
                const registrationDate = new Date().toISOString();
                await AsyncStorage.setItem(
                    "@pushToken",
                    JSON.stringify({
                        expoPushToken: token,
                        lastRegistrationDate: registrationDate,
                    }),
                );

                set({
                    expoPushToken: token,
                    isRegistered: true,
                    isLoading: false,
                    lastRegistrationDate: registrationDate,
                });

                return token;
            } catch (error: any) {
                set({
                    error: `Token registration failed: ${error.message}`,
                    isLoading: false,
                });
                return null;
            }
        },

        unregisterDevice: async () => {
            try {
                set({ isLoading: true });

                const token = get().expoPushToken;
                if (!token) return;

                // Mark token as inactive in database
                // This might fail if the table doesn't exist yet, but that's okay
                try {
                    await supabase.from("user_push_tokens")
                        .update({ is_active: false })
                        .eq("push_token", token);
                } catch (error) {
                    console.error(
                        "[PushToken] Error marking token as inactive:",
                        error,
                    );
                }

                // Clear from local storage
                await AsyncStorage.removeItem("@pushToken");

                set({
                    expoPushToken: null,
                    devicePushToken: null,
                    isRegistered: false,
                    isLoading: false,
                    lastRegistrationDate: null,
                });
            } catch (error) {
                console.error("[PushToken] Error unregistering device:", error);
                set({ isLoading: false });
            }
        },

        refreshToken: async (userId: string) => {
            if (!userId) return null;

            // Only refresh if we already have a token
            if (get().expoPushToken) {
                return await get().registerDevice(userId);
            }
            return null;
        },

        clearTokens: async () => {
            try {
                await AsyncStorage.removeItem("@pushToken");
                set({
                    expoPushToken: null,
                    devicePushToken: null,
                    isRegistered: false,
                    lastRegistrationDate: null,
                });
            } catch (error) {
                console.error("[PushToken] Error clearing tokens:", error);
            }
        },

        checkPermissionStatus: async () => {
            try {
                console.log(
                    "[PushToken] Requesting permission status from Notifications API",
                );
                const { status } = await Notifications.getPermissionsAsync();
                console.log("[PushToken] Permission status received:", status);

                set({
                    permissionStatus: status as
                        | "granted"
                        | "denied"
                        | "undetermined",
                });
                return status as "granted" | "denied" | "undetermined";
            } catch (error) {
                console.error(
                    "[PushToken] Error checking permission status:",
                    error,
                );
                set({ permissionStatus: "error" });
                return "error";
            }
        },

        markNotificationDelivered: async (
            messageId: string,
            status: string = "delivered",
        ) => {
            try {
                const { error } = await supabase.from(
                    "push_notification_deliveries",
                ).upsert({
                    message_id: messageId,
                    status,
                    [status === "delivered" ? "delivered_at" : "updated_at"]:
                        new Date().toISOString(),
                }, {
                    onConflict: "message_id",
                });

                if (error) {
                    console.error(
                        "[PushToken] Error marking notification as delivered:",
                        error,
                    );
                }
            } catch (error) {
                console.error(
                    "[PushToken] Error in markNotificationDelivered:",
                    error,
                );
            }
        },
    };
});

// Helper to get a unique device identifier
async function getUniqueDeviceId(): Promise<string> {
    try {
        // Try to get a stored device ID
        const storedId = await AsyncStorage.getItem("@deviceId");

        if (storedId) {
            return storedId;
        }

        // Generate a new one if not found
        const newId = Device.deviceName
            ? `${Device.deviceName}-${Date.now()}`
            : `${Platform.OS}-${Date.now()}-${
                Math.random().toString(36).slice(2)
            }`;

        await AsyncStorage.setItem("@deviceId", newId);
        return newId;
    } catch (error) {
        // Fallback in case of errors
        return `${Platform.OS}-${Date.now()}-${
            Math.random().toString(36).slice(2)
        }`;
    }
}

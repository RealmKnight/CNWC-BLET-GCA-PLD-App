import { Platform } from "react-native";
import { router } from "expo-router";

// Extend Window interface to include our custom properties
declare global {
    interface Window {
        __passwordResetInProgress?: boolean;
        __passwordResetParams?: AuthParams | Record<string, any>;
        __passwordResetSource?: string;
    }
}

export interface AuthParams {
    accessToken?: string;
    refreshToken?: string;
    type?: string;
    code?: string;
}

/**
 * Detect password reset parameters in the URL (for web platform)
 */
export function detectPasswordResetParams(): AuthParams | null {
    if (Platform.OS !== "web" || typeof window === "undefined") {
        return null;
    }

    const url = window.location.href;
    const search = window.location.search;
    const hash = window.location.hash;

    // Check if URL contains recovery type or code parameter
    const isResetFlow = url.includes("type=recovery") ||
        url.includes("code=") ||
        (hash && (hash.includes("type=recovery") || hash.includes("code=")));

    if (!isResetFlow) {
        return null;
    }

    console.log("[AuthRedirect] Detected password reset parameters in URL");

    // Parse the parameters from the URL
    let params: AuthParams = {};

    // Check in search params
    const searchParams = new URLSearchParams(search);
    const codeFromSearch = searchParams.get("code");
    const typeFromSearch = searchParams.get("type");

    if (codeFromSearch) params.code = codeFromSearch;
    if (typeFromSearch) params.type = typeFromSearch;

    // Check in hash
    if (hash && hash.length > 1) {
        // Handle both formats: #key=value and #/path?key=value
        let hashQueryString = "";

        if (hash.includes("?")) {
            // Format: #/auth/change-password?code=xyz
            hashQueryString = hash.split("?")[1];
        } else if (hash.includes("=")) {
            // Format: #access_token=xyz&refresh_token=abc
            hashQueryString = hash.startsWith("#") ? hash.substring(1) : hash;
        }

        if (hashQueryString) {
            try {
                const hashParams = new URLSearchParams(hashQueryString);

                // Extract params
                const codeFromHash = hashParams.get("code");
                const typeFromHash = hashParams.get("type");
                const accessToken = hashParams.get("access_token");
                const refreshToken = hashParams.get("refresh_token");

                if (codeFromHash) params.code = codeFromHash;
                if (typeFromHash) params.type = typeFromHash;
                if (accessToken) params.accessToken = accessToken;
                if (refreshToken) params.refreshToken = refreshToken;
            } catch (e) {
                console.error(
                    "[AuthRedirect] Error parsing hash parameters:",
                    e,
                );
            }
        }
    }

    // Set flag for preventing redirect during reset
    if (Object.keys(params).length > 0) {
        window.__passwordResetInProgress = true;
    }

    return Object.keys(params).length > 0 ? params : null;
}

/**
 * Handle password reset URL
 * Will store parameters for later use instead of trying to redirect immediately
 */
export function handlePasswordResetURL(): boolean {
    if (Platform.OS !== "web" || typeof window === "undefined") {
        return false;
    }

    const url = window.location.href;

    // Special case for the problematic format with both query param and hash
    if (
        url.includes("?code=") &&
        (url.includes("#/auth/change-password") ||
            url.includes("#/(auth)/change-password"))
    ) {
        const code = new URLSearchParams(window.location.search).get("code");
        console.log("[AuthRedirect] Handling special mixed format URL");

        // Just store the parameters without attempting navigation
        if (typeof window !== "undefined") {
            window.__passwordResetParams = { code };
            window.__passwordResetInProgress = true;
            window.__passwordResetSource = "mixed_format";
            console.log(
                "[AuthRedirect] Stored password reset parameters for manual handling",
            );
        }

        return true;
    }

    const params = detectPasswordResetParams();
    if (!params) return false;

    const isOnSignInPage = url.includes("/sign-in");
    const hasResetParams = params.code || params.type === "recovery";

    // If on sign-in page or any page with reset params, just store them
    if (hasResetParams) {
        console.log(
            "[AuthRedirect] Detected password reset parameters, storing for later use",
        );

        if (typeof window !== "undefined") {
            window.__passwordResetParams = params;
            window.__passwordResetInProgress = true;
            window.__passwordResetSource = isOnSignInPage
                ? "sign_in_page"
                : "other_page";
            console.log("[AuthRedirect] Stored reset parameters:", params);
        }

        return true;
    }

    return false;
}

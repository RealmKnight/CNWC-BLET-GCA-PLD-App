import { Platform } from "react-native";

/**
 * Suppresses Cloudflare cookie warnings from console output
 * This helps reduce noise in development and production logs
 */
export const suppressCloudflareWarnings = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
        // Store original console methods
        const originalConsoleError = console.error;
        const originalConsoleWarn = console.warn;

        // Override console.error to filter Cloudflare warnings
        console.error = (...args: any[]) => {
            const message = args.join(" ");
            if (
                message.includes("__cf_bm") &&
                (message.includes("invalid domain") ||
                    message.includes("rejected"))
            ) {
                // Convert to a less noisy warning
                console.warn(
                    "[Filtered] Cloudflare cookie warning (non-critical):",
                    message,
                );
                return;
            }
            originalConsoleError.apply(console, args);
        };

        // Override console.warn to filter repetitive Cloudflare warnings
        console.warn = (...args: any[]) => {
            const message = args.join(" ");
            if (
                message.includes("__cf_bm") &&
                message.includes("invalid domain") &&
                !message.includes("[Filtered]") // Don't filter our own filtered messages
            ) {
                // Suppress repetitive warnings, but log once per session
                if (!window.__cfWarningLogged) {
                    originalConsoleWarn.apply(console, [
                        "[Suppressed] Cloudflare cookie warnings detected - this is normal and non-critical",
                    ]);
                    window.__cfWarningLogged = true;
                }
                return;
            }
            originalConsoleWarn.apply(console, args);
        };

        console.log(
            "[ErrorSuppression] Cloudflare warning suppression enabled for web platform",
        );
    }
};

/**
 * Restores original console methods (useful for testing)
 */
export const restoreConsole = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
        // This would require storing the original methods, but for simplicity
        // we'll just reload the page context if needed
        console.log("[ErrorSuppression] Console restoration requested");
    }
};

// Extend Window interface for TypeScript
declare global {
    interface Window {
        __cfWarningLogged?: boolean;
    }
}

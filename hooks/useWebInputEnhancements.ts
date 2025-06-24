import { useEffect } from "react";
import { Platform } from "react-native";

/**
 * Custom hook to enhance input behavior on web platforms, specifically for iOS Safari PWA
 * This hook adds web-specific enhancements without affecting native apps
 */
export function useWebInputEnhancements() {
    useEffect(() => {
        // Only run on web platform
        if (Platform.OS !== "web") return;

        // Detect if running as iOS PWA
        const isIOSPWA = () => {
            if (typeof window === "undefined") return false;

            const userAgent = window.navigator.userAgent;
            const isIOS = /iPad|iPhone|iPod/.test(userAgent);
            const isStandalone = (window.navigator as any).standalone ||
                window.matchMedia("(display-mode: standalone)").matches;

            return isIOS && isStandalone;
        };

        // Add iOS PWA specific enhancements
        if (isIOSPWA()) {
            // Prevent iOS Safari zoom on input focus
            const preventZoom = (e: Event) => {
                const target = e.target as HTMLInputElement;
                if (target && target.tagName === "INPUT") {
                    // Ensure font size is at least 16px
                    const computedStyle = window.getComputedStyle(target);
                    const fontSize = parseFloat(computedStyle.fontSize);

                    if (fontSize < 16) {
                        target.style.fontSize = "16px";
                    }
                }
            };

            // Improve touch handling for iOS
            const improveTouchHandling = () => {
                document.body.style.setProperty(
                    "-webkit-touch-callout",
                    "none",
                );
                document.body.style.setProperty("-webkit-user-select", "none");
                document.body.style.setProperty("touch-action", "manipulation");
            };

            // Apply enhancements
            document.addEventListener("focusin", preventZoom);
            improveTouchHandling();

            // Cleanup
            return () => {
                document.removeEventListener("focusin", preventZoom);
            };
        }
    }, []);
}

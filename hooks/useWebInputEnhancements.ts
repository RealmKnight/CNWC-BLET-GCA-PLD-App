import { useEffect } from "react";
import { Platform } from "react-native";

/**
 * Custom hook to enhance input behavior on web platforms
 * Provides mobile browser optimizations for both iOS and Android
 * This hook adds web-specific enhancements without affecting native apps
 */
export function useWebInputEnhancements() {
    useEffect(() => {
        // Only run on web platform
        if (Platform.OS !== "web") return;

        // Detect mobile browsers and PWA modes
        const isMobileWeb = () => {
            if (typeof window === "undefined") return false;

            const userAgent = window.navigator.userAgent;
            return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
                .test(userAgent);
        };

        const isIOSPWA = () => {
            if (typeof window === "undefined") return false;

            const userAgent = window.navigator.userAgent;
            const isIOS = /iPad|iPhone|iPod/.test(userAgent);
            const isStandalone = (window.navigator as any).standalone ||
                window.matchMedia("(display-mode: standalone)").matches;

            return isIOS && isStandalone;
        };

        const isAndroidPWA = () => {
            if (typeof window === "undefined") return false;

            const userAgent = window.navigator.userAgent;
            const isAndroid = /Android/.test(userAgent);
            const isStandalone =
                window.matchMedia("(display-mode: standalone)").matches;

            return isAndroid && isStandalone;
        };

        // Apply mobile web enhancements
        if (isMobileWeb() || isIOSPWA() || isAndroidPWA()) {
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

            // Improve touch handling for mobile browsers
            const improveTouchHandling = () => {
                // Prevent callouts and improve touch behavior
                document.body.style.setProperty(
                    "-webkit-touch-callout",
                    "none",
                );
                document.body.style.setProperty("-webkit-user-select", "none");
                document.body.style.setProperty("touch-action", "manipulation");

                // Android-specific improvements
                document.body.style.setProperty(
                    "-webkit-tap-highlight-color",
                    "transparent",
                );
                document.body.style.setProperty("user-select", "none");
            };

            // Prevent pull-to-refresh on mobile browsers when not needed
            const preventPullToRefresh = () => {
                let startY: number;

                const handleTouchStart = (e: TouchEvent) => {
                    startY = e.touches[0].clientY;
                };

                const handleTouchMove = (e: TouchEvent) => {
                    const currentY = e.touches[0].clientY;
                    const scrollTop = document.documentElement.scrollTop ||
                        document.body.scrollTop;

                    // Prevent pull-to-refresh when at top of page and pulling down
                    if (scrollTop === 0 && currentY > startY) {
                        e.preventDefault();
                    }
                };

                document.addEventListener("touchstart", handleTouchStart, {
                    passive: false,
                });
                document.addEventListener("touchmove", handleTouchMove, {
                    passive: false,
                });

                return () => {
                    document.removeEventListener(
                        "touchstart",
                        handleTouchStart,
                    );
                    document.removeEventListener("touchmove", handleTouchMove);
                };
            };

            // Apply enhancements
            document.addEventListener("focusin", preventZoom);
            improveTouchHandling();
            const cleanupPullToRefresh = preventPullToRefresh();

            // Cleanup function
            return () => {
                document.removeEventListener("focusin", preventZoom);
                if (cleanupPullToRefresh) {
                    cleanupPullToRefresh();
                }
            };
        }
    }, []);
}

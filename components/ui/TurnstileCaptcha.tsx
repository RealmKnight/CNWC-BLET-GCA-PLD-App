import React, { useRef, useImperativeHandle, forwardRef, useEffect, useState } from "react";
import { Platform, View, StyleSheet } from "react-native";
import { Turnstile } from "@marsidev/react-turnstile";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

export interface TurnstileCaptchaProps {
  onVerify: (token: string) => void;
  onError?: (error: string) => void;
  onExpire?: () => void;
  disabled?: boolean;
  size?: "normal" | "compact";
  theme?: "light" | "dark" | "auto";
  enabled?: boolean;
}

export interface TurnstileCaptchaRef {
  reset: () => void;
  getResponse: () => string | null;
}

const TurnstileCaptcha = forwardRef<TurnstileCaptchaRef, TurnstileCaptchaProps>(
  ({ onVerify, onError, onExpire, disabled = false, size = "normal", theme = "auto", enabled = true }, ref) => {
    const turnstileRef = useRef<any>(null);
    const colorScheme = useColorScheme();
    const [isRetrying, setIsRetrying] = useState(false);
    const [widgetKey, setWidgetKey] = useState(0); // Force remount when needed

    // Use refs to persist counters across widget resets
    const retryCountRef = useRef(0);
    const consecutiveErrorsRef = useRef(0);
    const lastErrorTimeRef = useRef(0);
    const isRetryingRef = useRef(false);

    // Get the site key from environment variables
    const siteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;

    // Enhanced domain detection
    const getCurrentDomain = () => {
      if (Platform.OS !== "web" || typeof window === "undefined") {
        return "mobile-app";
      }
      return window.location.hostname;
    };

    const currentDomain = getCurrentDomain();

    // Check if we're in development mode
    const isDevelopment = __DEV__ || process.env.NODE_ENV === "development";
    const isLocalhost =
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname.includes("localhost"));

    // Check if we're on an Expo development domain
    const isExpoDev =
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      (window.location.hostname.includes("expo.dev") ||
        window.location.hostname.includes("expo.app") ||
        window.location.hostname.includes("expo.io"));

    // Turnstile test keys for development
    const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA"; // Always passes
    const TURNSTILE_TEST_SITE_KEY_FAIL = "2x00000000000000000000AB"; // Always fails
    const TURNSTILE_TEST_SITE_KEY_FORCE_INTERACTIVE = "3x00000000000000000000FF"; // Forces interactive challenge

    // Use test key in development/localhost, otherwise use configured key
    const effectiveSiteKey = isDevelopment || isLocalhost ? TURNSTILE_TEST_SITE_KEY : siteKey;

    // Auto-verify when CAPTCHA is disabled
    useEffect(() => {
      if (!enabled) {
        console.log("[CAPTCHA] CAPTCHA disabled, auto-verifying");
        onVerify("captcha-disabled");
      }
    }, [enabled, onVerify]);

    // Log domain information for debugging
    useEffect(() => {
      if (enabled && Platform.OS === "web") {
        console.log("[CAPTCHA] Domain info:", {
          currentDomain,
          fullURL: window.location.href,
          origin: window.location.origin,
          hostname: window.location.hostname,
          isDevelopment,
          isLocalhost,
          isExpoDev,
          usingTestKey: effectiveSiteKey === TURNSTILE_TEST_SITE_KEY,
          siteKeyConfigured: !!siteKey,
          siteKeyPrefix: siteKey?.substring(0, 10),
          userAgent: navigator.userAgent,
          referrer: document.referrer,
        });

        // Check for potential CSP issues
        if (typeof window !== "undefined") {
          console.log("[CAPTCHA] CSP and iframe info:", {
            hasCSP: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
            frameAncestors: document
              .querySelector('meta[http-equiv="Content-Security-Policy"]')
              ?.getAttribute("content")
              ?.includes("frame-ancestors"),
            isInIframe: window !== window.top,
            protocol: window.location.protocol,
          });
        }

        // Provide specific domain configuration guidance
        if (!isDevelopment && !isLocalhost) {
          console.log("[CAPTCHA] DOMAIN CONFIGURATION REQUIRED:");
          console.log(`[CAPTCHA] Add this EXACT domain to your Cloudflare Turnstile dashboard: ${currentDomain}`);
          console.log("[CAPTCHA] Steps:");
          console.log("[CAPTCHA] 1. Go to https://dash.cloudflare.com/");
          console.log("[CAPTCHA] 2. Navigate to Turnstile");
          console.log(`[CAPTCHA] 3. Find site with key: ${siteKey?.substring(0, 10)}...`);
          console.log("[CAPTCHA] 4. Edit site configuration");
          console.log(`[CAPTCHA] 5. Add domain: ${currentDomain}`);
          console.log("[CAPTCHA] 6. Save configuration");
          console.log("[CAPTCHA] 7. Wait 2-3 minutes for propagation");
        }
      }
    }, [currentDomain, isDevelopment, isLocalhost, isExpoDev, effectiveSiteKey, siteKey, enabled]);

    // Enhanced retry logic with rate limiting
    const retryTurnstile = () => {
      const now = Date.now();
      const timeSinceLastError = now - lastErrorTimeRef.current;

      // Rate limiting: don't retry more than once every 5 seconds
      if (timeSinceLastError < 5000) {
        console.log("[CAPTCHA] Rate limited: Too many retries, waiting...");
        return;
      }

      // Circuit breaker: If we get too many 110200 errors, it's likely a persistent domain issue
      if (consecutiveErrorsRef.current >= 3) {
        console.log("[CAPTCHA] Circuit breaker activated: Too many consecutive errors, stopping retries");
        console.log("[CAPTCHA] This usually indicates a persistent domain configuration issue");
        console.log("[CAPTCHA] Please verify your domain is correctly configured in Cloudflare Turnstile");
        onError?.(
          "CAPTCHA is experiencing repeated domain validation failures. Please refresh the page and contact support if the issue persists."
        );
        return;
      }

      if (retryCountRef.current < 2 && !isRetryingRef.current) {
        setIsRetrying(true);
        isRetryingRef.current = true;
        retryCountRef.current++;
        lastErrorTimeRef.current = now;
        consecutiveErrorsRef.current++;

        console.log(
          `[CAPTCHA] Retrying Turnstile (attempt ${retryCountRef.current}/3) - Consecutive errors: ${consecutiveErrorsRef.current}`
        );

        // Reset the widget after a short delay
        setTimeout(() => {
          if (turnstileRef.current) {
            try {
              turnstileRef.current.reset();
            } catch (error) {
              console.error("[CAPTCHA] Error resetting widget:", error);
              // If reset fails, force a complete remount
              setWidgetKey((prev) => prev + 1);
            }
          }
          setIsRetrying(false);
          isRetryingRef.current = false;
        }, 2000); // Increased delay to 2 seconds
      } else {
        console.log("[CAPTCHA] Max retries reached or already retrying");
        onError?.("CAPTCHA verification failed after multiple attempts. Please refresh the page and try again.");
      }
    };

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (!enabled) return;
        retryCountRef.current = 0;
        setIsRetrying(false);
        isRetryingRef.current = false;
        lastErrorTimeRef.current = 0;
        consecutiveErrorsRef.current = 0;
        if (turnstileRef.current) {
          try {
            turnstileRef.current.reset();
          } catch (error) {
            console.error("[CAPTCHA] Error resetting widget:", error);
            // Force complete remount if reset fails
            setWidgetKey((prev) => prev + 1);
          }
        }
      },
      getResponse: () => {
        if (!enabled) return "captcha-disabled";
        if (turnstileRef.current) {
          return turnstileRef.current.getResponse();
        }
        return null;
      },
    }));

    // If CAPTCHA is disabled, don't render anything
    if (!enabled) {
      return null;
    }

    // Handle CAPTCHA verification
    const handleVerify = (token: string) => {
      console.log("[CAPTCHA] Verification successful, token received");
      // Reset all error counters on success
      retryCountRef.current = 0;
      consecutiveErrorsRef.current = 0;
      lastErrorTimeRef.current = 0;
      setIsRetrying(false);
      isRetryingRef.current = false;

      if (isDevelopment || isLocalhost) {
        console.log("[CAPTCHA] Development mode: Using test token");
      }
      onVerify(token);
    };

    // Handle CAPTCHA errors with better development messaging
    const handleError = (error: any) => {
      console.error("[CAPTCHA] Verification error:", error);
      console.error("[CAPTCHA] Current domain:", currentDomain);
      console.error("[CAPTCHA] Site key being used:", effectiveSiteKey?.substring(0, 10) + "...");
      console.error("[CAPTCHA] Retry count:", retryCountRef.current);
      console.error("[CAPTCHA] Consecutive errors:", consecutiveErrorsRef.current);
      console.error("[CAPTCHA] Time since last error:", Date.now() - lastErrorTimeRef.current, "ms");

      let errorMessage = "CAPTCHA verification failed";
      let shouldRetry = false;

      // Handle specific error codes
      if (typeof error === "string" || typeof error === "number") {
        const errorCode = error.toString();
        console.error("[CAPTCHA] Error code:", errorCode);

        switch (errorCode) {
          case "110200":
            if (isDevelopment || isLocalhost) {
              errorMessage = "Development mode: Domain validation error (expected on localhost)";
              console.log("[CAPTCHA] Switching to test mode for localhost development");
              return;
            } else {
              // Domain should be fixed now, but if we still get this error, don't retry excessively
              if (retryCountRef.current === 0) {
                console.log("[CAPTCHA] 110200 error - domain might still be propagating, attempting one retry...");
                shouldRetry = true;
              } else {
                // Persistent 110200 errors indicate a configuration issue
                console.error("[CAPTCHA] Persistent 110200 errors detected. Possible causes:");
                console.error("[CAPTCHA] 1. Domain not exactly matching in Cloudflare Turnstile");
                console.error("[CAPTCHA] 2. Cloudflare configuration not yet propagated (wait 5-10 minutes)");
                console.error("[CAPTCHA] 3. Wrong site key being used");
                console.error("[CAPTCHA] 4. Site key disabled or deleted in Cloudflare");
                console.error(`[CAPTCHA] Current domain: ${currentDomain}`);
                console.error(`[CAPTCHA] Site key: ${effectiveSiteKey?.substring(0, 10)}...`);

                errorMessage = `Domain validation still failing for '${currentDomain}'. Please verify:
1. Domain is exactly configured in Cloudflare Turnstile
2. Site key is correct and active
3. Wait 5-10 minutes for configuration to propagate`;
              }
            }
            break;
          case "110100":
            errorMessage = "CAPTCHA configuration error. Invalid site key.";
            console.error("[CAPTCHA] Site key issue - check your EXPO_PUBLIC_TURNSTILE_SITE_KEY");
            break;
          case "110110":
            errorMessage = "CAPTCHA widget error. Please try again.";
            shouldRetry = true;
            break;
          case "110500":
            errorMessage = "Network error. Please check your connection and try again.";
            shouldRetry = true;
            break;
          case "110600":
          case "110620":
            errorMessage = "CAPTCHA challenge timed out. Please try again.";
            shouldRetry = true;
            break;
          case "300000":
          case "600000":
            // These are often bot detection errors - don't retry aggressively
            errorMessage = "Challenge failed. Please try again or refresh the page.";
            if (retryCountRef.current === 0) {
              shouldRetry = true;
            }
            break;
          default:
            errorMessage = `CAPTCHA error (${errorCode}). Please try again.`;
            if (retryCountRef.current < 1) {
              shouldRetry = true;
            }
        }
      }

      // Only retry if we should and haven't exceeded limits
      if (shouldRetry && consecutiveErrorsRef.current < 3) {
        console.log("[CAPTCHA] Error is retryable, attempting retry...");
        retryTurnstile();
      } else {
        console.log("[CAPTCHA] Error is not retryable or retry limit reached, showing error to user");
        onError?.(errorMessage);
      }
    };

    // Handle CAPTCHA expiration
    const handleExpire = () => {
      console.log("[CAPTCHA] Token expired");
      retryCountRef.current = 0; // Reset retry count on expiration
      onExpire?.();
    };

    // If no site key is configured and not in development, show error message
    if (!effectiveSiteKey) {
      return (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>CAPTCHA configuration error. Please contact support.</ThemedText>
          {__DEV__ && (
            <ThemedText style={styles.debugText}>Debug: EXPO_PUBLIC_TURNSTILE_SITE_KEY not configured</ThemedText>
          )}
        </View>
      );
    }

    // Show development notice if using test keys
    const showDevelopmentNotice = (isDevelopment || isLocalhost) && effectiveSiteKey === TURNSTILE_TEST_SITE_KEY;

    // Show domain warning for Expo domains in production
    const showDomainWarning = !isDevelopment && !isLocalhost && isExpoDev && __DEV__;

    // Render the Turnstile component with platform-specific optimizations
    return (
      <View style={[styles.container, { minHeight: size === "compact" ? 65 : 80 }]}>
        {showDevelopmentNotice && (
          <ThemedText style={styles.developmentNotice}>Development Mode: Using test CAPTCHA</ThemedText>
        )}
        {showDomainWarning && (
          <ThemedText style={styles.warningNotice}>
            Warning: Ensure '{currentDomain}' is configured in Cloudflare Turnstile
          </ThemedText>
        )}
        {isRetrying && (
          <ThemedText style={styles.retryNotice}>
            Retrying CAPTCHA... (attempt {retryCountRef.current + 1}/3)
          </ThemedText>
        )}
        <Turnstile
          key={widgetKey}
          ref={turnstileRef}
          siteKey={effectiveSiteKey}
          onSuccess={handleVerify}
          onError={handleError}
          onExpire={handleExpire}
          options={{
            theme: theme === "auto" ? (colorScheme === "dark" ? "dark" : "light") : theme,
            size,
            action: "submit",
            cData: "auth_form",
            retry: "auto",
          }}
          style={{
            opacity: disabled || isRetrying ? 0.5 : 1,
            // Web-specific pointer events
            ...(Platform.OS === "web" && {
              pointerEvents: disabled || isRetrying ? "none" : "auto",
            }),
            // Mobile-optimized styling for better touch interaction
            ...(Platform.OS === "ios" || Platform.OS === "android"
              ? {
                  width: "100%",
                  maxWidth: 300,
                  alignSelf: "center",
                }
              : {}),
          }}
        />
      </View>
    );
  }
);

TurnstileCaptcha.displayName = "TurnstileCaptcha";

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginVertical: 10,
    minHeight: 80, // Default height, will be overridden by size prop
  },
  errorContainer: {
    padding: 15,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.error,
    marginVertical: 10,
  },
  errorText: {
    color: Colors.dark.error,
    textAlign: "center",
    fontSize: 14,
  },
  developmentNotice: {
    color: Colors.dark.icon,
    textAlign: "center",
    fontSize: 12,
    marginBottom: 5,
    fontStyle: "italic",
    opacity: 0.7,
  },
  warningNotice: {
    color: Colors.dark.warning || "#FFA500",
    textAlign: "center",
    fontSize: 12,
    marginBottom: 5,
    fontStyle: "italic",
    opacity: 0.8,
  },
  retryNotice: {
    color: Colors.dark.icon,
    textAlign: "center",
    fontSize: 12,
    marginBottom: 5,
    fontStyle: "italic",
    opacity: 0.8,
  },
  debugText: {
    color: Colors.dark.icon,
    textAlign: "center",
    fontSize: 10,
    marginTop: 5,
    fontStyle: "italic",
    opacity: 0.6,
  },
});

export default TurnstileCaptcha;

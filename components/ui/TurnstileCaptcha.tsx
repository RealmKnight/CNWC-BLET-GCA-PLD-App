import React, { useRef, useImperativeHandle, forwardRef, useEffect, useState } from "react";
import { Platform, View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

// Extend Window interface for Turnstile
declare global {
  interface Window {
    turnstile?: any;
  }
}

// Platform-specific imports
let WebTurnstile: any = null;
let ReactNativeTurnstile: any = null;
let resetTurnstile: any = null;

if (Platform.OS === "web") {
  // Web platform - use @marsidev/react-turnstile
  try {
    const webModule = require("@marsidev/react-turnstile");
    WebTurnstile = webModule.Turnstile;
  } catch (error) {
    console.error("[CAPTCHA] Failed to load web Turnstile module:", error);
  }
} else {
  // Mobile platforms - use react-native-turnstile
  try {
    const mobileModule = require("react-native-turnstile");
    ReactNativeTurnstile = mobileModule.default;
    resetTurnstile = mobileModule.resetTurnstile;
  } catch (error) {
    console.error("[CAPTCHA] Failed to load mobile Turnstile module:", error);
  }
}

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

// Function to load Turnstile script manually for web
const loadTurnstileScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (Platform.OS !== "web") {
      resolve();
      return;
    }

    // Check if script is already loaded
    if (typeof window !== "undefined" && window.turnstile) {
      resolve();
      return;
    }

    // Check if script tag already exists
    const existingScript = document.querySelector('script[src*="turnstile"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve());
      existingScript.addEventListener("error", () => reject(new Error("Script failed to load")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;

    script.onload = () => {
      setTimeout(() => {
        if (window.turnstile) {
          resolve();
        } else {
          reject(new Error("Turnstile object not available after script load"));
        }
      }, 100);
    };

    script.onerror = () => {
      reject(new Error("Failed to load Turnstile script"));
    };

    document.head.appendChild(script);
  });
};

const TurnstileCaptcha = forwardRef<TurnstileCaptchaRef, TurnstileCaptchaProps>(
  ({ onVerify, onError, onExpire, disabled = false, size = "normal", theme = "auto", enabled = true }, ref) => {
    const webTurnstileRef = useRef<any>(null);
    const mobileTurnstileResetRef = useRef<any>(null);
    const colorScheme = useColorScheme();
    const [isRetrying, setIsRetrying] = useState(false);
    const [lastToken, setLastToken] = useState<string | null>(null);
    const [isScriptLoaded, setIsScriptLoaded] = useState(Platform.OS !== "web");
    const [scriptLoadError, setScriptLoadError] = useState<string | null>(null);

    // Use refs to persist counters across widget resets
    const retryCountRef = useRef(0);
    const consecutiveErrorsRef = useRef(0);
    const lastErrorTimeRef = useRef(0);
    const isRetryingRef = useRef(false);

    // Get the site key from environment variables
    const siteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;

    // Load Turnstile script on web platform
    useEffect(() => {
      if (enabled && Platform.OS === "web") {
        loadTurnstileScript()
          .then(() => {
            setIsScriptLoaded(true);
            setScriptLoadError(null);
          })
          .catch((error) => {
            console.error("[CAPTCHA] Failed to load Turnstile script:", error);
            setScriptLoadError(error.message);
            setIsScriptLoaded(false);
          });
      }
    }, [enabled]);

    // Auto-verify when CAPTCHA is disabled
    useEffect(() => {
      if (!enabled) {
        onVerify("captcha-disabled");
      } else if (__DEV__ && siteKey) {
        // Platform-specific reminders for developers
        if (Platform.OS === "web") {
          console.log("[CAPTCHA] Web platform: Using @marsidev/react-turnstile");
        } else {
          console.log("[CAPTCHA] Mobile platform: Using react-native-turnstile");
          console.log(
            "[CAPTCHA] IMPORTANT: Ensure 'turnstile.1337707.xyz' is added to your Cloudflare Turnstile domains list"
          );
          console.log("[CAPTCHA] This is required for react-native-turnstile to work on mobile platforms");
        }
      }
    }, [enabled, onVerify, siteKey]);

    // Enhanced retry logic with rate limiting
    const retryTurnstile = () => {
      const now = Date.now();
      const timeSinceLastError = now - lastErrorTimeRef.current;

      // Rate limiting: don't retry more than once every 5 seconds
      if (timeSinceLastError < 5000) {
        console.log("[CAPTCHA] Rate limited: Too many retries, waiting...");
        return;
      }

      // Circuit breaker: If we get too many consecutive errors, stop retrying
      if (consecutiveErrorsRef.current >= 3) {
        console.log("[CAPTCHA] Circuit breaker activated: Too many consecutive errors, stopping retries");
        onError?.(
          "CAPTCHA is experiencing repeated failures. Please refresh the page and contact support if the issue persists."
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
          if (Platform.OS === "web" && webTurnstileRef.current) {
            try {
              webTurnstileRef.current.reset();
            } catch (error) {
              console.error("[CAPTCHA] Error resetting web widget:", error);
            }
          } else if (Platform.OS !== "web" && mobileTurnstileResetRef.current) {
            try {
              resetTurnstile(mobileTurnstileResetRef);
            } catch (error) {
              console.error("[CAPTCHA] Error resetting mobile widget:", error);
            }
          }
          setIsRetrying(false);
          isRetryingRef.current = false;
        }, 2000);
      } else {
        console.log("[CAPTCHA] Max retries reached or already retrying");
        onError?.("CAPTCHA verification failed after multiple attempts. Please refresh the page and try again.");
      }
    };

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (!enabled) return;
        console.log("[CAPTCHA] Manual reset called");
        retryCountRef.current = 0;
        setIsRetrying(false);
        isRetryingRef.current = false;
        lastErrorTimeRef.current = 0;
        consecutiveErrorsRef.current = 0;
        setLastToken(null);

        if (Platform.OS === "web" && webTurnstileRef.current) {
          try {
            webTurnstileRef.current.reset();
          } catch (error) {
            console.error("[CAPTCHA] Error resetting web widget:", error);
          }
        } else if (Platform.OS !== "web" && mobileTurnstileResetRef.current) {
          try {
            resetTurnstile(mobileTurnstileResetRef);
          } catch (error) {
            console.error("[CAPTCHA] Error resetting mobile widget:", error);
          }
        }
      },
      getResponse: () => {
        if (!enabled) return "captcha-disabled";
        if (Platform.OS === "web" && webTurnstileRef.current) {
          return webTurnstileRef.current.getResponse();
        }
        return lastToken;
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
      setLastToken(token);

      onVerify(token);
    };

    // Handle CAPTCHA errors
    const handleError = (error: any) => {
      console.error("[CAPTCHA] Verification error:", error);
      console.error("[CAPTCHA] Platform:", Platform.OS);
      console.error("[CAPTCHA] Retry count:", retryCountRef.current);
      console.error("[CAPTCHA] Consecutive errors:", consecutiveErrorsRef.current);

      let errorMessage = "CAPTCHA verification failed";
      let shouldRetry = false;

      // Handle specific error codes
      if (typeof error === "string" || typeof error === "number") {
        const errorCode = error.toString();
        console.error("[CAPTCHA] Error code:", errorCode);

        switch (errorCode) {
          case "110200":
            // Domain validation error
            if (retryCountRef.current === 0) {
              console.log("[CAPTCHA] 110200 error - domain might still be propagating, attempting one retry...");
              shouldRetry = true;
            } else {
              console.error("[CAPTCHA] Persistent 110200 errors detected - domain configuration issue");
              errorMessage =
                "Domain validation failed. Please verify your domain is configured in Cloudflare Turnstile.";
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
            // Bot detection errors - don't retry aggressively
            errorMessage = "Challenge failed. Please try again or refresh the page.";
            if (retryCountRef.current === 0) {
              shouldRetry = true;
            }
            break;
          default:
            console.error(`[CAPTCHA] Unknown error code: ${errorCode}`);
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
      setLastToken(null);
      onExpire?.();
    };

    // Handle CAPTCHA timeout (mobile only)
    const handleTimeout = () => {
      console.log("[CAPTCHA] Widget timeout");
      handleError("110620"); // Treat timeout as error code 110620
    };

    // Handle widget load
    const handleLoad = (widgetId: string) => {
      console.log(`[CAPTCHA] Widget loaded with ID: ${widgetId}`);
    };

    // If no site key is configured, show error message
    if (!siteKey) {
      return (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>CAPTCHA configuration error. Please contact support.</ThemedText>
          {__DEV__ && (
            <>
              <ThemedText style={styles.debugText}>Debug: EXPO_PUBLIC_TURNSTILE_SITE_KEY not configured</ThemedText>
              {Platform.OS !== "web" && (
                <ThemedText style={styles.debugText}>
                  Important: Add 'turnstile.1337707.xyz' to your Cloudflare Turnstile domains list
                </ThemedText>
              )}
            </>
          )}
        </View>
      );
    }

    // Show script loading error if script failed to load (web only)
    if (Platform.OS === "web" && scriptLoadError) {
      return (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>
            CAPTCHA failed to load. Please check your internet connection and try refreshing the page.
          </ThemedText>
          {__DEV__ && <ThemedText style={styles.debugText}>Debug: Script load error - {scriptLoadError}</ThemedText>}
        </View>
      );
    }

    // Show loading state while script is loading (web only)
    if (Platform.OS === "web" && !isScriptLoaded) {
      return (
        <View style={styles.container}>
          <ThemedText style={styles.loadingText}>Loading CAPTCHA...</ThemedText>
          {__DEV__ && <ThemedText style={styles.debugText}>Debug: Waiting for Turnstile script to load</ThemedText>}
        </View>
      );
    }

    // Check if the required module is available
    if (Platform.OS === "web" && !WebTurnstile) {
      return (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>CAPTCHA module not available for web platform.</ThemedText>
          {__DEV__ && (
            <ThemedText style={styles.debugText}>Debug: @marsidev/react-turnstile not loaded properly</ThemedText>
          )}
        </View>
      );
    }

    if (Platform.OS !== "web" && !ReactNativeTurnstile) {
      return (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>CAPTCHA module not available for mobile platform.</ThemedText>
          {__DEV__ && (
            <ThemedText style={styles.debugText}>Debug: react-native-turnstile not loaded properly</ThemedText>
          )}
        </View>
      );
    }

    // Determine theme
    const effectiveTheme = theme === "auto" ? (colorScheme === "dark" ? "dark" : "light") : theme;

    // Render platform-specific component
    return (
      <View style={[styles.container, { minHeight: size === "compact" ? 65 : 80 }]}>
        {isRetrying && (
          <ThemedText style={styles.retryNotice}>
            Retrying CAPTCHA... (attempt {retryCountRef.current + 1}/3)
          </ThemedText>
        )}

        {Platform.OS === "web" ? (
          // Web platform - use @marsidev/react-turnstile
          <WebTurnstile
            ref={webTurnstileRef}
            siteKey={siteKey}
            onSuccess={handleVerify}
            onError={handleError}
            onExpire={handleExpire}
            onLoad={handleLoad}
            options={{
              theme: effectiveTheme,
              size,
              action: "submit",
              cData: "auth_form",
              retry: "never", // Disable automatic retries to prevent internal widget retries
            }}
            style={{
              opacity: disabled || isRetrying ? 0.5 : 1,
              pointerEvents: disabled || isRetrying ? "none" : "auto",
            }}
          />
        ) : (
          // Mobile platforms - use react-native-turnstile
          <ReactNativeTurnstile
            sitekey={siteKey}
            onVerify={handleVerify}
            onError={handleError}
            onExpire={handleExpire}
            onTimeout={handleTimeout}
            onLoad={handleLoad}
            resetRef={mobileTurnstileResetRef}
            theme={effectiveTheme}
            size={size}
            retry="never" // Disable automatic retries to prevent internal widget retries
            style={[
              styles.turnstileWidget,
              {
                opacity: disabled || isRetrying ? 0.5 : 1,
              },
            ]}
          />
        )}
      </View>
    );
  }
);

TurnstileCaptcha.displayName = "TurnstileCaptcha";

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginVertical: 10,
    minHeight: 80,
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
  loadingText: {
    color: Colors.dark.icon,
    textAlign: "center",
    fontSize: 14,
    marginBottom: 5,
    fontStyle: "italic",
    opacity: 0.8,
  },
  turnstileWidget: {
    width: "100%",
    maxWidth: 300,
    alignSelf: "center",
  },
});

export default TurnstileCaptcha;

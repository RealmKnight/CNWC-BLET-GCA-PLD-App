import React, { useRef, useImperativeHandle, forwardRef, useEffect, useState } from "react";
import { Platform, View, StyleSheet, Dimensions } from "react-native";
import { WebView } from "react-native-webview";
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

// Function to load Turnstile script manually (web only)
const loadTurnstileScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.turnstile) {
      resolve();
      return;
    }

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
    const turnstileRef = useRef<any>(null);
    const webViewRef = useRef<WebView>(null);
    const colorScheme = useColorScheme();
    const [isRetrying, setIsRetrying] = useState(false);
    const [widgetKey, setWidgetKey] = useState(0);
    const [isCircuitBreakerActive, setIsCircuitBreakerActive] = useState(false);
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);
    const [scriptLoadError, setScriptLoadError] = useState<string | null>(null);
    const [currentToken, setCurrentToken] = useState<string | null>(null);

    // Use refs to persist counters across widget resets
    const retryCountRef = useRef(0);
    const consecutiveErrorsRef = useRef(0);
    const lastErrorTimeRef = useRef(0);
    const isRetryingRef = useRef(false);

    // Get the site key from environment variables
    const siteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;

    // Determine effective theme
    const effectiveTheme = theme === "auto" ? (colorScheme === "dark" ? "dark" : "light") : theme;

    // Use compact size on mobile for better layout
    const effectiveSize = Platform.OS !== "web" ? "compact" : size;

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
      }
    }, [enabled, onVerify]);

    // Enhanced retry logic with rate limiting
    const retryTurnstile = () => {
      const now = Date.now();
      const timeSinceLastError = now - lastErrorTimeRef.current;

      // Rate limiting: don't retry more than once every 5 seconds
      if (timeSinceLastError < 5000) {
        return;
      }

      // Circuit breaker: If we get too many consecutive errors, stop retries
      if (consecutiveErrorsRef.current >= 3) {
        setIsCircuitBreakerActive(true);
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

        // Reset the widget after a short delay
        setTimeout(() => {
          if (Platform.OS === "web" && turnstileRef.current) {
            try {
              turnstileRef.current.reset();
            } catch (error) {
              console.error("[CAPTCHA] Error resetting widget:", error);
              setWidgetKey((prev) => prev + 1);
            }
          } else if (Platform.OS !== "web" && webViewRef.current) {
            // Reset mobile WebView
            webViewRef.current.reload();
          }
          setIsRetrying(false);
          isRetryingRef.current = false;
        }, 2000);
      } else {
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
        setIsCircuitBreakerActive(false);
        setCurrentToken(null);

        if (Platform.OS === "web" && turnstileRef.current) {
          try {
            turnstileRef.current.reset();
          } catch (error) {
            console.error("[CAPTCHA] Error resetting widget:", error);
            setWidgetKey((prev) => prev + 1);
          }
        } else if (Platform.OS !== "web" && webViewRef.current) {
          webViewRef.current.reload();
        }
      },
      getResponse: () => {
        if (!enabled) return "captcha-disabled";
        if (isCircuitBreakerActive) return null;

        if (Platform.OS === "web" && turnstileRef.current) {
          return turnstileRef.current.getResponse();
        } else {
          return currentToken;
        }
      },
    }));

    // If CAPTCHA is disabled, don't render anything
    if (!enabled) {
      return null;
    }

    // Debug info for mobile layout issues
    if (__DEV__ && Platform.OS !== "web") {
      console.log(
        `[CAPTCHA] Mobile rendering - Size: ${effectiveSize}, Height: ${effectiveSize === "compact" ? 100 : 120}px`
      );
    }

    // If circuit breaker is active, show error message instead of widget
    if (isCircuitBreakerActive) {
      return (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>
            CAPTCHA temporarily disabled due to repeated failures. Please refresh the page to try again.
          </ThemedText>
          {__DEV__ && (
            <ThemedText style={styles.debugText}>
              Debug: Circuit breaker active after {consecutiveErrorsRef.current} consecutive errors
            </ThemedText>
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

    // If no site key is configured, show error message
    if (!siteKey) {
      return (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>CAPTCHA configuration error. Please contact support.</ThemedText>
          {__DEV__ && (
            <ThemedText style={styles.debugText}>Debug: EXPO_PUBLIC_TURNSTILE_SITE_KEY not configured</ThemedText>
          )}
        </View>
      );
    }

    // Handle CAPTCHA verification
    const handleVerify = (token: string) => {
      // Reset all error counters on success
      retryCountRef.current = 0;
      consecutiveErrorsRef.current = 0;
      lastErrorTimeRef.current = 0;
      setIsRetrying(false);
      isRetryingRef.current = false;
      setIsCircuitBreakerActive(false);
      setCurrentToken(token);

      onVerify(token);
    };

    // Handle CAPTCHA errors
    const handleError = (error: any) => {
      console.error("[CAPTCHA] Verification error:", error);

      let errorMessage = "CAPTCHA verification failed";
      let shouldRetry = false;

      // Handle specific error codes
      if (typeof error === "string" || typeof error === "number") {
        const errorCode = error.toString();

        switch (errorCode) {
          case "110200":
            if (retryCountRef.current === 0) {
              shouldRetry = true;
            } else {
              errorMessage = "Domain validation failed. Please contact support.";
            }
            break;
          case "400020":
            if (retryCountRef.current === 0) {
              shouldRetry = true;
              errorMessage = "CAPTCHA widget failed to load. Retrying...";
            } else {
              errorMessage = "CAPTCHA widget failed to load after retry. Please refresh the page.";
            }
            break;
          case "110100":
            errorMessage = "CAPTCHA configuration error. Invalid site key.";
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
          default:
            errorMessage = `CAPTCHA error (${errorCode}). Please try again.`;
            if (retryCountRef.current < 1) {
              shouldRetry = true;
            }
        }
      }

      // Only retry if we should and haven't exceeded limits
      if (shouldRetry && consecutiveErrorsRef.current < 3) {
        retryTurnstile();
      } else {
        onError?.(errorMessage);
      }
    };

    // Handle CAPTCHA expiration
    const handleExpire = () => {
      retryCountRef.current = 0; // Reset retry count on expiration
      setCurrentToken(null);
      onExpire?.();
    };

    // Get the mobile CAPTCHA URL - this will load from a valid domain
    const getMobileCaptchaUrl = () => {
      // Always use production URL for mobile to avoid network issues
      const baseUrl = "https://cnwc-gca-pld-app.expo.app";
      const params = new URLSearchParams({
        siteKey: siteKey || "",
        theme: effectiveTheme,
        size: effectiveSize,
        mobile: "true",
      });
      return `${baseUrl}/captcha?${params.toString()}`;
    };

    // Handle WebView messages (mobile only)
    const handleWebViewMessage = (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        switch (data.type) {
          case "success":
            handleVerify(data.token);
            break;
          case "error":
            handleError(data.error || data.message);
            break;
          case "expired":
            handleExpire();
            break;
          case "timeout":
            handleError("CAPTCHA timed out");
            break;
          default:
            console.warn("[CAPTCHA] Unknown WebView message type:", data.type);
        }
      } catch (error) {
        console.error("[CAPTCHA] Error parsing WebView message:", error);
        handleError("Communication error with CAPTCHA widget");
      }
    };

    // Render platform-specific component
    if (Platform.OS === "web") {
      // Web implementation using @marsidev/react-turnstile
      return (
        <View style={[styles.container, { minHeight: effectiveSize === "compact" ? 65 : 80 }]}>
          {isRetrying && (
            <ThemedText style={styles.retryNotice}>
              Retrying CAPTCHA... (attempt {retryCountRef.current + 1}/3)
            </ThemedText>
          )}
          <Turnstile
            key={widgetKey}
            ref={turnstileRef}
            siteKey={siteKey}
            onSuccess={handleVerify}
            onError={handleError}
            onExpire={handleExpire}
            options={{
              theme: effectiveTheme,
              size: effectiveSize,
              action: "submit",
              cData: "auth_form",
              retry: "never",
            }}
            style={{
              opacity: disabled || isRetrying ? 0.5 : 1,
              pointerEvents: disabled || isRetrying ? "none" : "auto",
            }}
          />
        </View>
      );
    } else {
      // Mobile implementation using WebView
      const webViewHeight = effectiveSize === "compact" ? 100 : 120; // Reduced height for better layout

      return (
        <View style={[styles.container, { minHeight: webViewHeight }]}>
          {isRetrying && (
            <ThemedText style={styles.retryNotice}>
              Retrying CAPTCHA... (attempt {retryCountRef.current + 1}/3)
            </ThemedText>
          )}
          <WebView
            ref={webViewRef}
            source={{ uri: getMobileCaptchaUrl() }}
            style={[
              styles.webView,
              {
                height: webViewHeight,
                opacity: disabled || isRetrying ? 0.5 : 1,
              },
            ]}
            onMessage={handleWebViewMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            scalesPageToFit={true}
            scrollEnabled={false}
            bounces={false}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            originWhitelist={["*"]}
            mixedContentMode="compatibility"
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error("[CAPTCHA] WebView error:", nativeEvent);
              handleError("Failed to load CAPTCHA widget");
            }}
            onHttpError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error("[CAPTCHA] WebView HTTP error:", nativeEvent);
              handleError("Network error loading CAPTCHA");
            }}
            renderLoading={() => (
              <View style={styles.webViewLoading}>
                <ThemedText style={styles.loadingText}>Loading CAPTCHA...</ThemedText>
              </View>
            )}
          />
        </View>
      );
    }
  }
);

TurnstileCaptcha.displayName = "TurnstileCaptcha";

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginVertical: 8,
    minHeight: 80,
    backgroundColor: Colors.dark.background,
  },
  webView: {
    width: "100%",
    maxWidth: 300,
    backgroundColor: "transparent",
    borderRadius: 8,
  },
  webViewLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  errorContainer: {
    padding: 12,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.error,
    marginVertical: 8,
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
    marginBottom: 4,
    fontStyle: "italic",
    opacity: 0.8,
  },
  debugText: {
    color: Colors.dark.icon,
    textAlign: "center",
    fontSize: 10,
    marginTop: 4,
    fontStyle: "italic",
    opacity: 0.6,
  },
  loadingText: {
    color: Colors.dark.icon,
    textAlign: "center",
    fontSize: 14,
    marginBottom: 0,
    fontStyle: "italic",
    opacity: 0.8,
  },
});

export default TurnstileCaptcha;

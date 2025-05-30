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

    // Create HTML content for mobile WebView
    const createWebViewHTML = () => {
      const { width } = Dimensions.get("window");
      const captchaWidth = Math.min(width - 40, 300); // 20px margin on each side, max 300px

      return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Turnstile CAPTCHA</title>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: ${effectiveTheme === "dark" ? "#1a1a1a" : "#ffffff"};
            color: ${effectiveTheme === "dark" ? "#ffffff" : "#000000"};
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            box-sizing: border-box;
        }
        
        .captcha-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 100%;
            max-width: ${captchaWidth}px;
        }
        
        .loading {
            text-align: center;
            padding: 20px;
            font-size: 16px;
            opacity: 0.7;
        }
        
        .error {
            text-align: center;
            padding: 20px;
            color: #ff4444;
            font-size: 14px;
            border: 1px solid #ff4444;
            border-radius: 8px;
            background-color: ${effectiveTheme === "dark" ? "#2a1a1a" : "#fff5f5"};
        }
        
        /* Ensure the Turnstile widget is properly sized */
        .cf-turnstile {
            margin: 0 auto;
            max-width: 100%;
        }
        
        /* Handle different widget sizes */
        .cf-turnstile iframe {
            max-width: 100% !important;
            width: ${size === "compact" ? "164px" : "300px"} !important;
            height: ${size === "compact" ? "100px" : "65px"} !important;
        }
    </style>
</head>
<body>
    <div class="captcha-container">
        <div id="loading" class="loading">Loading CAPTCHA...</div>
        <div id="captcha-widget"></div>
        <div id="error" class="error" style="display: none;"></div>
    </div>

    <script>
        let widgetId = null;
        let retryCount = 0;
        const maxRetries = 3;
        
        function showError(message) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('captcha-widget').style.display = 'none';
            document.getElementById('error').style.display = 'block';
            document.getElementById('error').textContent = message;
            
            // Send error to React Native
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'error',
                    message: message
                }));
            }
        }
        
        function initializeTurnstile() {
            if (typeof turnstile === 'undefined') {
                if (retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(initializeTurnstile, 1000);
                } else {
                    showError('Failed to load CAPTCHA service. Please check your internet connection.');
                }
                return;
            }
            
            try {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('captcha-widget').style.display = 'block';
                
                widgetId = turnstile.render('#captcha-widget', {
                    sitekey: '${siteKey}',
                    theme: '${effectiveTheme}',
                    size: '${size}',
                    action: 'submit',
                    cData: 'auth_form',
                    retry: 'never',
                    callback: function(token) {
                        // Send success to React Native
                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'success',
                                token: token
                            }));
                        }
                    },
                    'error-callback': function(error) {
                        console.error('Turnstile error:', error);
                        showError('CAPTCHA verification failed. Please try again.');
                        
                        // Send error to React Native
                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'error',
                                error: error
                            }));
                        }
                    },
                    'expired-callback': function() {
                        // Send expiration to React Native
                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'expired'
                            }));
                        }
                    },
                    'timeout-callback': function() {
                        showError('CAPTCHA timed out. Please try again.');
                        
                        // Send timeout to React Native
                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'timeout'
                            }));
                        }
                    }
                });
            } catch (error) {
                console.error('Error initializing Turnstile:', error);
                showError('Failed to initialize CAPTCHA. Please refresh and try again.');
            }
        }
        
        // Reset function for React Native to call
        window.resetCaptcha = function() {
            if (widgetId !== null && typeof turnstile !== 'undefined') {
                try {
                    turnstile.reset(widgetId);
                } catch (error) {
                    console.error('Error resetting Turnstile:', error);
                    // Reload the page if reset fails
                    window.location.reload();
                }
            }
        };
        
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeTurnstile);
        } else {
            initializeTurnstile();
        }
        
        // Fallback initialization after a delay
        setTimeout(initializeTurnstile, 2000);
    </script>
</body>
</html>`;
    };

    // Get the base URL for mobile WebView
    const getMobileWebViewUrl = () => {
      // In development, use localhost
      if (__DEV__) {
        return "http://localhost:8081"; // Expo dev server
      }

      // In production, use your deployed domain
      return "https://cnwc-gca-pld-app.expo.app";
    };

    // Create a data URI for the HTML content (this works with existing domains)
    const createDataUri = () => {
      const html = createWebViewHTML();
      const encodedHtml = encodeURIComponent(html);
      return `data:text/html;charset=utf-8,${encodedHtml}`;
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
        <View style={[styles.container, { minHeight: size === "compact" ? 65 : 80 }]}>
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
              size,
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
      const webViewHeight = size === "compact" ? 120 : 150; // Extra height for mobile touch targets

      return (
        <View style={[styles.container, { minHeight: webViewHeight }]}>
          {isRetrying && (
            <ThemedText style={styles.retryNotice}>
              Retrying CAPTCHA... (attempt {retryCountRef.current + 1}/3)
            </ThemedText>
          )}
          <WebView
            ref={webViewRef}
            source={{ html: createWebViewHTML() }}
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
    marginVertical: 10,
    minHeight: 80,
  },
  webView: {
    width: "100%",
    maxWidth: 320, // Slightly wider than the widget for touch targets
    backgroundColor: "transparent",
  },
  webViewLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.background,
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
});

export default TurnstileCaptcha;

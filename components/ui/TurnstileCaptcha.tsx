import React, { useRef, useImperativeHandle, forwardRef, useEffect } from "react";
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

    // Get the site key from environment variables
    const siteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;

    // Check if we're in development mode
    const isDevelopment = __DEV__ || process.env.NODE_ENV === "development";
    const isLocalhost =
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname.includes("localhost"));

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

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (!enabled) return;
        if (turnstileRef.current) {
          turnstileRef.current.reset();
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
      if (isDevelopment || isLocalhost) {
        console.log("[CAPTCHA] Development mode: Using test token");
      }
      onVerify(token);
    };

    // Handle CAPTCHA errors with better development messaging
    const handleError = (error: any) => {
      console.error("[CAPTCHA] Verification error:", error);

      let errorMessage = "CAPTCHA verification failed";

      // Handle specific error codes
      if (typeof error === "string" || typeof error === "number") {
        const errorCode = error.toString();
        switch (errorCode) {
          case "110200":
            if (isDevelopment || isLocalhost) {
              errorMessage = "Development mode: Domain validation error (expected on localhost)";
              console.log("[CAPTCHA] Switching to test mode for localhost development");
              // In development, we can treat this as a success for testing purposes
              // or you could auto-retry with test keys
              return;
            } else {
              errorMessage = "Domain validation failed. Please contact support.";
            }
            break;
          case "110100":
            errorMessage = "CAPTCHA configuration error. Please contact support.";
            break;
          case "110110":
            errorMessage = "CAPTCHA widget error. Please try again.";
            break;
          case "110500":
            errorMessage = "Network error. Please check your connection and try again.";
            break;
          default:
            errorMessage = `CAPTCHA error (${errorCode}). Please try again.`;
        }
      }

      onError?.(errorMessage);
    };

    // Handle CAPTCHA expiration
    const handleExpire = () => {
      console.log("[CAPTCHA] Token expired");
      onExpire?.();
    };

    // If no site key is configured and not in development, show error message
    if (!effectiveSiteKey) {
      return (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>CAPTCHA configuration error. Please contact support.</ThemedText>
        </View>
      );
    }

    // Show development notice if using test keys
    const showDevelopmentNotice = (isDevelopment || isLocalhost) && effectiveSiteKey === TURNSTILE_TEST_SITE_KEY;

    // For web platform, render the Turnstile component directly
    if (Platform.OS === "web") {
      return (
        <View style={[styles.container, { minHeight: size === "compact" ? 65 : 80 }]}>
          {showDevelopmentNotice && (
            <ThemedText style={styles.developmentNotice}>Development Mode: Using test CAPTCHA</ThemedText>
          )}
          <Turnstile
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
            }}
            style={{
              opacity: disabled ? 0.5 : 1,
              pointerEvents: disabled ? "none" : "auto",
            }}
          />
        </View>
      );
    }

    // For mobile platforms, we'll use a WebView-based approach
    // Note: @marsidev/react-turnstile handles this internally for React Native
    return (
      <View style={[styles.container, { minHeight: size === "compact" ? 65 : 80 }]}>
        {showDevelopmentNotice && (
          <ThemedText style={styles.developmentNotice}>Development Mode: Using test CAPTCHA</ThemedText>
        )}
        <Turnstile
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
          }}
          style={{
            opacity: disabled ? 0.5 : 1,
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
});

export default TurnstileCaptcha;

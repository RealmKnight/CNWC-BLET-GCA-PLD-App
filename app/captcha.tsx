import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { Platform } from "react-native";

export default function CaptchaPage() {
  const params = useLocalSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const siteKey = params.siteKey as string;
  const theme = (params.theme as string) || "light";
  const size = (params.size as string) || "normal";
  const isMobile = params.mobile === "true";

  useEffect(() => {
    if (Platform.OS === "web" && isMobile) {
      // This page is specifically for mobile WebView usage
      loadTurnstileForMobile();
    }
  }, [siteKey, theme, size]);

  const loadTurnstileForMobile = () => {
    // Create the HTML content for mobile CAPTCHA
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>CAPTCHA Verification</title>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
    <style>
        body {
            margin: 0;
            padding: 10px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #000000;
            color: ${theme === "dark" ? "#D4AF37" : "#000000"};
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
            max-width: 300px;
            padding: 10px;
            background-color: #000000;
        }
        
        .loading {
            text-align: center;
            padding: 15px;
            font-size: 14px;
            opacity: 0.7;
            color: #D4AF37;
        }
        
        .error {
            text-align: center;
            padding: 15px;
            color: #ff4444;
            font-size: 13px;
            border: 1px solid #ff4444;
            border-radius: 8px;
            background-color: #000000;
            margin-top: 15px;
        }
        
        .cf-turnstile {
            margin: 0 auto;
            max-width: 100%;
            border-radius: 8px;
            overflow: hidden;
        }
        
        .cf-turnstile iframe {
            max-width: 100% !important;
            width: ${size === "compact" ? "164px" : "300px"} !important;
            height: ${size === "compact" ? "100px" : "65px"} !important;
            border-radius: 8px;
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
            
            // Send error to React Native WebView
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
                    theme: '${theme}',
                    size: '${size}',
                    action: 'submit',
                    cData: 'auth_form',
                    retry: 'never',
                    callback: function(token) {
                        // Send success to React Native WebView
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
                        
                        // Send error to React Native WebView
                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'error',
                                error: error
                            }));
                        }
                    },
                    'expired-callback': function() {
                        // Send expiration to React Native WebView
                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'expired'
                            }));
                        }
                    },
                    'timeout-callback': function() {
                        showError('CAPTCHA timed out. Please try again.');
                        
                        // Send timeout to React Native WebView
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

    // Replace the page content with the CAPTCHA HTML
    document.open();
    document.write(html);
    document.close();
  };

  if (Platform.OS !== "web") {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>
          This page is only available on web platform for mobile WebView usage.
        </ThemedText>
      </ThemedView>
    );
  }

  if (!siteKey) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>Missing site key parameter. Please check your configuration.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.loadingText}>Initializing CAPTCHA...</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: Colors.dark.background,
  },
  loadingText: {
    fontSize: 16,
    textAlign: "center",
    opacity: 0.7,
    color: Colors.dark.text,
  },
  errorText: {
    fontSize: 14,
    textAlign: "center",
    color: Colors.dark.error,
  },
});

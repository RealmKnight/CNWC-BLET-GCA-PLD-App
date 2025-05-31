import { useState, useRef } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { ThemedView } from "@/components/ThemedView";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import TurnstileCaptcha, { TurnstileCaptchaRef } from "@/components/ui/TurnstileCaptcha";

// TODO: Add admin controls to enable/disable CAPTCHA protection
// Future enhancement: Allow application_admin to enable/disable CAPTCHA protection
// on the sign-in page based on security needs and attack patterns.
// This would use the same TurnstileCaptcha component and follow the same pattern
// as the sign-up and forgot-password forms.

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, isCaptchaEnabled } = useAuth();
  const captchaRef = useRef<TurnstileCaptchaRef>(null);

  const handleCaptchaVerify = (token: string) => {
    console.log("[SignIn] CAPTCHA verified successfully");
    setCaptchaToken(token);
    setCaptchaError(null);
  };

  const handleCaptchaError = (error: string) => {
    console.error("[SignIn] CAPTCHA error:", error);
    setCaptchaToken(null);
    setCaptchaError(error);
  };

  const handleCaptchaExpire = () => {
    console.log("[SignIn] CAPTCHA token expired");
    setCaptchaToken(null);
    setCaptchaError("CAPTCHA expired. Please verify again.");
  };

  const handleSignIn = async () => {
    try {
      setError(null);
      setCaptchaError(null);
      setIsLoading(true);

      // Validate CAPTCHA token only if CAPTCHA is enabled
      if (isCaptchaEnabled && !captchaToken) {
        setCaptchaError("Please complete the CAPTCHA verification");
        return;
      }

      console.log("[SignIn] Attempting sign in" + (isCaptchaEnabled ? " with CAPTCHA protection" : ""));
      await signIn(email, password, captchaToken || undefined);

      // Reset CAPTCHA after successful submission
      if (isCaptchaEnabled) {
        captchaRef.current?.reset();
        setCaptchaToken(null);
      }
    } catch (error) {
      console.error("[SignIn] Sign in error:", error);
      setError(error instanceof Error ? error.message : "An error occurred during sign in");

      // Reset CAPTCHA on error to allow retry
      if (isCaptchaEnabled) {
        captchaRef.current?.reset();
        setCaptchaToken(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Determine if form is ready to submit
  const isFormReady = isCaptchaEnabled ? !!captchaToken : true;

  return (
    <ThemedScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Image source={require("@/assets/images/BLETblackgold.png")} style={styles.logo} />
      <ThemedView style={styles.header}>
        <ThemedText type="title">Welcome Back</ThemedText>
        <ThemedText type="subtitle">Sign in to continue</ThemedText>
      </ThemedView>

      <ThemedView style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={Colors.dark.secondary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!isLoading}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={Colors.dark.secondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!isLoading}
        />

        {/* CAPTCHA Component */}
        <TurnstileCaptcha
          ref={captchaRef}
          onVerify={handleCaptchaVerify}
          onError={handleCaptchaError}
          onExpire={handleCaptchaExpire}
          disabled={isLoading}
          enabled={isCaptchaEnabled}
          size="normal"
          theme="auto"
        />

        {/* Display CAPTCHA error */}
        {captchaError && <ThemedText style={styles.captchaError}>{captchaError}</ThemedText>}

        {/* Display general error */}
        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <TouchableOpacity
          style={[styles.button, (isLoading || !isFormReady) && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={isLoading || !isFormReady}
        >
          <ThemedText style={styles.buttonText}>{isLoading ? "Signing in..." : "Sign In"}</ThemedText>
        </TouchableOpacity>

        <ThemedView style={styles.links}>
          <Link href="/(auth)/sign-up" asChild>
            <TouchableOpacity>
              <ThemedText style={styles.link}>
                Don't have an account? <ThemedText style={styles.signuplink}>Sign Up</ThemedText>
              </ThemedText>
            </TouchableOpacity>
          </Link>

          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity>
              <ThemedText style={styles.link}>
                Forgot <ThemedText style={styles.signuplink}>Password</ThemedText>?
              </ThemedText>
            </TouchableOpacity>
          </Link>
        </ThemedView>
      </ThemedView>
    </ThemedScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  contentContainer: {
    flexGrow: 1,
    padding: 20,
    justifyContent: "center",
    minHeight: "100%",
  },
  header: {
    marginBottom: 40,
    alignItems: "center",
  },
  form: {
    width: "100%",
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    backgroundColor: Colors.dark.card,
    color: Colors.dark.primary,
  },
  button: {
    backgroundColor: Colors.dark.buttonBackground,
    height: 50,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.dark.buttonBorder,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: Colors.dark.buttonText,
    fontSize: 16,
    fontWeight: "600",
  },
  links: {
    marginTop: 20,
    alignItems: "center",
  },
  link: {
    color: Colors.dark.icon,
    marginVertical: 5,
    fontSize: 20,
  },
  signuplink: {
    color: Colors.dark.icon,
    fontSize: 20,
    fontWeight: "bold",
  },
  error: {
    color: Colors.dark.error,
    textAlign: "center",
    marginBottom: 10,
  },
  captchaError: {
    color: Colors.dark.error,
    textAlign: "center",
    marginBottom: 10,
    fontSize: 14,
  },
  logo: {
    width: 130,
    height: 163,
    alignSelf: "center",
    marginBottom: 20,
  },
});

import { useState, useRef } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image, KeyboardAvoidingView, Platform } from "react-native";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/hooks/useAuth";
import { useWebInputEnhancements } from "@/hooks/useWebInputEnhancements";
import { ThemedView } from "@/components/ThemedView";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import TurnstileCaptcha, { TurnstileCaptchaRef } from "@/components/ui/TurnstileCaptcha";

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const { signIn, isCaptchaEnabled } = useAuth();
  const captchaRef = useRef<TurnstileCaptchaRef>(null);
  const router = useRouter();

  // Enable web-specific input enhancements for iOS PWA
  useWebInputEnhancements();

  const validateEmail = (email: string): string | null => {
    if (!email.trim()) {
      return "Email is required";
    }
    if (!EMAIL_REGEX.test(email)) {
      return "Please enter a valid email address";
    }
    return null;
  };

  // Enhanced error message mapping for better user experience
  const getErrorMessage = (error: any): string => {
    const errorMessage = error?.message || error?.toString() || "";
    const errorCode = error?.code || "";

    // Handle rate limiting
    if (errorCode === "over_request_rate_limit" || errorMessage.includes("rate limit")) {
      return "Too many sign-in attempts. Please wait a few minutes before trying again.";
    }

    // Handle email not confirmed
    if (errorCode === "email_not_confirmed" || errorMessage.includes("email not confirmed")) {
      return "Please check your email and click the confirmation link before signing in.";
    }

    // Handle invalid credentials - most common error
    if (errorCode === "invalid_credentials" || errorMessage.includes("Invalid login credentials")) {
      if (loginAttempts >= 2) {
        return "Sign-in failed. Please check your email and password, or use 'Forgot Password' if you need to reset it.";
      }
      return "Incorrect email or password. Please check your credentials and try again.";
    }

    // Handle user not found scenarios
    if (errorCode === "user_not_found" || errorMessage.includes("user not found")) {
      return "No account found with this email address. Please check your email or sign up for a new account.";
    }

    // Handle account disabled/banned
    if (errorCode === "user_banned" || errorMessage.includes("banned")) {
      return "Your account has been temporarily disabled. Please contact support for assistance.";
    }

    // Handle weak password during sign in (shouldn't happen but just in case)
    if (errorCode === "weak_password") {
      return "Your password needs to be updated. Please use the 'Forgot Password' option to reset it.";
    }

    // Handle captcha failures
    if (errorCode === "captcha_failed" || errorMessage.includes("captcha")) {
      return "Security verification failed. Please complete the verification and try again.";
    }

    // Handle signup disabled
    if (errorCode === "signup_disabled") {
      return "New account creation is currently disabled. Please contact support if you need assistance.";
    }

    // Handle network/server errors
    if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
      return "Connection error. Please check your internet connection and try again.";
    }

    // Handle server errors
    if (errorMessage.includes("500") || errorMessage.includes("Internal Server Error")) {
      return "Our service is temporarily experiencing issues. Please try again in a few minutes.";
    }

    // Default fallback for unknown errors
    return "Sign-in failed. Please try again or contact support if the problem persists.";
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    // Clear email error when user starts typing
    if (emailError) {
      setEmailError(null);
    }
  };

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

      // Validate email before attempting sign in
      const emailValidationError = validateEmail(email);
      if (emailValidationError) {
        setEmailError(emailValidationError);
        return;
      }

      // Validate password is not empty
      if (!password.trim()) {
        setError("Password is required");
        return;
      }

      // Validate CAPTCHA token only if CAPTCHA is enabled
      if (isCaptchaEnabled && !captchaToken) {
        setCaptchaError("Please complete the security verification");
        return;
      }

      console.log("[SignIn] Attempting sign in" + (isCaptchaEnabled ? " with CAPTCHA protection" : ""));
      await signIn(email, password, captchaToken || undefined);

      // Reset CAPTCHA after successful submission
      if (isCaptchaEnabled) {
        captchaRef.current?.reset();
        setCaptchaToken(null);
      }

      // Reset login attempts on successful sign in
      setLoginAttempts(0);
    } catch (error) {
      console.error("[SignIn] Sign in error:", error);

      // Increment login attempts for better error messaging
      setLoginAttempts((prev) => prev + 1);

      // Use enhanced error messaging
      setError(getErrorMessage(error));

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
          style={[styles.input, emailError && styles.inputError]}
          placeholder="Email"
          placeholderTextColor={Colors.dark.secondary}
          value={email}
          onChangeText={handleEmailChange}
          onBlur={() => setEmailError(validateEmail(email))}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!isLoading}
        />
        {emailError && <ThemedText style={styles.validationError}>{emailError}</ThemedText>}

        <ThemedView style={styles.inputContainer}>
          <TextInput
            style={styles.inputWithIcon}
            placeholder="Password"
            placeholderTextColor={Colors.dark.secondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            editable={!isLoading}
          />
          <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword(!showPassword)} disabled={isLoading}>
            <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color={Colors.dark.secondary} />
          </TouchableOpacity>
        </ThemedView>

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
        {captchaError && (
          <ThemedView style={styles.errorContainer}>
            <Ionicons name="warning-outline" size={16} color={Colors.dark.error} />
            <ThemedText style={styles.captchaError}>{captchaError}</ThemedText>
          </ThemedView>
        )}

        {/* Display general error with helpful actions */}
        {error && (
          <ThemedView style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.dark.error} />
            <ThemedView style={styles.errorContent}>
              <ThemedText style={styles.error}>{error}</ThemedText>
              {/* Show helpful action for repeated login failures */}
              {loginAttempts >= 2 && error.includes("Incorrect email or password") && (
                <TouchableOpacity
                  style={styles.helpfulAction}
                  onPress={() => {
                    // Navigate to forgot password
                    router.push("/(auth)/forgot-password");
                  }}
                >
                  <ThemedText style={styles.helpfulActionText}>Reset your password →</ThemedText>
                </TouchableOpacity>
              )}
              {/* Show sign up action if account not found */}
              {error.includes("No account found") && (
                <TouchableOpacity
                  style={styles.helpfulAction}
                  onPress={() => {
                    // Navigate to sign up
                    router.push("/(auth)/sign-up");
                  }}
                >
                  <ThemedText style={styles.helpfulActionText}>Create a new account →</ThemedText>
                </TouchableOpacity>
              )}
            </ThemedView>
          </ThemedView>
        )}

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
    fontSize: 16,
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
  inputContainer: {
    position: "relative",
    marginBottom: 15,
  },
  inputWithIcon: {
    height: 50,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingRight: 50, // Make room for the eye icon
    backgroundColor: Colors.dark.card,
    color: Colors.dark.primary,
    fontSize: 16,
  },
  eyeIcon: {
    position: "absolute",
    right: 15,
    top: 15,
    padding: 5,
  },
  inputError: {
    borderColor: Colors.dark.error,
    borderWidth: 1,
  },
  validationError: {
    color: Colors.dark.error,
    fontSize: 12,
    marginTop: -10,
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
    padding: 8,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  errorContent: {
    flex: 1,
    marginLeft: 8,
  },
  helpfulAction: {
    marginTop: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: Colors.dark.error,
    borderRadius: 6,
    backgroundColor: Colors.dark.background,
  },
  helpfulActionText: {
    color: Colors.dark.error,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
});

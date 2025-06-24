import { useState, useRef } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image } from "react-native";
import { Link } from "expo-router";
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

export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { signUp, isCaptchaEnabled } = useAuth();
  const captchaRef = useRef<TurnstileCaptchaRef>(null);

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

  const validatePassword = (password: string): string | null => {
    if (!password) {
      return "Password is required";
    }
    if (password.length < 8) {
      return "Password must be at least 8 characters long";
    }
    return null;
  };

  const validateConfirmPassword = (password: string, confirmPassword: string): string | null => {
    if (!confirmPassword) {
      return "Please confirm your password";
    }
    if (password !== confirmPassword) {
      return "Passwords do not match";
    }
    return null;
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (emailError) {
      setEmailError(validateEmail(value));
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (passwordError) {
      setPasswordError(validatePassword(value));
    }
    // Also revalidate confirm password if it's been entered
    if (confirmPassword && confirmPasswordError) {
      setConfirmPasswordError(validateConfirmPassword(value, confirmPassword));
    }
  };

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    if (confirmPasswordError) {
      setConfirmPasswordError(validateConfirmPassword(password, value));
    }
  };

  const handleCaptchaVerify = (token: string) => {
    console.log("[SignUp] CAPTCHA verified successfully");
    setCaptchaToken(token);
    setCaptchaError(null);
  };

  const handleCaptchaError = (error: string) => {
    console.error("[SignUp] CAPTCHA error:", error);
    setCaptchaToken(null);
    setCaptchaError(error);
  };

  const handleCaptchaExpire = () => {
    console.log("[SignUp] CAPTCHA token expired");
    setCaptchaToken(null);
    setCaptchaError("CAPTCHA expired. Please verify again.");
  };

  const handleSignUp = async () => {
    try {
      setError(null);
      setCaptchaError(null);
      setIsLoading(true);

      // Validate all form inputs
      const emailValidationError = validateEmail(email);
      const passwordValidationError = validatePassword(password);
      const confirmPasswordValidationError = validateConfirmPassword(password, confirmPassword);

      setEmailError(emailValidationError);
      setPasswordError(passwordValidationError);
      setConfirmPasswordError(confirmPasswordValidationError);

      // If any validation errors exist, stop submission
      if (emailValidationError || passwordValidationError || confirmPasswordValidationError) {
        return;
      }

      // Validate CAPTCHA token only if CAPTCHA is enabled
      if (isCaptchaEnabled && !captchaToken) {
        setCaptchaError("Please complete the CAPTCHA verification");
        return;
      }

      console.log("[SignUp] Attempting sign up" + (isCaptchaEnabled ? " with CAPTCHA protection" : ""));
      await signUp(email, password, captchaToken || undefined);

      // Reset CAPTCHA after successful submission
      if (isCaptchaEnabled) {
        captchaRef.current?.reset();
        setCaptchaToken(null);
      }
    } catch (err) {
      console.error("[SignUp] Sign up error:", err);
      setError(err instanceof Error ? err.message : "An error occurred");

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
  const isFormValid =
    email.trim() && password && confirmPassword && !emailError && !passwordError && !confirmPasswordError;
  const isFormReady = isFormValid && (isCaptchaEnabled ? !!captchaToken : true);

  return (
    <ThemedScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Image source={require("@/assets/images/BLETblackgold.png")} style={styles.logo} />
      <ThemedView style={styles.header}>
        <ThemedText type="title">Create Account</ThemedText>
        <ThemedText type="subtitle">Sign up to get started</ThemedText>
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

        <ThemedView style={styles.passwordSection}>
          <ThemedView style={styles.inputContainer}>
            <TextInput
              style={[styles.inputWithIcon, passwordError && styles.inputError]}
              placeholder="Password"
              placeholderTextColor={Colors.dark.secondary}
              value={password}
              onChangeText={handlePasswordChange}
              onBlur={() => setPasswordError(validatePassword(password))}
              secureTextEntry={!showPassword}
              editable={!isLoading}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowPassword(!showPassword)}
              disabled={isLoading}
            >
              <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color={Colors.dark.secondary} />
            </TouchableOpacity>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.inputContainer}>
          <TextInput
            style={[styles.inputWithIcon, confirmPasswordError && styles.inputError]}
            placeholder="Confirm Password"
            placeholderTextColor={Colors.dark.secondary}
            value={confirmPassword}
            onChangeText={handleConfirmPasswordChange}
            onBlur={() => setConfirmPasswordError(validateConfirmPassword(password, confirmPassword))}
            secureTextEntry={!showConfirmPassword}
            editable={!isLoading}
          />
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            disabled={isLoading}
          >
            <Ionicons name={showConfirmPassword ? "eye-off" : "eye"} size={20} color={Colors.dark.secondary} />
          </TouchableOpacity>
        </ThemedView>
        <ThemedText style={styles.passwordRequirement}>Password must be at least 8 characters long</ThemedText>
        {passwordError && <ThemedText style={styles.validationError}>{passwordError}</ThemedText>}
        {confirmPasswordError && <ThemedText style={styles.validationError}>{confirmPasswordError}</ThemedText>}

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
          onPress={handleSignUp}
          disabled={isLoading || !isFormReady}
        >
          <ThemedText style={styles.buttonText}>{isLoading ? "Creating account..." : "Sign Up"}</ThemedText>
        </TouchableOpacity>

        <ThemedView style={styles.links}>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity>
              <ThemedText style={styles.link}>Already have an account? Sign In</ThemedText>
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
  passwordSection: {
    marginBottom: 5,
  },
  passwordRequirement: {
    color: Colors.dark.warning,
    fontSize: 12,
    marginTop: -10,
    marginBottom: 15,
    paddingHorizontal: 5,
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
});

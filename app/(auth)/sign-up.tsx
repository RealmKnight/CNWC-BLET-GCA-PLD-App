import { useState } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";

export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { signUp } = useAuth();

  const handleSignUp = async () => {
    try {
      setError(null);
      setIsLoading(true);
      if (password !== confirmPassword) {
        throw new Error("Passwords do not match");
      }
      await signUp(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Image source={require("@/assets/images/BLETblackgold.png")} style={styles.logo} />
      <ThemedView style={styles.header}>
        <ThemedText type="title">Create Account</ThemedText>
        <ThemedText type="subtitle">Sign up to get started</ThemedText>
      </ThemedView>

      <ThemedView style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#666666"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!isLoading}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#666666"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!isLoading}
        />

        <TextInput
          style={styles.input}
          placeholder="Confirm Password"
          placeholderTextColor="#666666"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          editable={!isLoading}
        />

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={isLoading}
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
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
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
  },
  button: {
    backgroundColor: "#FFF700FF",
    height: 50,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#000000FF",
    fontSize: 16,
    fontWeight: "600",
  },
  links: {
    marginTop: 20,
    alignItems: "center",
  },
  link: {
    color: "#88FF00FF",
    marginVertical: 5,
  },
  error: {
    color: "#ff3b30",
    textAlign: "center",
    marginBottom: 10,
  },
  logo: {
    width: 130,
    height: 163,
    alignSelf: "center",
    marginBottom: 20,
  },
});

import { useState } from "react";
import { StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSignIn = async () => {
    try {
      setError(null);
      setIsLoading(true);
      await signIn(email, password);
    } catch (error) {
      setError(error instanceof Error ? error.message : "An error occurred during sign in");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Welcome Back</ThemedText>
        <ThemedText type="subtitle">Sign in to continue</ThemedText>
      </ThemedView>

      <ThemedView style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!isLoading}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!isLoading}
        />

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={isLoading}
        >
          <ThemedText style={styles.buttonText}>{isLoading ? "Signing in..." : "Sign In"}</ThemedText>
        </TouchableOpacity>

        <ThemedView style={styles.links}>
          <Link href="/(auth)/sign-up" asChild>
            <TouchableOpacity>
              <ThemedText style={styles.link}>Don't have an account? Sign Up</ThemedText>
            </TouchableOpacity>
          </Link>

          <Link href="/(auth)/reset-password" asChild>
            <TouchableOpacity>
              <ThemedText style={styles.link}>Forgot Password?</ThemedText>
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
    backgroundColor: "#007AFF",
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
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  links: {
    marginTop: 20,
    alignItems: "center",
  },
  link: {
    color: "#007AFF",
    marginVertical: 5,
  },
  error: {
    color: "#ff3b30",
    textAlign: "center",
    marginBottom: 10,
  },
});

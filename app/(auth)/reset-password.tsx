import { useState } from "react";
import { StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";

export default function ResetPasswordScreen() {
  const [email, setEmail] = useState("");
  const { resetPassword } = useAuth();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleResetPassword = async () => {
    try {
      await resetPassword(email);
      setIsSubmitted(true);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Reset Password</ThemedText>
        <ThemedText type="subtitle">
          {isSubmitted ? "Check your email for reset instructions" : "Enter your email to reset your password"}
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.form}>
        {!isSubmitted && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <TouchableOpacity style={styles.button} onPress={handleResetPassword}>
              <ThemedText style={styles.buttonText}>Reset Password</ThemedText>
            </TouchableOpacity>
          </>
        )}

        <ThemedView style={styles.links}>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity>
              <ThemedText style={styles.link}>Back to Sign In</ThemedText>
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
});

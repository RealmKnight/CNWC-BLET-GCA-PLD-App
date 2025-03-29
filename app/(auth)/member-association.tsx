import { useState } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image } from "react-native";
import { useAuth } from "@/hooks/useAuth";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";

export default function MemberAssociationScreen() {
  const [pinNumber, setPinNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { associateMember } = useAuth();

  const handleAssociate = async () => {
    try {
      setError(null);
      setIsLoading(true);
      await associateMember(pinNumber);
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
        <ThemedText type="title">Associate Member</ThemedText>
        <ThemedText type="subtitle">
          Please enter your member PIN number to associate your account with your member profile
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="PIN Number"
          placeholderTextColor="#666666"
          value={pinNumber}
          onChangeText={setPinNumber}
          keyboardType="numeric"
          maxLength={6}
          editable={!isLoading}
        />

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleAssociate}
          disabled={isLoading}
        >
          <ThemedText style={styles.buttonText}>{isLoading ? "Associating..." : "Associate Member"}</ThemedText>
        </TouchableOpacity>
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

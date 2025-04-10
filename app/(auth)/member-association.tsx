import { useState } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image } from "react-native";
import { useAuth } from "@/hooks/useAuth";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { AdminMessageModal } from "@/components/AdminMessageModal";
import Toast from "react-native-toast-message";

export default function MemberAssociationScreen() {
  const [pinNumber, setPinNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const { associateMemberWithPin, user } = useAuth();

  const handleAssociate = async () => {
    try {
      setError(null);
      setIsLoading(true);
      await associateMemberWithPin(pinNumber);
      Toast.show({
        type: "success",
        text1: "Success",
        text2: "Successfully associated with member record",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);

      // Show admin modal for specific error cases
      if (
        [
          "Member is not active",
          "Member is already associated with another user",
          "No member found with that PIN",
        ].includes(errorMessage)
      ) {
        setShowAdminModal(true);
      }
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

      <AdminMessageModal
        visible={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        pinNumber={pinNumber}
        userEmail={user?.email || ""}
      />
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
    borderColor: Colors.dark.border,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    backgroundColor: Colors.dark.card,
    color: Colors.dark.text,
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
  error: {
    color: Colors.dark.error,
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

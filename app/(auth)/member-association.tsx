import { useState, useEffect } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image } from "react-native";
import { useAuth } from "@/hooks/useAuth";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { AdminMessageModal } from "@/components/AdminMessageModal";
import Toast from "react-native-toast-message";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function MemberAssociationScreen() {
  const [pinNumber, setPinNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [associationSuccess, setAssociationSuccess] = useState(false);
  const { associateMemberWithPin, user, member } = useAuth();

  // Monitor member data and redirect when it's available after successful association
  useEffect(() => {
    // Only redirect if we've had a successful association and member data is present
    if (associationSuccess && member) {
      console.log("[MemberAssociation] Member data loaded after association, redirecting to tabs:", {
        memberId: member.id,
        role: member.role,
      });

      // Short delay to allow Toast to be visible
      const redirectTimer = setTimeout(() => {
        router.replace("/(tabs)");
      }, 1500);

      return () => clearTimeout(redirectTimer);
    }
  }, [associationSuccess, member]);

  const handleAssociate = async () => {
    try {
      setError(null);
      setIsLoading(true);
      await associateMemberWithPin(pinNumber);

      setAssociationSuccess(true);
      Toast.show({
        type: "success",
        text1: "Success",
        text2: "Successfully associated with member record. Redirecting...",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
      setAssociationSuccess(false);

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

  const goToSignIn = () => {
    router.replace("/(auth)/sign-in");
  };

  return (
    <ThemedView style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={goToSignIn}>
        <Ionicons name="arrow-back" size={24} color={Colors.dark.icon} />
        <ThemedText style={styles.backButtonText}>Back to Sign In</ThemedText>
      </TouchableOpacity>

      <Image source={require("@/assets/images/BLETblackgold.png")} style={styles.logo} />
      <ThemedView style={styles.header}>
        <ThemedText type="title">Associate Member</ThemedText>
        <ThemedText type="subtitle">
          Please enter your member PIN number to associate your account with your member profile
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.infoBox}>
        <ThemedText style={styles.infoText}>
          Don't have a PIN number? Contact your Division Administrative Secretary or Division Secretary Treasurer to
          obtain your PIN.
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
          editable={!isLoading && !associationSuccess}
        />

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <TouchableOpacity
          style={[styles.button, (isLoading || associationSuccess) && styles.buttonDisabled]}
          onPress={handleAssociate}
          disabled={isLoading || associationSuccess}
        >
          <ThemedText style={styles.buttonText}>
            {isLoading ? "Associating..." : associationSuccess ? "Association Successful!" : "Associate Member"}
          </ThemedText>
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
  backButton: {
    position: "absolute",
    top: 40,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  backButtonText: {
    marginLeft: 5,
    fontSize: 16,
    color: Colors.dark.icon,
  },
  header: {
    marginBottom: 20,
    alignItems: "center",
  },
  infoBox: {
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  infoText: {
    fontSize: 14,
    textAlign: "center",
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

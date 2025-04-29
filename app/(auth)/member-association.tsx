import { useState, useEffect } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image, View } from "react-native";
import { useAuth } from "@/hooks/useAuth";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { AdminMessageModal } from "@/components/AdminMessageModal";
import Toast from "react-native-toast-message";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Modal } from "@/components/ui/Modal";
import { supabase } from "@/utils/supabase";
import { ContactAdminModal } from "@/components/modals/ContactAdminModal";

// Type for member data
interface MemberData {
  first_name: string;
  last_name: string;
  pin_number: number;
}

export default function MemberAssociationScreen() {
  const [pinNumber, setPinNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showContactAdminModal, setShowContactAdminModal] = useState(false);
  const [associationSuccess, setAssociationSuccess] = useState(false);
  const [memberData, setMemberData] = useState<MemberData | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const { associateMemberWithPin, user, member, signOut } = useAuth();

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

  const handleFetchMember = async () => {
    try {
      setError(null);
      setIsLoading(true);

      // Convert pin to bigint by removing any non-numeric characters and parsing
      const numericPin = parseInt(pinNumber.replace(/\D/g, ""), 10);
      if (isNaN(numericPin)) throw new Error("Invalid PIN format");

      // First verify the PIN exists and isn't already associated
      const { data: memberRecord, error: checkError } = await supabase
        .from("members")
        .select("first_name, last_name, pin_number, id")
        .eq("pin_number", numericPin)
        .maybeSingle();

      if (checkError) throw checkError;
      if (!memberRecord) throw new Error("No member found with that PIN");

      // If member already has an ID and it's not this user's ID, it's taken
      if (memberRecord.id && memberRecord.id !== user?.id) {
        throw new Error("Member is already associated with another user");
      }

      // Store member data and show confirmation modal
      setMemberData(memberRecord);
      setShowConfirmModal(true);
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
    } finally {
      setIsLoading(false);
      setShowConfirmModal(false);
    }
  };

  const goToSignIn = async () => {
    try {
      await signOut(); // Sign out the user
      // No need to manually navigate - the auth status change will trigger navigation in _layout.tsx
    } catch (error) {
      console.error("Error signing out:", error);
      // If sign out fails, try to redirect anyway
      router.replace("/(auth)/sign-in");
    }
  };

  const openContactAdminModal = () => {
    setShowContactAdminModal(true);
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
          Please enter your CN Employee PIN number to associate your user account with your union profile
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.infoBox}>
        <TouchableOpacity onPress={openContactAdminModal}>
          <ThemedText style={[styles.infoText, styles.linkText]}>
            Having troubles? Contact your Division Admin (or Local Chairman).
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <ThemedView style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="PIN Number"
          placeholderTextColor={Colors.dark.secondary}
          value={pinNumber}
          onChangeText={setPinNumber}
          keyboardType="numeric"
          maxLength={6}
          editable={!isLoading && !associationSuccess}
        />

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <TouchableOpacity
          style={[styles.button, (isLoading || associationSuccess) && styles.buttonDisabled]}
          onPress={handleFetchMember}
          disabled={isLoading || associationSuccess}
        >
          <ThemedText style={styles.buttonText}>
            {isLoading ? "Checking..." : associationSuccess ? "Association Successful!" : "Associate Member"}
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>

      {/* Member Confirmation Modal */}
      <Modal visible={showConfirmModal} onClose={() => setShowConfirmModal(false)} title="Confirm Member Association">
        <ThemedView style={styles.confirmContent}>
          <ThemedText style={styles.confirmText}>
            This is the member record of the PIN you entered, please confirm that this is yours:
          </ThemedText>

          {memberData && (
            <ThemedView style={styles.memberDetails}>
              <ThemedView style={styles.detailRow}>
                <ThemedText style={styles.detailLabel}>First Name:</ThemedText>
                <ThemedText style={styles.detailValue}>{memberData.first_name}</ThemedText>
              </ThemedView>

              <ThemedView style={styles.detailRow}>
                <ThemedText style={styles.detailLabel}>Last Name:</ThemedText>
                <ThemedText style={styles.detailValue}>{memberData.last_name}</ThemedText>
              </ThemedView>

              <ThemedView style={styles.detailRow}>
                <ThemedText style={styles.detailLabel}>PIN:</ThemedText>
                <ThemedText style={styles.detailValue}>{memberData.pin_number}</ThemedText>
              </ThemedView>
            </ThemedView>
          )}

          <View style={styles.centeredButtonContainer}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={() => {
                setShowConfirmModal(false);
                setMemberData(null);
              }}
            >
              <ThemedText style={styles.buttonTextWhite}>Oops, try again</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={handleAssociate}>
              <ThemedText style={styles.buttonTextWhite}>Yes, It's me!</ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>
      </Modal>

      {/* Admin Message Modal for PIN problems */}
      <AdminMessageModal
        visible={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        pinNumber={pinNumber}
        userEmail={user?.email || ""}
      />

      {/* Contact Admin Modal for general assistance */}
      <ContactAdminModal visible={showContactAdminModal} onClose={() => setShowContactAdminModal(false)} />
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
  linkText: {
    color: Colors.dark.tint,
    textDecorationLine: "underline",
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
  // Confirmation modal styles
  confirmContent: {
    paddingVertical: 10,
  },
  confirmText: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: "center",
  },
  memberDetails: {
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    padding: 15,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 10,
  },
  detailLabel: {
    fontWeight: "bold",
    width: 100,
  },
  detailValue: {
    flex: 1,
  },
  centeredButtonContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 130,
    alignItems: "center",
  },
  confirmButton: {
    backgroundColor: Colors.dark.success,
  },
  cancelButton: {
    backgroundColor: Colors.dark.error,
  },
  buttonTextWhite: {
    color: "#000000",
    fontWeight: "600",
  },
});

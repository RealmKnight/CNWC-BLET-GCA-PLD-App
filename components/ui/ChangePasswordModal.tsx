import React, { useState } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image, Platform, Alert } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { router } from "expo-router";

interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
  signOutOnSuccess?: boolean;
  showBackButton?: boolean;
}

export function ChangePasswordModal({
  visible,
  onClose,
  signOutOnSuccess = false,
  showBackButton = true,
}: ChangePasswordModalProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const theme = (useColorScheme() ?? "light") as keyof typeof Colors;

  const handleChangePassword = async () => {
    let signedOut = false;
    try {
      // Basic form validation
      if (!password) {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Please enter a new password",
        });
        return;
      }

      if (password.length < 6) {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Password must be at least 6 characters long",
        });
        return;
      }

      if (password !== confirmPassword) {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Passwords do not match",
        });
        return;
      }

      setLoading(true);

      // Update the user's password with Supabase
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        console.error("Password update error:", updateError.message);
        Toast.show({
          type: "error",
          text1: "Error Updating Password",
          text2: updateError.message,
        });
      } else {
        const successMessage = signOutOnSuccess
          ? "Password changed successfully. Signing out..."
          : "Password changed successfully.";

        console.log(`[ChangePasswordModal] Password updated successfully. SignOutOnSuccess: ${signOutOnSuccess}`);
        Toast.show({
          type: "success",
          text1: "Password Updated",
          text2: successMessage,
          visibilityTime: 2000,
        });

        setPassword("");
        setConfirmPassword("");

        if (signOutOnSuccess) {
          console.log("[ChangePasswordModal] Signing out as requested.");
          try {
            await supabase.auth.signOut();
            signedOut = true;
            console.log("[ChangePasswordModal] Sign out successful.");
          } catch (signOutError) {
            console.error("[ChangePasswordModal] Error signing out:", signOutError);
          }
        }

        onClose();

        if (signOutOnSuccess) {
          console.log("[ChangePasswordModal] Navigating to sign-in page.");
          router.replace("/(auth)/sign-in");
        }
      }
    } catch (error) {
      console.error("[ChangePasswordModal] Unexpected error during password change:", error);
      Toast.show({ type: "error", text1: "Error", text2: "An unexpected error occurred." });
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <ThemedView style={styles.modalOverlay}>
      <ThemedView style={styles.modalContent}>
        <ThemedView style={styles.modalHeader}>
          {showBackButton ? (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="arrow-back" size={24} color={Colors[theme].text} />
            </TouchableOpacity>
          ) : (
            <ThemedView style={styles.placeholder} />
          )}
          <ThemedText type="title">Change Password</ThemedText>
          <ThemedView style={styles.placeholder} />
        </ThemedView>

        <Image source={require("@/assets/images/BLETblackgold.png")} style={styles.logo} resizeMode="contain" />

        <ThemedView style={styles.form}>
          <TextInput
            style={[styles.input, { color: Colors[theme].text, backgroundColor: Colors[theme].background }]}
            placeholder="New Password"
            placeholderTextColor={Colors[theme].textDim}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />
          <TextInput
            style={[styles.input, { color: Colors[theme].text, backgroundColor: Colors[theme].background }]}
            placeholder="Confirm New Password"
            placeholderTextColor={Colors[theme].textDim}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            editable={!loading}
          />

          <TouchableOpacity
            style={[
              styles.button,
              loading && styles.buttonDisabled,
              { backgroundColor: Colors[theme].buttonBackground },
            ]}
            onPress={handleChangePassword}
            disabled={loading}
          >
            <ThemedText style={styles.buttonText}>{loading ? "Updating..." : "Update Password"}</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    width: Platform.OS === "web" ? 400 : "90%",
    backgroundColor: Colors.dark.card,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1001,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    backgroundColor: Colors.dark.card,
  },
  closeButton: {
    padding: 8,
  },
  placeholder: {
    width: 40,
  },
  logo: {
    width: 80,
    height: 100,
    alignSelf: "center",
    marginBottom: 20,
  },
  form: {
    width: "100%",
    gap: 15,
    backgroundColor: Colors.dark.card,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    paddingHorizontal: 15,
  },
  button: {
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
});

import React, { useState, useEffect } from "react";
import { StyleSheet, ScrollView, Alert, Modal, Platform } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/utils/supabase";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Database } from "@/types/supabase";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

type Member = Database["public"]["Tables"]["members"]["Row"];
type ContactPreference = "phone" | "text" | "email" | "push";
type ColorScheme = keyof typeof Colors;

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === "web") {
    return null;
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      Alert.alert("Failed to get push token for push notification!");
      return null;
    }

    token = (await Notifications.getExpoPushTokenAsync()).data;
  } else {
    Alert.alert("Must use physical device for Push Notifications");
  }

  return token;
}

function PhoneUpdateModal({
  visible,
  onClose,
  onSuccess,
  currentPhone,
  targetUserId,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: (phone: string) => void;
  currentPhone: string;
  targetUserId: string;
}) {
  const [phoneNumber, setPhoneNumber] = useState(currentPhone);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const { session, member } = useAuth();

  const handleUpdatePhone = async () => {
    try {
      setError(null);
      setIsLoading(true);

      if (!session) {
        throw new Error("No active session. Please try logging out and back in.");
      }

      // Only admins can update member data
      const isAdmin = member?.role?.includes("admin");
      if (!isAdmin) {
        throw new Error("Only administrators can update member information.");
      }

      const { error: updateError } = await supabase
        .from("members")
        .update({ phone_number: phoneNumber })
        .eq("id", targetUserId);

      if (updateError) throw updateError;

      onSuccess(phoneNumber);
      onClose();
    } catch (error: any) {
      console.error("Error updating phone:", error);
      setError(error.message || "Failed to update phone number");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <ThemedView style={styles.modalOverlay}>
        <ThemedView style={styles.modalContent}>
          <ThemedView style={styles.modalHeader}>
            <ThemedText type="title">Update Phone Number</ThemedText>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors[theme].text} />
            </TouchableOpacity>
          </ThemedView>

          {error && (
            <ThemedView style={styles.errorContainer}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </ThemedView>
          )}

          <ThemedView style={styles.inputContainer}>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="Enter phone number"
              style={styles.modalInput}
              disabled={isLoading}
            />
          </ThemedView>
          <TouchableOpacity
            onPress={handleUpdatePhone}
            style={[styles.modalButton, isLoading && styles.buttonDisabled]}
            disabled={isLoading}
          >
            <ThemedText style={styles.buttonText}>{isLoading ? "Updating..." : "Update Phone Number"}</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>
    </Modal>
  );
}

export default function ProfileScreen() {
  const { profileID } = useLocalSearchParams();
  const { user, member, session } = useAuth();
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const [contactPreference, setContactPreference] = useState<ContactPreference>(
    (user?.user_metadata.contact_preference as ContactPreference) || "phone"
  );
  const [phoneNumber, setPhoneNumber] = useState(member?.phone_number || "");
  const [isPhoneModalVisible, setIsPhoneModalVisible] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [isDeviceMobile] = useState(Platform.OS !== "web");

  const isAdmin = member?.role?.includes("admin");
  const isOwnProfile = user?.id === profileID;
  // Only admins can edit member data
  const canEdit = isAdmin;

  const handleUpdatePreference = async (preference: ContactPreference) => {
    try {
      if (!session) throw new Error("No active session");

      if (preference === "push") {
        if (!isDeviceMobile) {
          Alert.alert("Error", "Push notifications are only available on mobile devices");
          return;
        }

        const token = await registerForPushNotificationsAsync();
        if (!token) {
          Alert.alert("Error", "Failed to setup push notifications. Please check your device settings.");
          return;
        }
        setPushToken(token);
      }

      // Set local state immediately for better UX
      setContactPreference(preference);

      const { data, error } = await supabase.auth.updateUser({
        data: {
          contact_preference: preference,
          push_token: preference === "push" ? pushToken : null,
        },
      });

      if (error) {
        // Revert on error
        setContactPreference((user?.user_metadata.contact_preference as ContactPreference) || "phone");
        throw error;
      }

      // Update local user state to prevent unnecessary reloads
      if (data.user && user) {
        user.user_metadata = data.user.user_metadata;
      }
    } catch (error) {
      console.error("Error updating preference:", error);
      Alert.alert("Error", "Failed to update contact preference. Please try again.");
    }
  };

  // Add this useEffect to handle initial push token setup
  useEffect(() => {
    if (isDeviceMobile && contactPreference === "push") {
      registerForPushNotificationsAsync().then((token) => {
        if (token) {
          setPushToken(token);
          // Update the token in Supabase if needed
          if (session && (!user?.user_metadata.push_token || user.user_metadata.push_token !== token)) {
            supabase.auth.updateUser({
              data: {
                push_token: token,
              },
            });
          }
        }
      });
    }
  }, [isDeviceMobile, contactPreference]);

  const handlePhoneUpdateSuccess = (newPhone: string) => {
    setPhoneNumber(newPhone);
    Alert.alert("Success", "Phone number updated successfully!");
  };

  const handleUpdatePassword = async () => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user?.email || "");
      if (error) throw error;
      Alert.alert("Success", "Password reset email sent!");
    } catch (error) {
      console.error("Error sending reset password email:", error);
      Alert.alert("Error", "Failed to send reset password email. Please try again.");
    }
  };

  if (!member || !user) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading profile...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <PhoneUpdateModal
        visible={isPhoneModalVisible}
        onClose={() => setIsPhoneModalVisible(false)}
        onSuccess={handlePhoneUpdateSuccess}
        currentPhone={phoneNumber}
        targetUserId={profileID as string}
      />

      <ThemedView style={styles.section}>
        <ThemedText type="title">Personal Information</ThemedText>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Name:</ThemedText>
          <ThemedText>{`${member.first_name} ${member.last_name}`}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Email:</ThemedText>
          <ThemedText>{user.email}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Phone:</ThemedText>
          <ThemedView style={styles.editRow}>
            <ThemedText>{phoneNumber || "Not set"}</ThemedText>
            {canEdit && (
              <TouchableOpacity onPress={() => setIsPhoneModalVisible(true)} style={styles.iconButton}>
                <Ionicons name="pencil" size={24} color={Colors[theme].tint} />
              </TouchableOpacity>
            )}
          </ThemedView>
        </ThemedView>
      </ThemedView>

      {isOwnProfile && (
        <>
          <ThemedView style={styles.section}>
            <ThemedText type="title">Contact Preferences</ThemedText>
            <ThemedView style={styles.preferenceContainer}>
              <ThemedView style={styles.preferenceButtons}>
                {/* to activate if we decide to use phone calls 
                <TouchableOpacity
                  style={[styles.preferenceButton, contactPreference === "phone" && styles.preferenceButtonActive]}
                  onPress={() => handleUpdatePreference("phone")}
                >
                  <ThemedText
                    style={[
                      styles.preferenceButtonText,
                      contactPreference === "phone" && styles.preferenceButtonTextActive,
                    ]}
                  >
                    Phone Call
                  </ThemedText>
                </TouchableOpacity> 
                */}
                <TouchableOpacity
                  style={[styles.preferenceButton, contactPreference === "text" && styles.preferenceButtonActive]}
                  onPress={() => handleUpdatePreference("text")}
                >
                  <ThemedText
                    style={[
                      styles.preferenceButtonText,
                      contactPreference === "text" && styles.preferenceButtonTextActive,
                    ]}
                  >
                    Text Message
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.preferenceButton, contactPreference === "email" && styles.preferenceButtonActive]}
                  onPress={() => handleUpdatePreference("email")}
                >
                  <ThemedText
                    style={[
                      styles.preferenceButtonText,
                      contactPreference === "email" && styles.preferenceButtonTextActive,
                    ]}
                  >
                    Email
                  </ThemedText>
                </TouchableOpacity>
              </ThemedView>
              {isDeviceMobile && (
                <ThemedView style={styles.pushNotificationContainer}>
                  <TouchableOpacity
                    style={[
                      styles.preferenceButton,
                      styles.pushNotificationButton,
                      contactPreference === "push" && styles.preferenceButtonActive,
                    ]}
                    onPress={() => handleUpdatePreference("push")}
                  >
                    <ThemedText
                      style={[
                        styles.preferenceButtonText,
                        contactPreference === "push" && styles.preferenceButtonTextActive,
                      ]}
                    >
                      Push Notifications
                    </ThemedText>
                  </TouchableOpacity>
                </ThemedView>
              )}
            </ThemedView>
          </ThemedView>

          <ThemedView style={styles.section}>
            <ThemedText type="title">Account Settings</ThemedText>
            <ThemedText type="subtitle">Send an email with a reset link to change your password</ThemedText>
            <TouchableOpacity onPress={handleUpdatePassword} style={styles.settingButton}>
              <ThemedText style={styles.settingButtonText}>Change Password</ThemedText>
            </TouchableOpacity>
          </ThemedView>

          <ThemedView style={styles.section}>
            <ThemedText type="title">Union Information</ThemedText>
            <ThemedView style={styles.infoRow}>
              <ThemedText type="subtitle">PIN:</ThemedText>
              <ThemedText>{member.pin_number}</ThemedText>
            </ThemedView>
            <ThemedView style={styles.infoRow}>
              <ThemedText type="subtitle">Division:</ThemedText>
              <ThemedText>{member.division}</ThemedText>
            </ThemedView>
            <ThemedView style={styles.infoRow}>
              <ThemedText type="subtitle">Zone:</ThemedText>
              <ThemedText>{member.zone}</ThemedText>
            </ThemedView>
            <ThemedView style={styles.infoRow}>
              <ThemedText type="subtitle">Engineer Date:</ThemedText>
              <ThemedText>{member.engineer_date}</ThemedText>
            </ThemedView>
            <ThemedView style={styles.infoRow}>
              <ThemedText type="subtitle">Company Hire Date:</ThemedText>
              <ThemedText>{member.company_hire_date}</ThemedText>
            </ThemedView>
          </ThemedView>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
    padding: 16,
    gap: 16,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    padding: 8,
  },
  preferenceContainer: {
    gap: 12,
  },
  preferenceButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pushNotificationContainer: {
    width: "100%",
  },
  pushNotificationButton: {
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  preferenceButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.buttonBorder,
  },
  preferenceButtonActive: {
    backgroundColor: Colors.dark.buttonBackground,
  },
  preferenceButtonText: {
    color: Colors.dark.buttonTextSecondary,
  },
  preferenceButtonTextActive: {
    color: Colors.dark.buttonText,
  },
  settingButton: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.dark.buttonBackgroundSecondary,
    borderColor: Colors.dark.buttonBorderSecondary,
    borderWidth: 1,
  },
  settingButtonText: {
    color: Colors.dark.buttonTextSecondary,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)" as any,
  },
  modalContent: {
    width: Platform.OS === "web" ? "400px" : "90%",
    padding: 20,
    borderRadius: 12,
    gap: 16,
  } as any,
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  } as any,
  closeButton: {
    padding: 8,
  } as any,
  inputContainer: {
    marginBottom: 16,
    alignItems: "center",
  } as any,
  modalInput: {
    borderWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.2)",
    borderRadius: 8,
    padding: 12,
    width: "90%",
  } as any,
  modalButton: {
    backgroundColor: Colors.dark.buttonBackground,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  } as any,
  secondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.light.tint,
  } as any,
  buttonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  } as any,
  errorContainer: {
    backgroundColor: "rgba(255, 0, 0, 0.1)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  } as any,
  errorText: {
    color: "red",
  } as any,
  buttonDisabled: {
    opacity: 0.5,
  } as any,
});

import React, { useState, useEffect } from "react";
import { StyleSheet, ScrollView, Alert, Modal, Platform, TextInput } from "react-native";
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
import { testEmailFunction } from "@/utils/notificationService";
import Constants from "expo-constants";

type Member = Database["public"]["Tables"]["members"]["Row"];
type ContactPreference = "phone" | "text" | "email" | "push";
type ColorScheme = keyof typeof Colors;

interface UserPreferences {
  id: string;
  user_id: string;
  pin_number: number;
  push_token: string | null;
  contact_preference: ContactPreference;
  created_at: string;
  updated_at: string;
}

async function registerForPushNotificationsAsync() {
  let token;
  let errorMessage = "";

  try {
    if (Platform.OS === "web") {
      console.log("Push notifications are not supported on web platform");
      return null;
    }

    if (!Device.isDevice) {
      console.log("Push notifications require a physical device");
      return null;
    }

    // Check if we have permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log("Existing notification permission status:", existingStatus);

    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      console.log("Requesting notification permission...");
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log("New notification permission status:", finalStatus);
    }

    if (finalStatus !== "granted") {
      errorMessage = "Permission not granted for push notifications";
      throw new Error(errorMessage);
    }

    console.log("Getting Expo push token...");
    const response = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    });
    token = response.data;
    console.log("Successfully obtained push token:", token);

    // On Android, we need to set the notification channel
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }

    return token;
  } catch (error) {
    console.error("Error setting up push notifications:", error);
    Alert.alert(
      "Push Notification Setup Error",
      errorMessage || "Failed to set up push notifications. Please check your device settings and try again."
    );
    return null;
  }
}

// Utility functions for phone number formatting
function formatPhoneNumber(value: string): string {
  // Strip all non-numeric characters
  const cleaned = value.replace(/\D/g, "");

  // Format as (XXX) XXX-XXXX
  const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
  if (!match) return "";

  const parts = [match[1], match[2], match[3]].filter(Boolean);

  if (parts.length === 0) return "";
  if (parts.length === 1) return `(${parts[0]}`;
  if (parts.length === 2) return `(${parts[0]}) ${parts[1]}`;
  return `(${parts[0]}) ${parts[1]}-${parts[2]}`;
}

function unformatPhoneNumber(value: string): string {
  return value.replace(/\D/g, "");
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
  const { session } = useAuth();

  const handlePhoneChange = (value: string) => {
    // Only allow numbers, max 10 digits
    const cleaned = value.replace(/\D/g, "").slice(0, 10);
    setPhoneNumber(cleaned);
  };

  const handleUpdatePhone = async () => {
    try {
      setError(null);
      setIsLoading(true);

      if (!session) {
        throw new Error("No active session. Please try logging out and back in.");
      }

      if (phoneNumber.length !== 10) {
        throw new Error("Please enter a valid 10-digit phone number.");
      }

      // Users can only update their own phone number
      if (session.user.id !== targetUserId) {
        throw new Error("You can only update your own phone number.");
      }

      // Format phone number for Supabase (E.164 format)
      const formattedPhone = `+1${phoneNumber}`; // Assuming US numbers for now

      // Update phone in auth.users
      const { error: updateError } = await supabase.auth.updateUser({
        phone: formattedPhone,
      });

      if (updateError) {
        // Special handling for SMS provider not configured
        if (updateError.message.includes("SMS provider")) {
          console.warn("SMS provider not configured:", updateError);
          // For now, we'll allow the update but warn about verification
          Alert.alert(
            "Notice",
            "Phone number updated, but verification is not available yet. SMS notifications will be enabled once the system is fully configured."
          );
          onSuccess(phoneNumber);
          onClose();
          return;
        }
        throw updateError;
      }

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
            <TextInput
              value={formatPhoneNumber(phoneNumber)}
              onChangeText={handlePhoneChange}
              placeholder="(555) 555-1234"
              placeholderTextColor={Colors[theme].textDim}
              style={[
                styles.modalInput,
                {
                  color: Colors[theme].text,
                  backgroundColor: Colors[theme].background,
                },
              ]}
              editable={!isLoading}
              keyboardType="phone-pad"
            />
          </ThemedView>
          <TouchableOpacity
            onPress={handleUpdatePhone}
            style={[
              styles.modalButton,
              isLoading && styles.buttonDisabled,
              { backgroundColor: Colors[theme].buttonBackground },
            ]}
            disabled={isLoading || phoneNumber.length !== 10}
          >
            <ThemedText style={styles.buttonText}>{isLoading ? "Updating..." : "Update Phone Number"}</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>
    </Modal>
  );
}

export default function ProfileScreen() {
  const params = useLocalSearchParams();
  const profileID = Array.isArray(params.profileID) ? params.profileID[0] : params.profileID;
  const { user, member, session } = useAuth();
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isPhoneModalVisible, setIsPhoneModalVisible] = useState(false);
  const [isDeviceMobile] = useState(Platform.OS !== "web");

  const isOwnProfile = user?.id === profileID;
  // Users can only edit their own phone number
  const canEdit = isOwnProfile;

  // Fetch user data including phone number from metadata
  useEffect(() => {
    if (user && isOwnProfile) {
      setPhoneNumber(user.phone || "");
    }
  }, [user, isOwnProfile]);

  // Add debug effect for session changes
  useEffect(() => {
    if (session) {
      console.log("Session user metadata:", session.user.user_metadata);
    }
  }, [session]);

  // Fetch user preferences
  useEffect(() => {
    if (member?.pin_number) {
      supabase
        .from("user_preferences")
        .select("*")
        .eq("pin_number", member.pin_number)
        .single()
        .then(({ data, error }) => {
          if (error) {
            if (error.code === "PGRST116") {
              // No preferences found, create default preferences
              createDefaultPreferences();
            } else {
              console.error("Error fetching preferences:", error);
            }
          } else {
            setUserPreferences(data as UserPreferences);
          }
        });
    }
  }, [member?.pin_number]);

  const createDefaultPreferences = async () => {
    if (!member?.pin_number || !user?.id) return;

    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .insert({
          user_id: user.id,
          pin_number: member.pin_number,
          contact_preference: "email",
          push_token: null,
        })
        .select()
        .single();

      if (error) throw error;
      setUserPreferences(data as UserPreferences);
    } catch (error) {
      console.error("Error creating default preferences:", error);
      Alert.alert("Error", "Failed to set up contact preferences");
    }
  };

  const handleUpdatePreference = async (preference: ContactPreference) => {
    try {
      if (!session || !member?.pin_number) throw new Error("No active session");

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

        // Update preferences with new token and preference
        const { error } = await supabase
          .from("user_preferences")
          .upsert({
            user_id: user?.id,
            pin_number: member.pin_number,
            push_token: token,
            contact_preference: preference,
          })
          .select()
          .single();

        if (error) throw error;
      } else {
        // Update preference without token
        const { error } = await supabase
          .from("user_preferences")
          .upsert({
            user_id: user?.id,
            pin_number: member.pin_number,
            push_token: null,
            contact_preference: preference,
          })
          .select()
          .single();

        if (error) throw error;
      }

      // Refresh preferences
      const { data: updatedPrefs, error: fetchError } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("pin_number", member.pin_number)
        .single();

      if (fetchError) throw fetchError;
      setUserPreferences(updatedPrefs as UserPreferences);
    } catch (error) {
      console.error("Error updating preference:", error);
      Alert.alert("Error", "Failed to update contact preference. Please try again.");
    }
  };

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
          <ThemedText>{`${member?.first_name} ${member?.last_name}`}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Email:</ThemedText>
          <ThemedText>{user?.email}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Phone:</ThemedText>
          <ThemedView style={styles.editRow}>
            <ThemedText>{phoneNumber ? formatPhoneNumber(phoneNumber) : "Not set"}</ThemedText>
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
                <TouchableOpacity
                  style={[
                    styles.preferenceButton,
                    userPreferences?.contact_preference === "text" && styles.preferenceButtonActive,
                  ]}
                  onPress={() => handleUpdatePreference("text")}
                >
                  <ThemedText
                    style={[
                      styles.preferenceButtonText,
                      userPreferences?.contact_preference === "text" && styles.preferenceButtonTextActive,
                    ]}
                  >
                    Text Message
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.preferenceButton,
                    userPreferences?.contact_preference === "email" && styles.preferenceButtonActive,
                  ]}
                  onPress={() => handleUpdatePreference("email")}
                >
                  <ThemedText
                    style={[
                      styles.preferenceButtonText,
                      userPreferences?.contact_preference === "email" && styles.preferenceButtonTextActive,
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
                      userPreferences?.contact_preference === "push" && styles.preferenceButtonActive,
                    ]}
                    onPress={() => handleUpdatePreference("push")}
                  >
                    <ThemedText
                      style={[
                        styles.preferenceButtonText,
                        userPreferences?.contact_preference === "push" && styles.preferenceButtonTextActive,
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

            <TouchableOpacity
              onPress={async () => {
                try {
                  const success = await testEmailFunction(user?.email || "");
                  Alert.alert(
                    success ? "Success" : "Error",
                    success ? "Test email sent successfully!" : "Failed to send test email"
                  );
                } catch (error) {
                  console.error("Error testing email:", error);
                  Alert.alert("Error", "Failed to send test email");
                }
              }}
              style={styles.settingButton}
            >
              <ThemedText style={styles.settingButtonText}>Test Email Function</ThemedText>
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
    width: "100%",
    fontSize: 16,
    textAlign: "center",
  },
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

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
import { sendPasswordResetEmail } from "@/utils/notificationService";
import Constants from "expo-constants";
import { DatePicker } from "@/components/DatePicker";
import { parseISO, format, differenceInYears, isAfter } from "date-fns";
import Toast from "react-native-toast-message";
import { ChangePasswordModal } from "@/components/ui/ChangePasswordModal";

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

function DateOfBirthModal({
  visible,
  onClose,
  onSuccess,
  currentDateOfBirth,
  targetUserId,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: (dateOfBirth: string) => void;
  currentDateOfBirth: string | null;
  targetUserId: string;
}) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    currentDateOfBirth ? parseISO(currentDateOfBirth) : null
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const { session } = useAuth();

  const validateDate = (date: Date): boolean => {
    // Check for future dates
    if (isAfter(date, new Date())) {
      Toast.show({
        type: "error",
        text1: "Invalid Date",
        text2: "Date of birth cannot be in the future",
      });
      return false;
    }

    // Check for age > 105
    const age = differenceInYears(new Date(), date);
    if (age > 105) {
      Toast.show({
        type: "error",
        text1: "Invalid Age",
        text2: "Age cannot be greater than 105 years",
      });
      return false;
    }

    // Check for 10-year difference if there's an existing date
    if (currentDateOfBirth) {
      const currentDate = parseISO(currentDateOfBirth);
      const yearDifference = Math.abs(differenceInYears(date, currentDate));
      if (yearDifference > 10) {
        Toast.show({
          type: "error",
          text1: "Significant Date Change",
          text2: "Changes greater than 10 years require division admin approval",
        });
        return false;
      }
    }

    return true;
  };

  const handleUpdateDateOfBirth = async () => {
    try {
      setError(null);
      setIsLoading(true);

      if (!session) {
        throw new Error("No active session. Please try logging out and back in.");
      }

      if (!selectedDate) {
        throw new Error("Please select a valid date.");
      }

      // Users can only update their own date of birth
      if (session.user.id !== targetUserId) {
        throw new Error("You can only update your own date of birth.");
      }

      // Validate the selected date
      if (!validateDate(selectedDate)) {
        setIsLoading(false);
        return;
      }

      // Format date for database (YYYY-MM-DD)
      const formattedDate = format(selectedDate, "yyyy-MM-dd");

      // Update date_of_birth in members table
      const { error: updateError } = await supabase
        .from("members")
        .update({ date_of_birth: formattedDate })
        .eq("user_id", session.user.id);

      if (updateError) throw updateError;

      onSuccess(formattedDate);
      onClose();
    } catch (error: any) {
      console.error("Error updating date of birth:", error);
      setError(error.message || "Failed to update date of birth");
      Toast.show({
        type: "error",
        text1: "Error",
        text2: error.message || "Failed to update date of birth",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <ThemedView style={styles.modalOverlay}>
        <ThemedView style={styles.modalContent}>
          <ThemedView style={styles.modalHeader}>
            <ThemedText type="title">Update Date of Birth</ThemedText>
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
            <DatePicker
              date={selectedDate}
              onDateChange={setSelectedDate}
              mode="date"
              placeholder="Select date of birth"
              style={styles.modalInput}
            />
          </ThemedView>

          <TouchableOpacity
            onPress={handleUpdateDateOfBirth}
            style={[
              styles.modalButton,
              isLoading && styles.buttonDisabled,
              { backgroundColor: Colors[theme].buttonBackground },
            ]}
            disabled={isLoading || !selectedDate}
          >
            <ThemedText style={styles.buttonText}>{isLoading ? "Updating..." : "Update Date of Birth"}</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>
    </Modal>
  );
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

      // Update phone in auth.users and metadata
      const { error: updateError } = await supabase.auth.updateUser({
        phone: formattedPhone,
        data: {
          phone_number: phoneNumber,
        },
      });

      if (updateError) {
        // Special handling for SMS provider not configured
        if (updateError.message.includes("SMS provider")) {
          console.warn("SMS provider not configured:", updateError);
          // Update just the metadata since SMS verification is not available
          const { error: metadataError } = await supabase.auth.updateUser({
            data: {
              phone_number: phoneNumber,
            },
          });

          if (metadataError) {
            throw metadataError;
          }

          Alert.alert(
            "Notice",
            "Phone number saved in profile. SMS verification will be enabled once the system is fully configured."
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
  const profileID = params.profileID as string | undefined;
  const { user, session, member: loggedInMember } = useAuth(); // Use loggedInMember to avoid confusion
  const theme = (useColorScheme() ?? "light") as ColorScheme;

  // State for the profile being viewed
  const [profile, setProfile] = useState<Member | null>(null);
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [phoneNumber, setPhoneNumber] = useState(""); // Phone number state
  const [divisionName, setDivisionName] = useState<string | null>(null);
  const [zoneName, setZoneName] = useState<string | null>(null);

  // UI State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPhoneModalVisible, setIsPhoneModalVisible] = useState(false);
  const [isDateOfBirthModalVisible, setIsDateOfBirthModalVisible] = useState(false);
  const [isDeviceMobile] = useState(Platform.OS !== "web");
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);

  // Determine if the logged-in user is viewing their own profile
  const isOwnProfile = session?.user?.id === profile?.id;
  // Permissions: can edit basic info only if it's their own profile
  const canEditProfileDetails = isOwnProfile;

  // --- Data Fetching Effect ---
  useEffect(() => {
    const fetchProfileData = async () => {
      setIsLoading(true);
      setError(null);
      // Reset state variables at the beginning
      setProfile(null);
      setDivisionName(null);
      setZoneName(null);
      setUserPreferences(null);
      setPhoneNumber(""); // Reset phone number

      try {
        // Enhanced validation for profileID
        if (!profileID || profileID.trim() === "" || profileID === "index") {
          console.error("Invalid or missing profileID:", profileID);
          throw new Error("Invalid Profile ID provided.");
        }

        // 1. Fetch member data using the validated profileID
        console.log(`[ProfileScreen] Fetching profile data for ID: ${profileID}`);
        const { data: memberData, error: memberError } = await supabase
          .from("members")
          .select("*") // Select all member fields
          .eq("id", profileID)
          .single();

        if (memberError) throw memberError;
        if (!memberData) throw new Error("Profile not found.");

        setProfile(memberData);
        // If viewing own profile, update phone number state from metadata/user record
        if (session?.user?.id === memberData.id) {
          const phoneFromMetadata = session?.user?.user_metadata?.phone_number;
          if (phoneFromMetadata) {
            const cleanedPhone = phoneFromMetadata.replace(/\D/g, "");
            setPhoneNumber(cleanedPhone);
          } else {
            setPhoneNumber(session?.user?.phone?.replace(/\D/g, "") || "");
          }
        }

        // 2. Fetch user preferences using the fetched member's user_id (which is memberData.id)
        const { data: preferencesData, error: preferencesError } = await supabase
          .from("user_preferences")
          .select("*")
          .eq("user_id", memberData.id) // Use memberData.id which is the auth user ID
          .maybeSingle(); // Use maybeSingle as preferences might not exist yet

        if (preferencesError && preferencesError.code !== "PGRST116") {
          // Ignore 'No rows found'
          console.warn("Error fetching preferences:", preferencesError);
        } else if (!preferencesData && memberData.id === session?.user?.id) {
          // If viewing own profile and no prefs found, create defaults
          await createDefaultPreferences(memberData.id, memberData.pin_number);
        } else {
          setUserPreferences(preferencesData as UserPreferences | null);
        }

        // 3. Fetch division name using memberData.division_id
        if (memberData.division_id) {
          const { data: divisionData, error: divisionError } = await supabase
            .from("divisions")
            .select("name")
            .eq("id", memberData.division_id)
            .single();
          if (divisionError) {
            console.error("Error fetching division name:", divisionError);
          } else {
            setDivisionName(divisionData?.name || null);
          }
        } else {
          setDivisionName(null);
        }

        // 4. Fetch zone name using memberData.current_zone_id
        if (memberData.current_zone_id) {
          const { data: zoneData, error: zoneError } = await supabase
            .from("zones")
            .select("name")
            .eq("id", memberData.current_zone_id)
            .single();
          if (zoneError) {
            console.error("Error fetching zone name:", zoneError);
          } else {
            setZoneName(zoneData?.name || null);
          }
        } else {
          setZoneName(null);
        }
      } catch (err: any) {
        console.error("Error fetching profile data:", err);
        setError(err.message || "An error occurred while loading the profile.");
      } finally {
        setIsLoading(false);
        console.log("[ProfileScreen] Finished fetching profile data attempt.");
      }
    };

    fetchProfileData();
  }, [profileID, session?.user?.id]); // Re-fetch if profileID changes or session potentially changes

  // --- Helper Functions ---

  const createDefaultPreferences = async (userId: string, pinNumber: number | null) => {
    if (!pinNumber || !userId) return;
    console.log("[ProfileScreen] Creating default preferences for user:", userId);
    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .insert({
          user_id: userId,
          pin_number: pinNumber,
          contact_preference: "email", // Default preference
          push_token: null,
        })
        .select()
        .single();

      if (error) throw error;
      setUserPreferences(data as UserPreferences);
      console.log("[ProfileScreen] Default preferences created.");
    } catch (error) {
      console.error("Error creating default preferences:", error);
      // Don't alert here, handle silently or show subtle error
    }
  };

  const handleUpdatePreference = async (preference: ContactPreference) => {
    if (!isOwnProfile || !profile || !profile.pin_number || !session?.user?.id) return;
    const userId = session.user.id;
    const pinNumber = profile.pin_number;
    let updatedToken: string | null = userPreferences?.push_token || null;

    console.log(`[ProfileScreen] Updating preference to ${preference} for user ${userId}`);

    try {
      if (preference === "push") {
        if (!isDeviceMobile) {
          Alert.alert("Error", "Push notifications are only available on mobile devices");
          return;
        }
        const token = await registerForPushNotificationsAsync();
        if (!token) {
          Alert.alert("Error", "Failed to setup push notifications. Please check settings.");
          return;
        }
        updatedToken = token;
      } else {
        updatedToken = null; // Clear push token for non-push preferences
      }

      // Upsert preferences
      const { data, error } = await supabase
        .from("user_preferences")
        .upsert(
          {
            // Use upsert to handle both create and update
            user_id: userId,
            pin_number: pinNumber,
            contact_preference: preference,
            push_token: updatedToken,
            updated_at: new Date().toISOString(),
            // id and created_at are handled by DB/RLS/Defaults
          },
          { onConflict: "user_id" }
        )
        .select()
        .single();

      if (error) throw error;

      setUserPreferences(data as UserPreferences);
      Alert.alert("Success", "Contact preference updated successfully!");
    } catch (error: any) {
      console.error("Error updating preference:", error);
      Alert.alert("Error", "Failed to update contact preference. Please try again.");
    }
  };

  const handlePhoneUpdateSuccess = (newPhone: string) => {
    setPhoneNumber(newPhone);
    Alert.alert("Success", "Phone number updated successfully!");
  };

  const handleDateOfBirthUpdateSuccess = (newDateOfBirth: string) => {
    // Update local profile state immediately for better UX
    if (profile) {
      setProfile({ ...profile, date_of_birth: newDateOfBirth });
    }
    Toast.show({
      type: "success",
      text1: "Success",
      text2: "Date of birth updated successfully!",
    });
  };

  // --- Conditional Renders ---
  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ThemedText>Loading profile...</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ThemedText style={styles.errorText}>Error: {error}</ThemedText>
      </ThemedView>
    );
  }

  if (!profile) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ThemedText>Profile not found.</ThemedText>
      </ThemedView>
    );
  }

  // --- Main Render ---
  return (
    <ScrollView style={styles.container}>
      {/* Modals - only allow opening if it's own profile AND profile ID exists */}
      {profile?.id && (
        <PhoneUpdateModal
          visible={isPhoneModalVisible && isOwnProfile}
          onClose={() => setIsPhoneModalVisible(false)}
          onSuccess={handlePhoneUpdateSuccess}
          currentPhone={phoneNumber}
          targetUserId={profile.id} // Safe to use profile.id here
        />
      )}

      {profile?.id && (
        <DateOfBirthModal
          visible={isDateOfBirthModalVisible && isOwnProfile}
          onClose={() => setIsDateOfBirthModalVisible(false)}
          onSuccess={handleDateOfBirthUpdateSuccess}
          currentDateOfBirth={profile.date_of_birth || null}
          targetUserId={profile.id} // Safe to use profile.id here
        />
      )}

      {/* Personal Info Section */}
      <ThemedView style={styles.section}>
        <ThemedText type="title">Personal Information</ThemedText>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Name:</ThemedText>
          <ThemedText>{`${profile.first_name} ${profile.last_name}`}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Email:</ThemedText>
          <ThemedText>{user?.email || "Not set"}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Phone:</ThemedText>
          <ThemedView style={styles.editRow}>
            <ThemedText>{phoneNumber ? formatPhoneNumber(phoneNumber) : "Not set"}</ThemedText>
            {canEditProfileDetails && (
              <TouchableOpacity onPress={() => setIsPhoneModalVisible(true)} style={styles.iconButton}>
                <Ionicons name="pencil" size={24} color={Colors[theme].tint} />
              </TouchableOpacity>
            )}
          </ThemedView>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Date of Birth:</ThemedText>
          <ThemedView style={styles.editRow}>
            <ThemedText>
              {profile.date_of_birth ? format(parseISO(profile.date_of_birth), "MM/dd/yyyy") : "Not set"}
            </ThemedText>
            {canEditProfileDetails && (
              <TouchableOpacity onPress={() => setIsDateOfBirthModalVisible(true)} style={styles.iconButton}>
                <Ionicons name="pencil" size={24} color={Colors[theme].tint} />
              </TouchableOpacity>
            )}
          </ThemedView>
        </ThemedView>
      </ThemedView>
      {/* Contact Preferences (Only for own profile) */}
      {isOwnProfile && (
        <ThemedView style={styles.section}>
          <ThemedText type="title">Contact Preferences</ThemedText>
          <ThemedView style={styles.preferenceContainer}>
            <ThemedView style={styles.preferenceButtons}>
              {/* Text Preference Button */}
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
              {/* Email Preference Button */}
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
            {/* Push Notification Button (Mobile Only) */}
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
      )}
      {/* Account Settings (Only for own profile) */}
      {isOwnProfile && (
        <ThemedView style={styles.section}>
          <ThemedText type="title">Account Settings</ThemedText>
          <ThemedText type="subtitle">Change your account password</ThemedText>
          <TouchableOpacity onPress={() => setIsPasswordModalVisible(true)} style={styles.settingButton}>
            <ThemedText style={styles.settingButtonText}>Change Password</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      )}
      <ChangePasswordModal
        visible={isPasswordModalVisible}
        onClose={() => setIsPasswordModalVisible(false)}
        signOutOnSuccess={false}
        showBackButton={true}
      />
      {/* Union Information Section */}
      <ThemedView style={styles.section}>
        <ThemedText type="title">Union Information</ThemedText>
        {!isOwnProfile && <ThemedText type="subtitle">Contact division admin to change this information</ThemedText>}
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">PIN:</ThemedText>
          <ThemedText>{profile.pin_number}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Division:</ThemedText>
          <ThemedText>{divisionName || "Not assigned"}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Zone:</ThemedText>
          <ThemedText>{zoneName || "Not assigned"}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Engineer Date:</ThemedText>
          <ThemedText>
            {profile.engineer_date ? format(parseISO(profile.engineer_date), "MM/dd/yyyy") : "Not set"}
          </ThemedText>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Company Hire Date:</ThemedText>
          <ThemedText>
            {profile.company_hire_date ? format(parseISO(profile.company_hire_date), "MM/dd/yyyy") : "Not set"}
          </ThemedText>
        </ThemedView>
      </ThemedView>
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
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    backgroundColor: Colors.dark.card,
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.card,
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
    backgroundColor: Colors.dark.card,
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});

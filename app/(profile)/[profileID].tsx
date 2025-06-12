import React, { useState, useEffect } from "react";
import { StyleSheet, ScrollView, Modal, Platform, TextInput, View, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import Constants from "expo-constants";
import { parseISO, format, differenceInYears, isAfter } from "date-fns";
import { ChangePasswordModal } from "@/components/ui/ChangePasswordModal";
import { MemberMessageModal } from "@/components/MemberMessageModal";
import { MeetingNotificationPreferences } from "@/components/ui/MeetingNotificationPreferences";
import { ClientOnlyDatePicker } from "@/components/ClientOnlyDatePicker";
import {
  SmsOptInModal,
  OtpVerificationModal,
  PhoneVerificationBanner,
  VerificationRevertWarningModal,
} from "@/components/ui";
import { showSuccessToast, showErrorToast } from "@/utils/toastHelpers";
import {
  validateAndFormatPhone,
  formatPhoneForDisplay,
  formatPhoneToE164,
  sanitizePhoneInput,
  parseE164ToClean,
} from "@/utils/phoneValidation";
import { useUserStore } from "@/store/userStore";

type Member = Database["public"]["Tables"]["members"]["Row"];
type ContactPreference = "in_app" | "phone" | "text" | "email" | "push";
type ColorScheme = keyof typeof Colors;

interface UserPreferences {
  id: string;
  user_id: string;
  pin_number: number;
  push_token: string | null;
  contact_preference: ContactPreference;
  created_at: string;
  updated_at: string;
  phone_verified?: boolean;
  sms_opt_out?: boolean;
  sms_lockout_until?: string | null;
  phone_verification_status?: "not_started" | "pending" | "verified" | "locked_out";
}

// Base Confirmation Modal component to be reused for all notification types
function NotificationConfirmationModal({
  visible,
  onClose,
  onConfirm,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 20;
    const isScrolledToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    if (isScrolledToBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
    }
  };

  useEffect(() => {
    if (!visible) {
      setHasScrolledToBottom(false);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <ThemedView style={styles.modalOverlay}>
        <ThemedView style={styles.modalContent}>
          <ThemedView style={styles.modalHeader}>
            <ThemedText type="title">{title}</ThemedText>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors[theme].text} />
            </TouchableOpacity>
          </ThemedView>

          <ScrollView style={styles.confirmationScrollContent} onScroll={handleScroll} scrollEventThrottle={16}>
            {children}

            {!hasScrolledToBottom && (
              <ThemedView style={styles.scrollIndicatorContainer}>
                <ThemedText style={styles.scrollIndicatorText}>Please scroll to the bottom to continue</ThemedText>
                <Ionicons name="chevron-down" size={20} color={Colors[theme].tint} />
              </ThemedView>
            )}
          </ScrollView>

          <ThemedView style={styles.confirmationButtonContainer}>
            <TouchableOpacity onPress={onClose} style={styles.secondaryButton}>
              <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              style={[
                styles.primaryButton,
                !hasScrolledToBottom && styles.buttonDisabled,
                { backgroundColor: hasScrolledToBottom ? Colors[theme].buttonBackground : "#888888" },
              ]}
              disabled={!hasScrolledToBottom}
            >
              <ThemedText style={[styles.buttonText, !hasScrolledToBottom && { color: "#999999" }]}>I Agree</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </ThemedView>
      </ThemedView>
    </Modal>
  );
}

// SMS Confirmation Modal Content
function SMSConfirmationContent() {
  const privacyPolicyUrl = `${Constants.expoConfig?.extra?.EXPO_PUBLIC_WEBSITE_URL}/privacy`;
  console.log("Privacy Policy URL:", privacyPolicyUrl);

  return (
    <>
      <ThemedText style={styles.confirmationTitle}>By enabling SMS notifications, you agree to receive:</ThemedText>

      <ThemedView style={styles.bulletContainer}>
        <ThemedText style={styles.bulletItem}>• Alerts and important union announcements</ThemedText>
        <ThemedText style={styles.bulletItem}>• Request approval/denial notifications</ThemedText>
        <ThemedText style={styles.bulletItem}>• Waitlist position changes</ThemedText>
        <ThemedText style={styles.bulletItem}>• Meeting notices and reminders</ThemedText>
        <ThemedText style={styles.bulletItem}>• Other important app-related notifications</ThemedText>
      </ThemedView>

      <ThemedText style={styles.confirmationText}>
        You may receive up to 10 (or more) messages per month. In some cases, multiple messages may be sent in a single
        day.
      </ThemedText>

      <ThemedText style={styles.confirmationText}>
        Message and data rates may apply based on your wireless carrier plan. No additional fees are charged by our
        service.
      </ThemedText>

      <ThemedText style={styles.confirmationText}>
        You can opt-out at any time by replying STOP to any message or by changing your contact preference in the app.
      </ThemedText>

      <ThemedText style={styles.confirmationText}>
        By tapping "I Agree" below, you consent to receive SMS messages from BLET PLD App for the purposes described
        above.
      </ThemedText>

      <ThemedText style={styles.confirmationText}>
        For more information about how we handle your data, please review our{" "}
        <ThemedText style={styles.privacyLink} onPress={() => Linking.openURL(privacyPolicyUrl)}>
          Privacy Policy.
        </ThemedText>
      </ThemedText>
    </>
  );
}

// Email Confirmation Modal Content
function EmailConfirmationContent() {
  const privacyPolicyUrl = `${Constants.expoConfig?.extra?.EXPO_PUBLIC_WEBSITE_URL}/privacy`;

  return (
    <>
      <ThemedText style={styles.confirmationTitle}>By enabling Email notifications, you agree to receive:</ThemedText>

      <ThemedView style={styles.bulletContainer}>
        <ThemedText style={styles.bulletItem}>• Alerts and important union announcements</ThemedText>
        <ThemedText style={styles.bulletItem}>• Request approval/denial notifications</ThemedText>
        <ThemedText style={styles.bulletItem}>• Waitlist position changes</ThemedText>
        <ThemedText style={styles.bulletItem}>• Meeting notices and reminders</ThemedText>
        <ThemedText style={styles.bulletItem}>• Other important app-related notifications</ThemedText>
      </ThemedView>

      <ThemedText style={styles.confirmationText}>
        You may receive up to 10 (or more) emails per month. In some cases, multiple emails may be sent in a single day.
      </ThemedText>

      <ThemedText style={styles.confirmationText}>
        Emails will be sent from notifications@bletcnwcgca.org using our email service provider.
      </ThemedText>

      <ThemedText style={styles.confirmationText}>
        You can opt-out at any time by clicking the unsubscribe link in any email or by changing your contact preference
        in the app.
      </ThemedText>

      <ThemedText style={styles.confirmationText}>
        By tapping "I Agree" below, you consent to receive emails from BLET PLD App for the purposes described above.
      </ThemedText>

      <ThemedText style={styles.confirmationText}>
        For more information about how we handle your data, please review our{" "}
        <ThemedText style={styles.privacyLink} onPress={() => Linking.openURL(privacyPolicyUrl)}>
          Privacy Policy.
        </ThemedText>
      </ThemedText>
    </>
  );
}

// Push Confirmation Modal Content
function PushConfirmationContent() {
  const privacyPolicyUrl = `${Constants.expoConfig?.extra?.EXPO_PUBLIC_WEBSITE_URL}/privacy`;

  return (
    <>
      <ThemedText style={styles.confirmationTitle}>By enabling Push notifications, you agree to receive:</ThemedText>

      <ThemedView style={styles.bulletContainer}>
        <ThemedText style={styles.bulletItem}>• Alerts and important union announcements</ThemedText>
        <ThemedText style={styles.bulletItem}>• Request approval/denial notifications</ThemedText>
        <ThemedText style={styles.bulletItem}>• Waitlist position changes</ThemedText>
        <ThemedText style={styles.bulletItem}>• Meeting notices and reminders</ThemedText>
        <ThemedText style={styles.bulletItem}>• Other important app-related notifications</ThemedText>
      </ThemedView>

      <ThemedText style={styles.confirmationText}>
        You may receive up to 10 (or more) push notifications per month. In some cases, multiple notifications may be
        sent in a single day.
      </ThemedText>

      <ThemedText style={styles.confirmationText}>
        Push notifications require granting notification permissions to this app on your device.
      </ThemedText>

      <ThemedText style={styles.confirmationText}>
        You can opt-out at any time by changing your device notification settings or by changing your contact preference
        in the app.
      </ThemedText>

      <ThemedText style={styles.confirmationText}>
        By tapping "I Agree" below, you consent to receive push notifications from BLET PLD App for the purposes
        described above.
      </ThemedText>

      <ThemedText style={styles.confirmationText}>
        For more information about how we handle your data, please review our{" "}
        <ThemedText style={styles.privacyLink} onPress={() => Linking.openURL(privacyPolicyUrl)}>
          Privacy Policy.
        </ThemedText>
      </ThemedText>
    </>
  );
}

async function registerForPushNotificationsAsync() {
  let token: string;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      showErrorToast("Permission Denied", "Failed to get push token for push notification!");
      return "";
    }

    try {
      const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      if (!projectId) {
        throw new Error("Project ID not found");
      }
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      console.log("Expo Push Token:", token);
    } catch (e) {
      token = `${e}`;
    }
  } else {
    showErrorToast("Error", "Must use physical device for Push Notifications");
    return "";
  }

  return token;
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
      showErrorToast("Invalid Date", "Date of birth cannot be in the future");
      return false;
    }

    // Check for age > 105
    const age = differenceInYears(new Date(), date);
    if (age > 105) {
      showErrorToast("Invalid Age", "Age cannot be greater than 105 years");
      return false;
    }

    // Check for 10-year difference if there's an existing date
    if (currentDateOfBirth) {
      const currentDate = parseISO(currentDateOfBirth);
      const yearDifference = Math.abs(differenceInYears(date, currentDate));
      if (yearDifference > 10) {
        showErrorToast("Significant Date Change", "Changes greater than 10 years require division admin approval");
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
        .schema("public")
        .from("members")
        .update({ date_of_birth: formattedDate })
        .eq("id", session.user.id);

      if (updateError) throw updateError;

      onSuccess(formattedDate);
      onClose();
    } catch (error: any) {
      console.error("Error updating date of birth:", error);
      setError(error.message || "Failed to update date of birth");
      showErrorToast("Error", error.message || "Failed to update date of birth");
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
            <ClientOnlyDatePicker
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
    // Use centralized phone sanitization
    const cleaned = sanitizePhoneInput(value);
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

      // Format phone number for Supabase (E.164 format) using centralized utility
      const formattedPhone = formatPhoneToE164(phoneNumber);

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

          showSuccessToast(
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
              value={formatPhoneForDisplay(phoneNumber)}
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
  const { user, session, member: loggedInMember } = useAuth();
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const router = useRouter();

  // UserStore integration
  const {
    phoneVerification,
    updatePhoneVerification,
    setPhoneNumber: setGlobalPhoneNumber,
    setVerificationStatus,
    setSmsOptOut,
    setSmsLockout,
  } = useUserStore();

  // State for the profile being viewed
  const [profile, setProfile] = useState<Member | null>(null);
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [divisionName, setDivisionName] = useState<string | null>(null);
  const [zoneName, setZoneName] = useState<string | null>(null);

  // UI State (keep these local as they're component-specific)
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPhoneModalVisible, setIsPhoneModalVisible] = useState(false);
  const [isDateOfBirthModalVisible, setIsDateOfBirthModalVisible] = useState(false);
  const [isDeviceMobile] = useState(Platform.OS !== "web");
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);

  // Notification confirmation modals
  const [isSMSOptInVisible, setIsSMSOptInVisible] = useState(false);
  const [isEmailConfirmationVisible, setIsEmailConfirmationVisible] = useState(false);
  const [isPushConfirmationVisible, setIsPushConfirmationVisible] = useState(false);

  // Pending preference selection
  const [pendingPreference, setPendingPreference] = useState<ContactPreference | null>(null);
  const [previousPreference, setPreviousPreference] = useState<ContactPreference>("in_app");

  // OTP verification state (keep some local for UI, sync important parts with userStore)
  const [isOtpModalVisible, setIsOtpModalVisible] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isOtpLoading, setIsOtpLoading] = useState(false);

  // Verification revert warning modal
  const [isRevertWarningVisible, setIsRevertWarningVisible] = useState(false);

  // Add new state for contact admin modal
  const [showContactAdminModal, setShowContactAdminModal] = useState(false);

  // Get phone number from userStore instead of local state
  const phoneNumber = phoneVerification.phoneNumber || "";
  const otpPhoneNumber = phoneVerification.phoneNumber || "";

  // Pre-construct safe values for modals to prevent text node errors
  const safePhoneNumber = phoneNumber || "";
  const safeOtpPhoneNumber = otpPhoneNumber || "";
  const revertPhoneNumber = safeOtpPhoneNumber || safePhoneNumber;

  // Pre-construct display values to prevent text node errors
  const phoneDisplayText = phoneNumber ? formatPhoneForDisplay(phoneNumber) : "Not set";
  const fullNameDisplay = profile ? `${profile.first_name} ${profile.last_name}` : "";
  const emailDisplayText = user?.email || "Not set";
  const dobDisplayText = profile?.date_of_birth ? format(parseISO(profile.date_of_birth), "MM/dd/yyyy") : "Not set";
  const pinDisplayText = profile?.pin_number?.toString() || "";
  const divisionDisplayText = divisionName || "Not assigned";
  const zoneDisplayText = zoneName || "Not assigned";
  const engineerDateDisplay = profile?.engineer_date
    ? format(parseISO(profile.engineer_date), "MM/dd/yyyy")
    : "Not set";
  const companyHireDateDisplay = profile?.company_hire_date
    ? format(parseISO(profile.company_hire_date), "MM/dd/yyyy")
    : "Not set";

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
      setGlobalPhoneNumber(""); // Reset phone number

      try {
        // Enhanced validation for profileID
        if (!profileID || profileID.trim() === "" || profileID === "index") {
          console.error("Invalid or missing profileID:", profileID);
          throw new Error("Invalid Profile ID provided.");
        }

        // 1. Fetch member data using the validated profileID
        console.log(`[ProfileScreen] Fetching profile data for ID: ${profileID}`);
        const { data: memberData, error: memberError } = await supabase
          .schema("public")
          .from("members")
          .select("*") // Select all member fields
          .eq("id", profileID)
          .single();

        if (memberError) throw memberError;
        if (!memberData) throw new Error("Profile not found.");

        setProfile(memberData);
        // If viewing own profile, update phone number state from auth.users record
        if (session?.user?.id === memberData.id) {
          // The phone number should be in session.user.phone from auth.users table
          const phoneFromAuth = session?.user?.phone;
          if (phoneFromAuth) {
            // Use parseE164ToClean to properly handle country codes
            const cleanedPhone = parseE164ToClean(phoneFromAuth);
            setGlobalPhoneNumber(cleanedPhone);
          } else {
            // Fallback: check user_metadata if phone isn't in main auth record
            const phoneFromMetadata = session?.user?.user_metadata?.phone || session?.user?.user_metadata?.phone_number;
            if (phoneFromMetadata) {
              const cleanedPhone = parseE164ToClean(phoneFromMetadata);
              setGlobalPhoneNumber(cleanedPhone);
            } else {
              setGlobalPhoneNumber(""); // No phone number found
            }
          }
        }

        // 2. Fetch user preferences using the fetched member's user_id (which is memberData.id)
        const { data: preferencesData, error: preferencesError } = await supabase
          .schema("public")
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

          // Sync userStore with fetched preferences if this is the user's own profile
          if (preferencesData && memberData.id === session?.user?.id) {
            // Get the current phone number using parseE164ToClean to handle country codes
            const currentPhoneNumber =
              parseE164ToClean(session?.user?.phone) ||
              parseE164ToClean(session?.user?.user_metadata?.phone) ||
              parseE164ToClean(session?.user?.user_metadata?.phone_number) ||
              null;

            updatePhoneVerification({
              phoneNumber: currentPhoneNumber,
              isPhoneVerified: preferencesData.phone_verified || false,
              phoneVerificationStatus: preferencesData.phone_verification_status || "not_started",
              smsOptOut: preferencesData.sms_opt_out || false,
              smsLockoutUntil: preferencesData.sms_lockout_until || null,
            });
          }
        }

        // 3. Fetch division name using memberData.division_id
        if (memberData.division_id) {
          const { data: divisionData, error: divisionError } = await supabase
            .schema("public")
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
            .schema("public")
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
        .schema("public")
        .from("user_preferences")
        .insert({
          user_id: userId,
          pin_number: pinNumber,
          contact_preference: "in_app", // Default to in-app only
          push_token: null,
        })
        .select()
        .single();

      if (error) throw error;
      setUserPreferences(data as UserPreferences);
      console.log("[ProfileScreen] Default preferences created.");
    } catch (error) {
      console.error("Error creating default preferences:", error);
    }
  };

  const handleUpdatePreference = async (preference: ContactPreference) => {
    if (!isOwnProfile || !profile || !profile.pin_number || !session?.user?.id) return;

    // Store current preference as previous for potential revert
    setPreviousPreference(userPreferences?.contact_preference || "in_app");

    // Set the pending preference
    setPendingPreference(preference);

    // For in-app, immediately apply the change without confirmation
    if (preference === "in_app") {
      await applyPreferenceChange(preference);
      return;
    }

    // For text preference, validate phone number first
    if (preference === "text") {
      // Check if user has phone number and validate it
      if (!phoneNumber) {
        showErrorToast(
          "Phone Number Required",
          "A valid phone number is required to receive text messages. Please update your phone number first."
        );
        setIsPhoneModalVisible(true);
        return;
      }

      // Validate phone number format using centralized utility
      const validatedPhone = validateAndFormatPhone(phoneNumber);
      if (!validatedPhone.isValid) {
        showErrorToast("Invalid Phone Number", validatedPhone.error || "Please enter a valid US phone number.");
        setIsPhoneModalVisible(true);
        return;
      }

      // Check if user is locked out
      if (userPreferences?.sms_lockout_until) {
        const lockoutTime = new Date(userPreferences.sms_lockout_until);
        if (lockoutTime > new Date()) {
          showErrorToast(
            "SMS Features Locked",
            "SMS verification is temporarily disabled due to too many failed attempts. Please contact your division admin for assistance."
          );
          return;
        }
      }

      // Check if phone is already verified
      if (userPreferences?.phone_verified) {
        // Phone already verified, can apply preference directly
        await applyPreferenceChange(preference);
        return;
      }

      // Show SMS confirmation modal to start verification flow
      setIsSMSOptInVisible(true);
      return;
    }

    // For email preference
    if (preference === "email") {
      // Validate email
      if (!user?.email) {
        showErrorToast("Email Required", "A valid email is required to receive email notifications.");
        return;
      }

      // Show email confirmation modal
      setIsEmailConfirmationVisible(true);
      return;
    }

    // For push preference
    if (preference === "push") {
      if (!isDeviceMobile) {
        showErrorToast("Error", "Push notifications are only available on mobile devices");
        return;
      }

      // Show push confirmation modal
      setIsPushConfirmationVisible(true);
      return;
    }
  };

  // Function to apply the preference change after confirmation
  const applyPreferenceChange = async (preference: ContactPreference) => {
    if (!profile || !session?.user?.id) return;

    const userId = session.user.id;
    const pinNumber = profile.pin_number;
    let updatedToken: string | null = userPreferences?.push_token || null;

    console.log(`[ProfileScreen] Updating preference to ${preference} for user ${userId}`);

    try {
      // Handle push notifications differently
      if (preference === "push") {
        const token = await registerForPushNotificationsAsync();
        if (!token) {
          showErrorToast("Error", "Failed to setup push notifications. Please check settings.");
          return;
        }
        updatedToken = token;
      } else {
        updatedToken = null; // Clear push token for non-push preferences
      }

      // Upsert preferences
      const { data, error } = await supabase
        .schema("public")
        .from("user_preferences")
        .upsert(
          {
            user_id: userId,
            pin_number: pinNumber,
            contact_preference: preference,
            push_token: updatedToken,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .select()
        .single();

      if (error) throw error;

      setUserPreferences(data as UserPreferences);

      // Show appropriate success message
      let successMessage = "Contact preference updated successfully!";

      if (preference === "text") {
        successMessage =
          "You've successfully opted-in to SMS notifications. Reply STOP to any message to opt-out at any time.";
      } else if (preference === "email") {
        successMessage =
          "You've successfully opted-in to Email notifications. You can unsubscribe from any email or change your preferences here.";
      } else if (preference === "push") {
        successMessage =
          "You've successfully opted-in to Push notifications. You can manage notification settings in your device settings.";
      } else if (preference === "in_app") {
        successMessage = "You will now only receive notifications when using the app.";
      }

      showSuccessToast("Success", successMessage);
    } catch (error: any) {
      console.error("Error updating preference:", error);
      showErrorToast("Error", "Failed to update contact preference. Please try again.");
    } finally {
      // Reset pending preference
      setPendingPreference(null);
    }
  };

  // Handle confirmation for each notification type
  const handleEmailConfirmation = async () => {
    setIsEmailConfirmationVisible(false);
    await applyPreferenceChange("email");
  };

  const handlePushConfirmation = async () => {
    setIsPushConfirmationVisible(false);
    await applyPreferenceChange("push");
  };

  // Cancel handlers for each confirmation
  // OTP verification handlers
  const handleSendOtp = async (phoneNumber: string) => {
    if (!session?.user?.id || !profile?.pin_number) return;

    try {
      setIsOtpLoading(true);
      setOtpError(null);

      // Update verification status to pending
      setVerificationStatus("pending");

      // Validate and format phone number
      const validatedPhone = validateAndFormatPhone(phoneNumber);
      if (!validatedPhone.isValid) {
        throw new Error(validatedPhone.error || "Invalid phone number format");
      }

      const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          phone: validatedPhone.e164,
          user_id: session.user.id,
          pin_number: profile.pin_number,
        }),
      });

      // Read response as text first, then try to parse as JSON
      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (jsonError) {
        console.error("Failed to parse JSON response:", responseText);
        throw new Error(`Server returned invalid response. Status: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(result.error || "Failed to send OTP");
      }

      // Store the phone number for verification and update userStore
      setGlobalPhoneNumber(validatedPhone.e164);
      updatePhoneVerification({
        lastVerificationAttempt: new Date().toISOString(),
      });

      // Close SMS opt-in modal and show OTP modal
      setIsSMSOptInVisible(false);
      setIsOtpModalVisible(true);

      showSuccessToast("OTP Sent", "Check your phone for the verification code");
    } catch (error: any) {
      console.error("Error sending OTP:", error);
      setOtpError(error.message);
      setVerificationStatus("not_started");
      showErrorToast("Error", error.message || "Failed to send verification code");
    } finally {
      setIsOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    if (!session?.user?.id || !otpPhoneNumber || !profile?.pin_number) return;

    try {
      setIsOtpLoading(true);
      setOtpError(null);

      const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          phone: otpPhoneNumber,
          user_id: session.user.id,
          code: code,
          pin_number: profile.pin_number,
        }),
      });

      // Read response as text first, then try to parse as JSON
      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (jsonError) {
        console.error("Failed to parse JSON response:", responseText);
        throw new Error(`Server returned invalid response. Status: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(result.error || "Invalid verification code");
      }

      // Success - update userStore with verified status
      setVerificationStatus("verified");
      updatePhoneVerification({
        isPhoneVerified: true,
      });

      // Close OTP modal
      setIsOtpModalVisible(false);

      // Apply the SMS preference change
      await applyPreferenceChange("text");

      showSuccessToast("Phone Verified", "Your phone number has been verified successfully!");
    } catch (error: any) {
      console.error("Error verifying OTP:", error);
      setOtpError(error.message);
      showErrorToast("Verification Failed", error.message || "Invalid verification code");
    } finally {
      setIsOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpPhoneNumber) {
      await handleSendOtp(otpPhoneNumber);
    }
  };

  const handleOtpCancel = () => {
    setIsOtpModalVisible(false);
    setOtpError(null);
    setPendingPreference(null);

    // Reset verification status
    setVerificationStatus("not_started");

    // Show revert warning modal
    setIsRevertWarningVisible(true);
  };

  const handleVerificationRevert = async () => {
    setIsRevertWarningVisible(false);
    // Revert to previous preference
    await applyPreferenceChange(previousPreference);
    showSuccessToast(
      "Preference Reverted",
      `Notifications set back to ${previousPreference === "in_app" ? "In-App Only" : previousPreference}`
    );
  };

  const handleKeepTryingLater = () => {
    setIsRevertWarningVisible(false);
    // Keep text preference but user will see banner warning
    showSuccessToast(
      "Preference Saved",
      "Text message preference saved. Please verify your phone number to receive notifications."
    );
  };

  const handleCancelSMSOptIn = () => {
    setIsSMSOptInVisible(false);
    setPendingPreference(null);

    // Show revert warning modal
    setIsRevertWarningVisible(true);
  };

  const handleCancelEmailConfirmation = () => {
    setIsEmailConfirmationVisible(false);
    setPendingPreference(null);
  };

  const handleCancelPushConfirmation = () => {
    setIsPushConfirmationVisible(false);
    setPendingPreference(null);
  };

  const handleDateOfBirthUpdateSuccess = (newDateOfBirth: string) => {
    // Update local profile state immediately for better UX
    if (profile) {
      setProfile({ ...profile, date_of_birth: newDateOfBirth });
    }
    showSuccessToast("Success", "Date of birth updated successfully!");
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
          onSuccess={(newPhone) => {
            setGlobalPhoneNumber(newPhone);
            showSuccessToast("Success", "Phone number updated successfully!");
          }}
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

      {/* SMS Opt-In Modal */}
      <SmsOptInModal
        visible={isSMSOptInVisible}
        onClose={handleCancelSMSOptIn}
        onOptIn={handleSendOtp}
        currentPhoneNumber={safePhoneNumber}
      />

      {/* OTP Verification Modal */}
      <OtpVerificationModal
        visible={isOtpModalVisible}
        onClose={handleOtpCancel}
        onVerify={handleVerifyOtp}
        onResend={handleResendOtp}
        phoneNumber={safeOtpPhoneNumber}
        error={otpError}
        isLoading={isOtpLoading}
      />

      {/* Verification Revert Warning Modal */}
      <VerificationRevertWarningModal
        visible={isRevertWarningVisible}
        onClose={() => setIsRevertWarningVisible(false)}
        onRevert={handleVerificationRevert}
        onKeepTrying={handleKeepTryingLater}
        previousPreference={previousPreference}
        phoneNumber={revertPhoneNumber}
      />

      {/* Email and Push Notification Confirmation Modals */}
      <NotificationConfirmationModal
        visible={isEmailConfirmationVisible}
        onClose={handleCancelEmailConfirmation}
        onConfirm={handleEmailConfirmation}
        title="Email Notifications Opt-In"
      >
        <EmailConfirmationContent />
      </NotificationConfirmationModal>

      <NotificationConfirmationModal
        visible={isPushConfirmationVisible}
        onClose={handleCancelPushConfirmation}
        onConfirm={handlePushConfirmation}
        title="Push Notifications Opt-In"
      >
        <PushConfirmationContent />
      </NotificationConfirmationModal>

      {/* Personal Info Section */}
      <ThemedView style={styles.section}>
        <ThemedText type="title">Personal Information</ThemedText>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Name:</ThemedText>
          <ThemedText>{fullNameDisplay}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Email:</ThemedText>
          <ThemedText>{emailDisplayText}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Phone:</ThemedText>
          <ThemedView style={styles.editRow}>
            <ThemedView style={styles.phoneNumberContainer}>
              <ThemedText>{phoneDisplayText}</ThemedText>
              {/* Phone Verification Status Badge */}
              {isOwnProfile && phoneNumber && phoneVerification.isPhoneVerified ? (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={Colors[theme].success}
                  style={styles.verificationIcon}
                />
              ) : null}
            </ThemedView>
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
            <ThemedText>{dobDisplayText}</ThemedText>
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
          <ThemedText style={styles.preferencesDescription}>
            Choose how you want to receive notifications from the app:
          </ThemedText>
          <ThemedView style={styles.preferenceContainer}>
            <ThemedView style={styles.preferenceButtons}>
              {/* In-App Only Button */}
              <TouchableOpacity
                style={[
                  styles.preferenceButton,
                  userPreferences?.contact_preference === "in_app" && styles.preferenceButtonActive,
                ]}
                onPress={() => handleUpdatePreference("in_app")}
              >
                <ThemedText
                  style={[
                    styles.preferenceButtonText,
                    userPreferences?.contact_preference === "in_app" && styles.preferenceButtonTextActive,
                  ]}
                >
                  In-App Only
                </ThemedText>
              </TouchableOpacity>

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

                {/* Advanced PUSH Notification Settings Button */}

                <TouchableOpacity
                  style={styles.advancedSettingsButton}
                  onPress={() => router.push("/(profile)/notification-settings")}
                >
                  <Ionicons name="notifications-outline" size={20} color={Colors[theme].tint} />
                  <ThemedText style={styles.advancedSettingsText}>Advanced PUSH Notification Settings</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            )}

            {/* Notification Settings Section */}
            <ThemedText style={styles.sectionTitle}>Notification Settings</ThemedText>
            <View style={styles.notificationPreferences}>
              <MeetingNotificationPreferences />
            </View>
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
        <ThemedView style={styles.sectionHeader}>
          <ThemedText type="title">Union Information</ThemedText>
          {isOwnProfile && (
            <TouchableOpacity style={styles.contactAdminButton} onPress={() => setShowContactAdminModal(true)}>
              <Ionicons name="chatbubble-ellipses" size={18} color={Colors[theme].buttonText} />
              <ThemedText style={styles.contactAdminText}>Contact Admin</ThemedText>
            </TouchableOpacity>
          )}
        </ThemedView>
        {isOwnProfile && (
          <ThemedText type="subtitle" style={styles.preferencesDescription}>
            Contact division admin to change this information if any of it is wrong.
          </ThemedText>
        )}
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">PIN:</ThemedText>
          <ThemedText>{pinDisplayText}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Division:</ThemedText>
          <ThemedText>{divisionDisplayText}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Zone:</ThemedText>
          <ThemedText>{zoneDisplayText}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Engineer Date:</ThemedText>
          <ThemedText>{engineerDateDisplay}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.infoRow}>
          <ThemedText type="subtitle">Company Hire Date:</ThemedText>
          <ThemedText>{companyHireDateDisplay}</ThemedText>
        </ThemedView>
      </ThemedView>

      {/* Contact Admin Modal */}
      {profile && (
        <MemberMessageModal
          visible={showContactAdminModal}
          onClose={() => setShowContactAdminModal(false)}
          memberPin={profile.pin_number ? profile.pin_number.toString() : ""}
          memberEmail=""
          division={divisionName || ""}
        />
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
    backgroundColor: Colors.dark.card,
  },
  preferenceButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    backgroundColor: Colors.dark.card,
  },
  pushNotificationContainer: {
    width: "100%",
    backgroundColor: Colors.dark.card,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
    borderWidth: 1,
    borderColor: Colors.dark.border,
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
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.buttonBorder,
    marginRight: 8,
  },
  secondaryButtonText: {
    color: Colors.dark.buttonTextSecondary,
  },
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
  confirmationScrollContent: {
    maxHeight: 300,
    marginBottom: 16,
  },
  confirmationTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  confirmationText: {
    marginBottom: 12,
    lineHeight: 20,
  },
  confirmationButtonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: Colors.dark.buttonBackground,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginLeft: 8,
  },
  bulletContainer: {
    marginLeft: 5,
    marginBottom: 15,
  },
  bulletItem: {
    fontSize: 14,
    marginBottom: 10,
    lineHeight: 20,
  },
  scrollIndicatorContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
  },
  scrollIndicatorText: {
    marginRight: 8,
  },
  preferencesDescription: {
    marginBottom: 12,
    fontSize: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    backgroundColor: Colors.dark.card,
    flexWrap: "wrap",
  },
  contactAdminButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.buttonBackground,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    marginTop: 8,
  },
  contactAdminText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
    fontSize: 12,
  },
  sectionTitle: {
    paddingTop: 16,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
    backgroundColor: Colors.dark.card,
  },
  notificationPreferences: {
    gap: 6,
    backgroundColor: Colors.dark.card,
  },
  privacyLink: {
    color: "#b8860b",
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  advancedSettingsButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.buttonBorder,
    backgroundColor: Colors.dark.buttonBackground,
    marginTop: 8,
  },
  advancedSettingsText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
    marginLeft: 8,
  },
  phoneNumberContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.card,
  },
  verificationIcon: {
    marginLeft: 8,
  },
});

import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  Alert,
  TouchableOpacity,
  Platform,
  Linking,
  RefreshControl,
  Switch,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { usePushTokenStore } from "@/store/pushTokenStore";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth } from "@/hooks/useAuth";
import * as Notifications from "expo-notifications";
import * as IntentLauncher from "expo-intent-launcher";
import { supabase } from "@/utils/supabase";
import Toast from "react-native-toast-message";
import * as Application from "expo-application";

type ColorScheme = keyof typeof Colors;

// Type for Ionicons names
type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

// Type for notification categories and preferences
interface NotificationCategory {
  id: string;
  name: string;
  code: string;
  description: string;
  default_importance: string;
  is_mandatory: boolean;
}

interface UserNotificationPreference {
  id: string;
  user_id: string;
  category_code: string;
  delivery_method: string;
  enabled: boolean;
}

// Delivery method options for notifications
const deliveryMethods = [
  { id: "default", label: "Default (Based on Contact Preference)" },
  { id: "push", label: "Push Notification" },
  { id: "email", label: "Email" },
  { id: "sms", label: "Text Message (SMS)" },
  { id: "in_app", label: "In-App Only" },
];

// SMS Status Indicator Component
function SMSStatusIndicator() {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const { session } = useAuth();
  const router = useRouter();
  const [phoneVerified, setPhoneVerified] = useState<boolean>(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSMSStatus();
  }, [session?.user?.id]);

  const fetchSMSStatus = async () => {
    if (!session?.user?.id) return;

    try {
      // Get phone verification status from user_preferences
      const { data: prefsData, error: prefsError } = await supabase
        .from("user_preferences")
        .select("phone_verified")
        .eq("user_id", session.user.id)
        .single();

      if (prefsError && prefsError.code !== "PGRST116") {
        throw prefsError;
      }

      // Get phone number from members table (synced from auth.users)
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("phone_number")
        .eq("id", session.user.id)
        .single();

      if (memberError && memberError.code !== "PGRST116") {
        console.warn("Error fetching phone from members:", memberError);
      }

      let phoneNumber = memberData?.phone_number || null;

      // Fallback: if no phone in members table, try Edge Function
      if (!phoneNumber) {
        try {
          const { data: contactData, error: contactError } = await supabase.functions.invoke("get-user-contact-info", {
            body: { userId: session.user.id, contactType: "phone" },
          });

          if (!contactError && contactData?.phone) {
            // Convert E.164 format to clean format for display
            phoneNumber = contactData.phone.replace(/^\+1/, "").replace(/[^0-9]/g, "");
          }
        } catch (edgeFunctionError) {
          console.warn("Edge Function fallback failed:", edgeFunctionError);
        }
      }

      setPhoneVerified(prefsData?.phone_verified || false);
      setPhoneNumber(phoneNumber);
    } catch (error) {
      console.error("Error fetching SMS status:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <ThemedText style={styles.loadingText}>Loading SMS status...</ThemedText>;
  }

  return (
    <ThemedView style={styles.smsStatusContainer}>
      <ThemedView style={styles.infoRow}>
        <ThemedText style={styles.infoLabel}>Phone Number:</ThemedText>
        <ThemedText style={styles.infoValue}>{phoneNumber || "Not provided"}</ThemedText>
      </ThemedView>

      <ThemedView style={styles.infoRow}>
        <ThemedText style={styles.infoLabel}>SMS Status:</ThemedText>
        <ThemedView style={styles.statusContainer}>
          <Ionicons
            name={phoneVerified ? "checkmark-circle" : "alert-circle"}
            size={16}
            color={phoneVerified ? "#34c759" : "#ff9500"}
          />
          <ThemedText style={[styles.statusText, { color: phoneVerified ? "#34c759" : "#ff9500" }]}>
            {phoneVerified ? "Verified" : "Not Verified"}
          </ThemedText>
        </ThemedView>
      </ThemedView>

      {!phoneVerified && (
        <ThemedView style={styles.phoneVerificationInfo}>
          <ThemedView style={styles.infoRow}>
            <Ionicons name="information-circle" size={16} color={Colors[theme].warning} />
            <ThemedText style={styles.infoText}>
              To receive SMS notifications, go to your profile and select "Text Message" as your contact preference.
              Phone verification will begin automatically.
            </ThemedText>
          </ThemedView>
          <TouchableOpacity
            style={styles.profileLinkButton}
            onPress={() => router.push(`/(profile)/${session?.user?.id}`)}
          >
            <Ionicons name="person" size={16} color={Colors[theme].tint} />
            <ThemedText style={[styles.profileLinkText, { color: Colors[theme].tint }]}>
              Go to Profile Settings
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>
      )}

      <ThemedText style={styles.smsInfoText}>
        SMS notifications require a verified phone number. Standard messaging rates may apply.
      </ThemedText>
    </ThemedView>
  );
}

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const { session } = useAuth();

  // Check if we're on a native mobile platform (not web)
  const isNativeMobile = Platform.OS === "ios" || Platform.OS === "android";

  // Use our centralized push token store
  const {
    expoPushToken,
    isRegistered,
    isLoading,
    error,
    permissionStatus,
    registerDevice,
    checkPermissionStatus,
    refreshToken,
    lastRegistrationDate,
    init,
  } = usePushTokenStore();

  const [contactPreference, setContactPreference] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshingPage, setRefreshingPage] = useState(false);

  // State for notification categories and preferences
  const [categories, setCategories] = useState<NotificationCategory[]>([]);
  const [preferences, setPreferences] = useState<Record<string, { deliveryMethod: string; enabled: boolean }>>({});
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Initialize push token store when component mounts
  useEffect(() => {
    console.log("[NotificationSettings] Initializing component");

    // First check if the store needs initialization
    if (init) {
      console.log("[NotificationSettings] Initializing push token store");
      init().catch((error) => {
        console.error("[NotificationSettings] Error initializing push token store:", error);
      });
    }

    // Then check permissions
    if (checkPermissionStatus) {
      console.log("[NotificationSettings] Checking permission status");
      checkPermissionStatus().catch((error) => {
        console.error("[NotificationSettings] Error checking permission status:", error);
      });
    }

    // Finally fetch user preferences
    if (session?.user?.id) {
      console.log("[NotificationSettings] Fetching user preferences");
      fetchUserPreferences();

      // Fetch notification categories and preferences
      fetchNotificationSettings();
    }
  }, [session?.user?.id, init, checkPermissionStatus]);

  const fetchUserPreferences = async () => {
    if (!session?.user?.id) return;

    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("contact_preference")
        .eq("user_id", session.user.id)
        .single();

      if (error) throw error;

      if (data) {
        setContactPreference(data.contact_preference);
      }
    } catch (error) {
      console.error("[NotificationSettings] Error fetching user preferences:", error);
    }
  };

  const fetchNotificationSettings = async () => {
    if (!session?.user?.id) return;

    setLoadingCategories(true);

    try {
      // Fetch all categories first
      const { data: categoriesData, error: catError } = await supabase
        .from("notification_categories")
        .select("*")
        .order("name");

      if (catError) {
        console.error("Error fetching categories:", catError);
        setLoadingCategories(false);
        return;
      }

      // Fetch user's current preferences
      const { data: prefsData, error: prefsError } = await supabase
        .from("user_notification_preferences")
        .select("*")
        .eq("user_id", session.user.id);

      if (prefsError) {
        console.error("Error fetching preferences:", prefsError);
      }

      // Transform preferences into a map for easier access
      const prefsMap: Record<string, { deliveryMethod: string; enabled: boolean }> = {};
      (prefsData || []).forEach((pref: UserNotificationPreference) => {
        prefsMap[pref.category_code] = {
          deliveryMethod: pref.delivery_method === "none" ? "in_app" : pref.delivery_method, // Convert "none" to "in_app"
          enabled: pref.enabled,
        };
      });

      setCategories(categoriesData || []);
      setPreferences(prefsMap);
    } catch (error) {
      console.error("Error fetching notification settings:", error);
    } finally {
      setLoadingCategories(false);
    }
  };

  const updatePreference = async (
    categoryCode: string,
    field: "deliveryMethod" | "enabled",
    value: string | boolean,
    isMandatory: boolean
  ) => {
    if (!session?.user?.id) return;

    // If this is a mandatory notification and the user is trying to disable it,
    // we won't allow that change
    if (isMandatory && field === "enabled" && value === false) {
      Alert.alert(
        "Required Notification",
        "This notification type cannot be disabled as it contains critical information."
      );
      return;
    }

    // Note: "none" option has been removed - minimum is "in_app"

    // Add SMS-specific validation
    if (field === "deliveryMethod" && value === "sms") {
      // Check if phone is verified
      const { data: userPrefs } = await supabase
        .from("user_preferences")
        .select("phone_verified")
        .eq("user_id", session.user.id)
        .single();

      if (!userPrefs?.phone_verified) {
        Toast.show({
          type: "info",
          text1: "Phone Verification Required",
          text2:
            "You must verify your phone number before you can receive SMS notifications. Would you like to verify it now?",
          position: "bottom",
          visibilityTime: 4000,
          autoHide: false,
          props: {
            onAction: (action: string) => {
              if (action === "confirm") {
                router.push(`/(profile)/${session?.user?.id}`);
              }
              Toast.hide();
            },
            actionType: "confirm",
            confirmText: "Verify",
          },
        });
        return;
      }
    }

    // Update local state immediately for responsive UI
    setPreferences((prev) => ({
      ...prev,
      [categoryCode]: {
        ...(prev[categoryCode] || { deliveryMethod: "default", enabled: true }),
        [field]: value,
      },
    }));

    // Then update in database
    const { error } = await supabase.from("user_notification_preferences").upsert(
      {
        user_id: session.user.id,
        category_code: categoryCode,
        [field === "deliveryMethod" ? "delivery_method" : "enabled"]: value,
      },
      { onConflict: "user_id, category_code" }
    );

    if (error) {
      console.error("Error updating preference:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to update notification preference",
      });
      // Revert on error
      fetchNotificationSettings();
    } else {
      Toast.show({
        type: "success",
        text1: "Updated",
        text2: "Notification preference updated successfully",
      });
    }
  };

  const refreshPermissionStatus = async () => {
    setIsRefreshing(true);
    try {
      await checkPermissionStatus();
    } catch (error) {
      console.error("[NotificationSettings] Error refreshing permission status:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRequestPermission = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();

      if (status === "granted") {
        Toast.show({
          type: "success",
          text1: "Permission Granted",
          text2: "You can now receive push notifications",
        });

        // Register the device if permission was granted
        if (session?.user?.id) {
          await registerDevice(session.user.id);
        }
      } else {
        Toast.show({
          type: "error",
          text1: "Permission Denied",
          text2: "Please enable notifications in your device settings",
        });
      }

      // Refresh the permission status
      await checkPermissionStatus();
    } catch (error) {
      console.error("[NotificationSettings] Error requesting notification permission:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to request notification permission",
      });
    }
  };

  const handleRefreshToken = async () => {
    if (!session?.user?.id) return;

    setIsRefreshing(true);
    try {
      await refreshToken(session.user.id);
      Toast.show({
        type: "success",
        text1: "Token Refreshed",
        text2: "Your notification token has been updated",
      });
    } catch (error) {
      console.error("[NotificationSettings] Error refreshing token:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to refresh notification token",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const openDeviceSettings = async () => {
    if (Platform.OS === "ios") {
      Linking.openURL("app-settings:");
    } else if (Platform.OS === "android") {
      // On Android, we need to use the Expo IntentLauncher for app settings
      try {
        const packageName = Application.applicationId;
        if (packageName) {
          IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, {
            data: "package:" + packageName,
          });
        } else {
          // Fallback if we can't get the package name
          Linking.openSettings();
        }
      } catch (error) {
        console.error("Error opening app settings:", error);
        // Fallback to app settings
        Linking.openSettings();
      }
    }
  };

  const handleRefreshPage = async () => {
    setRefreshingPage(true);
    try {
      await checkPermissionStatus();
      if (session?.user?.id) {
        await fetchUserPreferences();
        await fetchNotificationSettings();
      }
    } finally {
      setRefreshingPage(false);
    }
  };

  // Helper to render permission status
  const renderPermissionStatus = () => {
    let icon: IoniconsName = "help-circle-outline";
    let statusText = "Unknown";

    switch (permissionStatus) {
      case "granted":
        icon = "checkmark-circle";
        statusText = "Granted";
        break;
      case "denied":
        icon = "close-circle";
        statusText = "Denied";
        break;
      case "undetermined":
        icon = "help-circle";
        statusText = "Not Requested";
        break;
      case "error":
        icon = "alert-circle";
        statusText = "Error";
        break;
    }

    // Get color based on status
    const getStatusColor = () => {
      switch (permissionStatus) {
        case "granted":
          return Colors[theme].success;
        case "denied":
        case "error":
          return Colors[theme].error;
        case "undetermined":
          return Colors[theme].warning;
        default:
          return Colors[theme].text;
      }
    };

    const statusColor = getStatusColor();

    return (
      <ThemedView style={styles.statusContainer}>
        <Ionicons name={icon} size={24} color={statusColor} />
        <ThemedText style={[styles.statusText, { color: statusColor }]}>{statusText}</ThemedText>
      </ThemedView>
    );
  };

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Unknown";
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch (error) {
      return "Invalid date";
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Notification Settings",
          headerShadowVisible: false,
        }}
      />

      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshingPage}
            onRefresh={handleRefreshPage}
            colors={[Colors[theme].tint]}
            tintColor={Colors[theme].tint}
          />
        }
      >
        {/* Push Notification Settings - Only show on native mobile platforms */}
        {isNativeMobile && (
          <ThemedView style={styles.section}>
            <ThemedText type="title">Push Notification Settings</ThemedText>

            <ThemedView style={styles.statusSection}>
              <ThemedText style={styles.sectionTitle}>Current Permission Status</ThemedText>
              {renderPermissionStatus()}

              <TouchableOpacity style={styles.refreshButton} onPress={refreshPermissionStatus} disabled={isRefreshing}>
                <Ionicons
                  name="refresh"
                  size={16}
                  color={Colors[theme].text}
                  style={isRefreshing ? { opacity: 0.5 } : {}}
                />
                <ThemedText style={[styles.refreshText, isRefreshing ? { opacity: 0.5 } : {}]}>
                  {isRefreshing ? "Refreshing..." : "Refresh Status"}
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>

            {/* Token info */}
            <ThemedView style={styles.statusSection}>
              <ThemedText style={styles.sectionTitle}>Device Registration</ThemedText>
              <ThemedView style={styles.tokenStatus}>
                <Ionicons
                  name={isRegistered ? "phone-portrait" : ("phone-portrait-outline" as IoniconsName)}
                  size={24}
                  color={isRegistered ? Colors[theme].success : Colors[theme].textDim}
                />
                <ThemedText style={styles.tokenStatusText}>
                  {isRegistered
                    ? "Device is registered for push notifications"
                    : "Device is not registered for push notifications"}
                </ThemedText>
              </ThemedView>

              {isRegistered && lastRegistrationDate && (
                <ThemedView style={styles.infoRow}>
                  <ThemedText style={styles.infoLabel}>Last Updated:</ThemedText>
                  <ThemedText style={styles.infoValue}>{formatDate(lastRegistrationDate)}</ThemedText>
                </ThemedView>
              )}

              {isRegistered && (
                <TouchableOpacity
                  style={[styles.secondaryButton, { marginTop: 12 }]}
                  onPress={handleRefreshToken}
                  disabled={isRefreshing}
                >
                  <Ionicons name="refresh-circle" size={20} color={Colors[theme].tint} />
                  <ThemedText style={styles.secondaryButtonText}>
                    {isRefreshing ? "Refreshing Token..." : "Refresh Push Token"}
                  </ThemedText>
                </TouchableOpacity>
              )}

              {isLoading && <ThemedText style={styles.loadingText}>Working...</ThemedText>}

              {error && <ThemedText style={[styles.errorText, { color: Colors[theme].error }]}>{error}</ThemedText>}
            </ThemedView>

            {/* Action buttons based on status */}
            <ThemedView style={styles.actionSection}>
              {permissionStatus === "undetermined" && (
                <TouchableOpacity
                  style={styles.permissionButton}
                  onPress={handleRequestPermission}
                  disabled={isLoading}
                >
                  <Ionicons name="notifications-outline" size={20} color={Colors.dark.buttonText} />
                  <ThemedText style={styles.permissionButtonText}>Allow Push Notifications</ThemedText>
                </TouchableOpacity>
              )}

              {permissionStatus === "denied" && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: Colors[theme].warning }]}
                  onPress={openDeviceSettings}
                >
                  <Ionicons name="settings-outline" size={20} color={Colors.dark.buttonText} />
                  <ThemedText style={styles.permissionButtonText}>Open Device Settings</ThemedText>
                </TouchableOpacity>
              )}

              {permissionStatus === "granted" && !isRegistered && (
                <TouchableOpacity
                  style={styles.permissionButton}
                  onPress={() => session?.user?.id && registerDevice(session.user.id)}
                  disabled={isLoading}
                >
                  <Ionicons name="cloud-upload-outline" size={20} color="#FFFFFF" />
                  <ThemedText style={styles.permissionButtonText}>Register This Device</ThemedText>
                </TouchableOpacity>
              )}
            </ThemedView>
          </ThemedView>
        )}

        {/* SMS Status Section */}
        <ThemedView style={styles.smsSection}>
          <ThemedText style={styles.sectionTitle}>SMS Notifications</ThemedText>
          <SMSStatusIndicator />
        </ThemedView>

        {/* Notification preferences info */}
        <ThemedView style={styles.infoSection}>
          <ThemedText style={styles.sectionTitle}>Notification Preferences</ThemedText>
          <ThemedText style={styles.infoText}>
            Your current contact preference is set to:{" "}
            <ThemedText style={styles.preferenceBold}>{contactPreference || "Not set"}</ThemedText>
          </ThemedText>

          <ThemedText style={styles.infoText}>
            To change how you receive notifications, please visit your profile settings.
          </ThemedText>

          <TouchableOpacity style={styles.linkButton} onPress={() => router.push(`/(profile)/${session?.user?.id}`)}>
            <ThemedText style={styles.linkText}>Go to Profile Settings</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        {/* Notification Category Preferences */}
        <ThemedView style={styles.categorySection}>
          <ThemedText style={styles.sectionTitle}>Notification Category Preferences</ThemedText>
          <ThemedText style={styles.preferencesDescription}>
            Customize which notifications you receive and how they're delivered
          </ThemedText>

          {loadingCategories ? (
            <ThemedText style={styles.loadingText}>Loading categories...</ThemedText>
          ) : (
            categories.map((category) => {
              const pref = preferences[category.code] || {
                deliveryMethod: "default",
                enabled: true,
              };

              const isMandatory = category.is_mandatory;

              return (
                <ThemedView key={category.code} style={styles.categoryItem}>
                  <ThemedView style={styles.categoryHeader}>
                    <ThemedText type="subtitle">{category.name}</ThemedText>
                    <Switch
                      value={pref.enabled}
                      onValueChange={(value) => updatePreference(category.code, "enabled", value, isMandatory)}
                      trackColor={{ false: "#767577", true: Colors[theme].tint }}
                      thumbColor="#f4f3f4"
                      disabled={isMandatory} // Disable toggle for mandatory notifications
                    />
                  </ThemedView>

                  <ThemedText style={styles.categoryDescription}>{category.description}</ThemedText>

                  {isMandatory && (
                    <ThemedView style={styles.mandatoryTag}>
                      <ThemedText style={styles.mandatoryText}>Required</ThemedText>
                    </ThemedView>
                  )}

                  <ThemedView style={styles.deliveryMethodContainer}>
                    <ThemedText style={styles.deliveryLabel}>Delivery Method:</ThemedText>

                    {deliveryMethods.map((method) => (
                      <ThemedView key={method.id} style={styles.radioOption}>
                        <TouchableOpacity
                          onPress={() => updatePreference(category.code, "deliveryMethod", method.id, isMandatory)}
                          style={styles.radioButton}
                          disabled={!isNativeMobile && method.id === "push"} // Disable push option on web platforms
                        >
                          <Ionicons
                            name={pref.deliveryMethod === method.id ? "radio-button-on" : "radio-button-off"}
                            size={24}
                            color={
                              !isNativeMobile && method.id === "push"
                                ? Colors[theme].textDim
                                : pref.deliveryMethod === method.id
                                ? Colors[theme].tint
                                : Colors[theme].textDim
                            }
                          />
                          <ThemedText
                            style={[
                              styles.radioLabel,
                              !isNativeMobile && method.id === "push" ? { color: Colors[theme].textDim } : null,
                            ]}
                          >
                            {method.label}
                            {!isNativeMobile && method.id === "push" && " (Mobile Only)"}
                          </ThemedText>
                        </TouchableOpacity>
                      </ThemedView>
                    ))}
                  </ThemedView>

                  <ThemedView
                    style={[
                      styles.importanceIndicator,
                      {
                        backgroundColor:
                          category.default_importance === "high"
                            ? "rgba(255, 59, 48, 0.2)"
                            : category.default_importance === "medium"
                            ? "rgba(255, 149, 0, 0.2)"
                            : "rgba(52, 199, 89, 0.2)",
                      },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.importanceLabel,
                        {
                          color:
                            category.default_importance === "high"
                              ? "#ff3b30"
                              : category.default_importance === "medium"
                              ? "#ff9500"
                              : "#34c759",
                        },
                      ]}
                    >
                      Priority: {category.default_importance.toUpperCase()}
                      {isMandatory ? " (Fixed)" : ""}
                    </ThemedText>
                  </ThemedView>
                </ThemedView>
              );
            })
          )}
        </ThemedView>

        {/* Platform-specific troubleshooting */}
        <ThemedView style={styles.troubleshootSection}>
          <ThemedText style={styles.sectionTitle}>Troubleshooting</ThemedText>

          <ThemedView style={styles.troubleshootItem}>
            <Ionicons name="alert-circle-outline" size={20} color={Colors[theme].textDim} />
            <ThemedText style={styles.troubleshootText}>
              If you're not receiving notifications, try refreshing your token, checking device settings, or restarting
              the app.
            </ThemedText>
          </ThemedView>

          {Platform.OS === "ios" && (
            <ThemedView style={styles.troubleshootItem}>
              <Ionicons name="logo-apple" size={20} color={Colors[theme].textDim} />
              <ThemedText style={styles.troubleshootText}>
                On iOS, ensure notifications are enabled for this app in Settings → Notifications →{" "}
                {Application.applicationName || "BLET App"}
              </ThemedText>
            </ThemedView>
          )}

          {Platform.OS === "android" && (
            <>
              <ThemedView style={styles.troubleshootItem}>
                <Ionicons name="logo-android" size={20} color={Colors[theme].textDim} />
                <ThemedText style={styles.troubleshootText}>
                  Some Android devices have battery optimization settings that can block notifications. Make sure to
                  disable battery optimization for this app.
                </ThemedText>
              </ThemedView>

              <TouchableOpacity style={styles.helpButton} onPress={() => Linking.openURL("https://dontkillmyapp.com")}>
                <ThemedText style={styles.helpButtonText}>Android Battery Optimization Guide</ThemedText>
              </TouchableOpacity>
            </>
          )}
        </ThemedView>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
    gap: 16,
  },
  statusSection: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  actionSection: {
    marginTop: 8,
    marginBottom: 8,
    alignItems: "center",
  },
  infoSection: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  troubleshootSection: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  statusText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "500",
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.buttonBorder,
    alignSelf: "flex-start",
  },
  refreshText: {
    fontSize: 14,
    marginLeft: 6,
  },
  tokenStatus: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  tokenStatusText: {
    marginLeft: 8,
    fontSize: 14,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginRight: 8,
  },
  infoValue: {
    fontSize: 14,
  },
  loadingText: {
    marginTop: 8,
    fontStyle: "italic",
  },
  errorText: {
    marginTop: 8,
  },
  permissionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backgroundColor: Colors.dark.tint,
    borderRadius: 8,
    width: "90%",
    marginTop: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 8,
    width: "90%",
    marginTop: 12,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.dark.buttonBorder,
    borderRadius: 8,
  },
  secondaryButtonText: {
    color: Colors.dark.tint,
    marginLeft: 8,
  },
  permissionButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
    marginLeft: 8,
  },
  infoText: {
    fontSize: 14,
    marginBottom: 8,
    lineHeight: 20,
  },
  preferenceBold: {
    fontWeight: "600",
    textTransform: "capitalize",
  },
  linkButton: {
    marginTop: 8,
    paddingVertical: 6,
  },
  linkText: {
    color: Colors.dark.tint,
    fontWeight: "500",
  },
  troubleshootItem: {
    flexDirection: "row",
    marginBottom: 12,
  },
  troubleshootText: {
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 8,
    flex: 1,
  },
  helpButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.buttonBorder,
    alignItems: "center",
    marginTop: 8,
  },
  helpButtonText: {
    color: Colors.dark.tint,
  },
  // New styles for category preferences
  categorySection: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  preferencesDescription: {
    marginBottom: 12,
    fontSize: 14,
  },
  categoryItem: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.dark.buttonBorder,
    backgroundColor: Colors.dark.card,
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    backgroundColor: Colors.dark.card,
  },
  categoryDescription: {
    marginBottom: 16,
    opacity: 0.7,
  },
  deliveryMethodContainer: {
    marginBottom: 16,
    backgroundColor: Colors.dark.card,
  },
  deliveryLabel: {
    fontWeight: "600",
    marginBottom: 8,
  },
  radioOption: {
    marginVertical: 4,
    backgroundColor: Colors.dark.card,
  },
  radioButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  radioLabel: {
    marginLeft: 8,
  },
  importanceIndicator: {
    padding: 8,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  importanceLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  mandatoryTag: {
    backgroundColor: "rgba(255, 59, 48, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  mandatoryText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ff3b30",
  },
  // SMS-related styles
  smsSection: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  smsStatusContainer: {
    gap: 12,
  },
  verifyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  verifyButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
    marginLeft: 8,
  },
  smsInfoText: {
    fontSize: 12,
    opacity: 0.7,
    fontStyle: "italic",
    marginTop: 8,
  },
  phoneVerificationInfo: {
    backgroundColor: "rgba(255, 149, 0, 0.1)",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  profileLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.dark.tint,
    backgroundColor: "transparent",
  },
  profileLinkText: {
    fontWeight: "500",
    marginLeft: 6,
  },
});

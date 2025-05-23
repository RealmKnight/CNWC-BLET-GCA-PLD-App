import React, { useState, useEffect } from "react";
import { StyleSheet, Platform, View, TextInput, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import {
  useDivisionManagementStore,
  DivisionEmailSettings as DivisionEmailSettingsType,
} from "@/store/divisionManagementStore";
import { useAuth } from "@/hooks/useAuth";
import Toast from "react-native-toast-message";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";
import { notifyDivisionAdminsOfEmailSettingsChange } from "@/utils/emailNotificationHelpers";

const AnimatedThemedView = Animated.createAnimatedComponent(ThemedView);

interface DivisionEmailSettingsProps {
  division: string;
}

export function DivisionEmailSettings({ division }: DivisionEmailSettingsProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { session } = useAuth();

  // Store state
  const {
    divisions,
    divisionEmailSettings,
    isLoadingDivisions,
    isLoadingEmailSettings,
    error,
    fetchDivisions,
    fetchDivisionEmailSettings,
    createOrUpdateDivisionEmailSettings,
    deleteDivisionEmailSettings,
  } = useDivisionManagementStore();

  // Find current division
  const currentDivision = divisions.find((div) => div.name === division);
  const divisionId = currentDivision?.id;
  const currentSettings = divisionId ? divisionEmailSettings[divisionId] : null;

  // Form state
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [additionalEmails, setAdditionalEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load divisions and settings when component mounts or division changes
  useEffect(() => {
    // Always fetch divisions first if not loaded
    if (divisions.length === 0) {
      fetchDivisions();
    }
  }, [divisions.length, fetchDivisions]);

  // Load email settings when divisionId is available
  useEffect(() => {
    if (divisionId) {
      fetchDivisionEmailSettings(divisionId);
    }
  }, [divisionId, fetchDivisionEmailSettings]);

  // Update form state when settings change
  useEffect(() => {
    if (currentSettings) {
      setPrimaryEmail(currentSettings.primary_email || "");
      setAdditionalEmails(currentSettings.additional_emails || []);
      setEnabled(currentSettings.enabled);
      setIsEditing(false);
    } else {
      // Reset form for new settings
      setPrimaryEmail("");
      setAdditionalEmails([]);
      setEnabled(true);
      setIsEditing(false);
    }
  }, [currentSettings]);

  // Email validation
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Add additional email
  const handleAddEmail = () => {
    const trimmedEmail = newEmail.trim();
    if (!trimmedEmail) {
      Toast.show({
        type: "error",
        text1: "Invalid Email",
        text2: "Please enter an email address",
        position: "bottom",
      });
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      Toast.show({
        type: "error",
        text1: "Invalid Email",
        text2: "Please enter a valid email address",
        position: "bottom",
      });
      return;
    }

    if (additionalEmails.includes(trimmedEmail) || primaryEmail === trimmedEmail) {
      Toast.show({
        type: "error",
        text1: "Duplicate Email",
        text2: "This email is already added",
        position: "bottom",
      });
      return;
    }

    setAdditionalEmails([...additionalEmails, trimmedEmail]);
    setNewEmail("");
  };

  // Remove additional email
  const handleRemoveEmail = (emailToRemove: string) => {
    Alert.alert("Remove Email", `Are you sure you want to remove ${emailToRemove}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          setAdditionalEmails(additionalEmails.filter((email) => email !== emailToRemove));
        },
      },
    ]);
  };

  // Save settings
  const handleSave = async () => {
    if (!divisionId || !session?.user?.id) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Unable to save: missing division or user information",
        position: "bottom",
      });
      return;
    }

    // Validate primary email if provided
    if (primaryEmail && !validateEmail(primaryEmail)) {
      Toast.show({
        type: "error",
        text1: "Invalid Primary Email",
        text2: "Please enter a valid primary email address",
        position: "bottom",
      });
      return;
    }

    // Ensure at least one email is provided if enabled
    if (enabled && !primaryEmail && additionalEmails.length === 0) {
      Toast.show({
        type: "error",
        text1: "Email Required",
        text2: "Please provide at least one email address when email notifications are enabled",
        position: "bottom",
      });
      return;
    }

    setIsSaving(true);
    try {
      // Determine newly added emails for welcome email sending
      const previousPrimaryEmail = currentSettings?.primary_email;
      const previousAdditionalEmails = currentSettings?.additional_emails || [];

      const newEmails: string[] = [];

      // Check if primary email is new
      if (primaryEmail && primaryEmail !== previousPrimaryEmail && !previousAdditionalEmails.includes(primaryEmail)) {
        newEmails.push(primaryEmail);
      }

      // Check for new additional emails
      additionalEmails.forEach((email) => {
        if (!previousAdditionalEmails.includes(email) && email !== previousPrimaryEmail) {
          newEmails.push(email);
        }
      });

      await createOrUpdateDivisionEmailSettings(
        divisionId,
        {
          primary_email: primaryEmail || undefined,
          additional_emails: additionalEmails,
          enabled,
        },
        session.user.id
      );

      // Send welcome emails to newly added email addresses
      if (newEmails.length > 0 && enabled) {
        console.log("Sending welcome emails to new addresses:", newEmails);

        // Import supabase here to avoid dependency issues
        const { supabase } = await import("@/utils/supabase");

        for (const emailAddress of newEmails) {
          try {
            console.log(`Sending welcome email to: ${emailAddress}`);
            const { error: emailError } = await supabase.functions.invoke("send-division-welcome-email", {
              body: {
                divisionId: divisionId,
                emailAddress: emailAddress,
                divisionName: division,
              },
            });

            if (emailError) {
              console.error(`Failed to send welcome email to ${emailAddress}:`, emailError);
              // Don't fail the entire save process if welcome email fails
              Toast.show({
                type: "info",
                text1: "Welcome Email Warning",
                text2: `Settings saved, but welcome email to ${emailAddress} failed to send`,
                position: "bottom",
              });
            } else {
              console.log(`Welcome email sent successfully to: ${emailAddress}`);
            }
          } catch (emailError) {
            console.error(`Error sending welcome email to ${emailAddress}:`, emailError);
            // Continue with other emails even if one fails
          }
        }
      }

      Toast.show({
        type: "success",
        text1: "Settings Saved",
        text2:
          newEmails.length > 0
            ? `Division email settings updated and ${newEmails.length} welcome email(s) sent`
            : "Division email settings have been updated successfully",
        position: "bottom",
      });
      setIsEditing(false);

      // Notify division admins of email settings change
      try {
        // Get admin name from session
        const adminName = session.user.email || session.user.id;

        await notifyDivisionAdminsOfEmailSettingsChange(divisionId, {
          changeType: currentSettings ? "update" : "add",
          adminName,
          emailsAffected: [...(primaryEmail ? [primaryEmail] : []), ...additionalEmails.filter(Boolean)],
        });
      } catch (notifyError) {
        console.error("Error sending email settings change notifications:", notifyError);
        // Don't fail the whole operation if notifications fail
      }
    } catch (error) {
      console.error("Error saving division email settings:", error);
      Toast.show({
        type: "error",
        text1: "Save Failed",
        text2: error instanceof Error ? error.message : "Failed to save email settings",
        position: "bottom",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete settings
  const handleDelete = () => {
    if (!divisionId || !session?.user?.id || !currentSettings) return;

    Alert.alert(
      "Delete Email Settings",
      "Are you sure you want to delete all email settings for this division? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDivisionEmailSettings(divisionId, session.user.id);
              Toast.show({
                type: "success",
                text1: "Settings Deleted",
                text2: "Division email settings have been deleted",
                position: "bottom",
              });

              // Notify division admins of email settings change
              try {
                // Get admin name from session
                const adminName = session.user.email || session.user.id;

                await notifyDivisionAdminsOfEmailSettingsChange(divisionId, {
                  changeType: "remove",
                  adminName,
                  emailsAffected: [...(primaryEmail ? [primaryEmail] : []), ...additionalEmails.filter(Boolean)],
                });
              } catch (notifyError) {
                console.error("Error sending email settings change notifications:", notifyError);
                // Don't fail the whole operation if notifications fail
              }
            } catch (error) {
              console.error("Error deleting division email settings:", error);
              Toast.show({
                type: "error",
                text1: "Delete Failed",
                text2: error instanceof Error ? error.message : "Failed to delete email settings",
                position: "bottom",
              });
            }
          },
        },
      ]
    );
  };

  // Cancel editing
  const handleCancel = () => {
    if (currentSettings) {
      setPrimaryEmail(currentSettings.primary_email || "");
      setAdditionalEmails(currentSettings.additional_emails || []);
      setEnabled(currentSettings.enabled);
    } else {
      setPrimaryEmail("");
      setAdditionalEmails([]);
      setEnabled(true);
    }
    setNewEmail("");
    setIsEditing(false);
  };

  if (!divisionId) {
    // Show loading if divisions are still being fetched
    if (isLoadingDivisions) {
      return (
        <ThemedView style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
          <ThemedText style={styles.loadingText}>Loading divisions...</ThemedText>
        </ThemedView>
      );
    }

    // Show error if divisions are loaded but division not found
    if (divisions.length > 0) {
      return (
        <ThemedView style={styles.container}>
          <ThemedView style={styles.errorContainer}>
            <ThemedText style={styles.errorText}>Division "{division}" not found</ThemedText>
          </ThemedView>
        </ThemedView>
      );
    }

    // Still loading divisions
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
        <ThemedText style={styles.loadingText}>Loading...</ThemedText>
      </ThemedView>
    );
  }

  if (isLoadingEmailSettings) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
        <ThemedText style={styles.loadingText}>Loading email settings...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Email Notification Settings</ThemedText>
          <ThemedText style={styles.sectionSubtitle}>
            Configure email addresses to receive division-related notifications
          </ThemedText>
        </View>

        {error && (
          <ThemedView style={styles.errorContainer}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </ThemedView>
        )}

        {/* Enable/Disable Toggle */}
        <View style={styles.fieldContainer}>
          <TouchableOpacityComponent
            style={[
              styles.toggleContainer,
              { backgroundColor: enabled ? Colors[colorScheme].tint : Colors[colorScheme].border },
            ]}
            onPress={() => setEnabled(!enabled)}
            disabled={!isEditing && !!currentSettings}
          >
            <ThemedText
              style={[
                styles.toggleText,
                { color: enabled ? Colors[colorScheme].background : Colors[colorScheme].text },
              ]}
            >
              {enabled ? "Email Notifications Enabled" : "Email Notifications Disabled"}
            </ThemedText>
            <Ionicons
              name={enabled ? "checkmark" : "close"}
              size={20}
              color={enabled ? Colors[colorScheme].background : Colors[colorScheme].text}
            />
          </TouchableOpacityComponent>
        </View>

        {/* Primary Email */}
        <View style={styles.fieldContainer}>
          <ThemedText style={styles.fieldLabel}>Primary Email Address</ThemedText>
          <TextInput
            style={[
              styles.textInput,
              {
                color: Colors[colorScheme].text,
                borderColor: Colors[colorScheme].border,
                backgroundColor: Colors[colorScheme].background,
              },
              !isEditing && !!currentSettings && styles.disabledInput,
            ]}
            placeholder="Enter primary email address"
            placeholderTextColor={Colors[colorScheme].text + "60"}
            value={primaryEmail}
            onChangeText={setPrimaryEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={isEditing || !currentSettings}
          />
        </View>

        {/* Additional Emails */}
        <View style={styles.fieldContainer}>
          <ThemedText style={styles.fieldLabel}>Additional Email Addresses</ThemedText>

          {/* List of additional emails */}
          {additionalEmails.map((email, index) => (
            <AnimatedThemedView
              key={email}
              style={styles.emailItem}
              entering={FadeIn}
              exiting={FadeOut}
              layout={Layout.springify()}
            >
              <ThemedText style={styles.emailText}>{email}</ThemedText>
              {(isEditing || !currentSettings) && (
                <TouchableOpacityComponent style={styles.removeButton} onPress={() => handleRemoveEmail(email)}>
                  <Ionicons name="close-circle" size={20} color={Colors[colorScheme].error} />
                </TouchableOpacityComponent>
              )}
            </AnimatedThemedView>
          ))}

          {/* Add new email */}
          {(isEditing || !currentSettings) && (
            <View style={styles.addEmailContainer}>
              <TextInput
                style={[
                  styles.textInput,
                  styles.addEmailInput,
                  {
                    color: Colors[colorScheme].text,
                    borderColor: Colors[colorScheme].border,
                    backgroundColor: Colors[colorScheme].background,
                  },
                ]}
                placeholder="Add additional email address"
                placeholderTextColor={Colors[colorScheme].text + "60"}
                value={newEmail}
                onChangeText={setNewEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                onSubmitEditing={handleAddEmail}
              />
              <TouchableOpacityComponent
                style={[styles.addButton, { backgroundColor: Colors[colorScheme].tint }]}
                onPress={handleAddEmail}
              >
                <Ionicons name="add" size={20} color={Colors[colorScheme].background} />
              </TouchableOpacityComponent>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          {!isEditing && currentSettings ? (
            // View mode buttons
            <View style={styles.buttonRow}>
              <TouchableOpacityComponent
                style={[styles.button, styles.editButton, { backgroundColor: Colors[colorScheme].tint }]}
                onPress={() => setIsEditing(true)}
              >
                <Ionicons name="pencil" size={16} color={Colors[colorScheme].background} />
                <ThemedText style={[styles.buttonText, { color: Colors[colorScheme].background }]}>
                  Edit Settings
                </ThemedText>
              </TouchableOpacityComponent>
              <TouchableOpacityComponent
                style={[styles.button, styles.deleteButton, { backgroundColor: Colors[colorScheme].error }]}
                onPress={handleDelete}
              >
                <Ionicons name="trash" size={16} color={Colors[colorScheme].background} />
                <ThemedText style={[styles.buttonText, { color: Colors[colorScheme].background }]}>Delete</ThemedText>
              </TouchableOpacityComponent>
            </View>
          ) : (
            // Edit mode buttons
            <View style={styles.buttonRow}>
              <TouchableOpacityComponent
                style={[
                  styles.button,
                  styles.saveButton,
                  { backgroundColor: Colors[colorScheme].tint },
                  isSaving && styles.disabledButton,
                ]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={Colors[colorScheme].background} />
                ) : (
                  <Ionicons name="checkmark" size={16} color={Colors[colorScheme].background} />
                )}
                <ThemedText style={[styles.buttonText, { color: Colors[colorScheme].background }]}>
                  {isSaving ? "Saving..." : "Save Settings"}
                </ThemedText>
              </TouchableOpacityComponent>
              {currentSettings && (
                <TouchableOpacityComponent
                  style={[styles.button, styles.cancelButton, { borderColor: Colors[colorScheme].border }]}
                  onPress={handleCancel}
                  disabled={isSaving}
                >
                  <Ionicons name="close" size={16} color={Colors[colorScheme].text} />
                  <ThemedText style={[styles.buttonText, { color: Colors[colorScheme].text }]}>Cancel</ThemedText>
                </TouchableOpacityComponent>
              )}
            </View>
          )}
        </View>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  section: {
    marginBottom: 24,
    padding: 16,
  },
  sectionHeader: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    opacity: 0.7,
  },
  errorContainer: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.light.error + "20",
    marginBottom: 16,
  },
  errorText: {
    color: Colors.light.error,
    fontSize: 14,
    textAlign: "center",
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 8,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    ...Platform.select({
      web: {
        outlineWidth: 0,
      },
    }),
  },
  disabledInput: {
    opacity: 0.6,
    backgroundColor: Colors.light.border + "30",
  },
  toggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 8,
  },
  toggleText: {
    fontSize: 16,
    fontWeight: "500",
  },
  emailItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: Colors.light.background,
  },
  emailText: {
    flex: 1,
    fontSize: 14,
  },
  removeButton: {
    padding: 4,
  },
  addEmailContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addEmailInput: {
    flex: 1,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonContainer: {
    marginTop: 24,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 8,
    gap: 8,
  },
  editButton: {
    // backgroundColor set inline
  },
  deleteButton: {
    // backgroundColor set inline
  },
  saveButton: {
    // backgroundColor set inline
  },
  cancelButton: {
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "500",
  },
});

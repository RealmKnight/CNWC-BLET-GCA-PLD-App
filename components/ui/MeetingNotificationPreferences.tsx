import React, { useState, useEffect } from "react";
import { StyleSheet, View, Switch, ActivityIndicator, TouchableOpacity } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { supabase } from "@/utils/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

interface MeetingNotificationPreferences {
  id?: string;
  user_id: string;
  notify_week_before: boolean;
  notify_day_before: boolean;
  notify_hour_before: boolean;
}

export function MeetingNotificationPreferences() {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [preferences, setPreferences] = useState<MeetingNotificationPreferences>({
    user_id: userId || "",
    notify_week_before: false,
    notify_day_before: false,
    notify_hour_before: false,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchPreferences();
    }
  }, [userId]);

  const fetchPreferences = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("meeting_notification_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setPreferences(data);
      } else {
        // Create default preferences if none exist
        await createDefaultPreferences();
      }
    } catch (error) {
      console.error("Error fetching meeting notification preferences:", error);
      Toast.show({
        type: "error",
        text1: "Failed to load notification preferences",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createDefaultPreferences = async () => {
    try {
      const defaultPrefs: MeetingNotificationPreferences = {
        user_id: userId || "",
        notify_week_before: false,
        notify_day_before: false,
        notify_hour_before: false,
      };

      const { data, error } = await supabase
        .from("meeting_notification_preferences")
        .insert(defaultPrefs)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setPreferences(data);
      }
    } catch (error) {
      console.error("Error creating default meeting notification preferences:", error);
    }
  };

  const updatePreference = async (field: keyof MeetingNotificationPreferences, value: boolean) => {
    if (!userId || isSaving) return;

    try {
      setIsSaving(true);

      // Update local state first for immediate feedback
      setPreferences((prev) => ({
        ...prev,
        [field]: value,
      }));

      // Then update in database
      const { error } = await supabase
        .from("meeting_notification_preferences")
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      if (error) throw error;

      Toast.show({
        type: "success",
        text1: "Notification preference updated",
        position: "bottom",
      });
    } catch (error) {
      console.error("Error updating meeting notification preference:", error);

      // Revert local state if update fails
      setPreferences((prev) => ({
        ...prev,
        [field]: !value,
      }));

      Toast.show({
        type: "error",
        text1: "Failed to update notification preference",
        position: "bottom",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={Colors[colorScheme].tint} />
      </View>
    );
  }

  const toggleSection = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <ThemedView style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={toggleSection}>
        <ThemedText style={styles.title}>Meeting Notifications</ThemedText>
        <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={Colors[colorScheme].text} />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.content}>
          <ThemedText style={styles.description}>
            Configure when you want to receive notifications about upcoming division meetings.
          </ThemedText>

          <View style={styles.preferenceItem}>
            <ThemedText>One week before meeting</ThemedText>
            <Switch
              value={preferences.notify_week_before}
              onValueChange={(value) => updatePreference("notify_week_before", value)}
              disabled={isSaving}
              trackColor={{ false: "#767577", true: Colors[colorScheme].tint }}
            />
          </View>

          <View style={styles.preferenceItem}>
            <ThemedText>One day before meeting</ThemedText>
            <Switch
              value={preferences.notify_day_before}
              onValueChange={(value) => updatePreference("notify_day_before", value)}
              disabled={isSaving}
              trackColor={{ false: "#767577", true: Colors[colorScheme].tint }}
            />
          </View>

          <View style={styles.preferenceItem}>
            <ThemedText>One hour before meeting</ThemedText>
            <Switch
              value={preferences.notify_hour_before}
              onValueChange={(value) => updatePreference("notify_hour_before", value)}
              disabled={isSaving}
              trackColor={{ false: "#767577", true: Colors[colorScheme].tint }}
            />
          </View>

          <ThemedText style={styles.note}>
            Note: You will only receive notifications for meetings from divisions you belong to.
          </ThemedText>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  content: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
  },
  description: {
    marginBottom: 16,
    fontSize: 14,
  },
  preferenceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  note: {
    marginTop: 16,
    fontSize: 12,
    fontStyle: "italic",
    opacity: 0.7,
  },
  loadingContainer: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});

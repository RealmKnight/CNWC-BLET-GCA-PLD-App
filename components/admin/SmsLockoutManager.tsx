import React, { useState, useEffect } from "react";
import { StyleSheet, View, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { supabase } from "@/utils/supabase";
import { useUserStore } from "@/store/userStore";
import { useAuth } from "@/hooks/useAuth";
import { showSuccessToast, showErrorToast } from "@/utils/toastHelpers";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";

const AnimatedThemedView = Animated.createAnimatedComponent(ThemedView);

interface SmsLockedUser {
  id: string;
  pin_number: number;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  division_id: number;
  division_name: string;
  sms_lockout_until: string;
  phone_verification_status: string;
  locked_duration_hours: number;
}

interface SmsLockoutManagerProps {
  divisionFilter?: string; // Optional division filter for division admins
  maxUsers?: number;
}

export function SmsLockoutManager({ divisionFilter, maxUsers = 20 }: SmsLockoutManagerProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { member } = useUserStore();
  const { session } = useAuth();

  // State
  const [lockedUsers, setLockedUsers] = useState<SmsLockedUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState<Record<string, boolean>>({});

  // Fetch SMS-locked users
  const fetchSmsLockedUsers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Build the base query using members as the starting point and joining to user_preferences
      let query = supabase
        .from("members")
        .select(
          `
          id,
          pin_number,
          first_name,
          last_name,
          phone_number,
          division_id,
          user_preferences!inner (
            user_id,
            sms_lockout_until,
            phone_verification_status
          )
        `
        )
        .not("user_preferences.sms_lockout_until", "is", null)
        .gt("user_preferences.sms_lockout_until", new Date().toISOString())
        .limit(maxUsers);

      // Apply division filter if provided
      if (divisionFilter) {
        // Get division ID from name
        const { data: divisionData } = await supabase
          .from("divisions")
          .select("id")
          .eq("name", divisionFilter)
          .single();

        if (divisionData) {
          query = query.eq("division_id", divisionData.id);
        }
      }

      const { data: membersData, error: membersError } = await query;

      if (membersError) throw membersError;

      // Get division names for all unique division IDs
      const divisionIds = [...new Set(membersData?.map((member: any) => member.division_id).filter(Boolean))];
      const { data: divisionsData } = await supabase.from("divisions").select("id, name").in("id", divisionIds);

      const divisionsMap = new Map((divisionsData || []).map((div: any) => [div.id, div.name]));

      // Get user emails from auth.users for all unique user IDs
      const userIds = [...new Set(membersData?.map((member: any) => member.id).filter(Boolean))];
      const { data: usersData } = await supabase.from("users").select("id, email").in("id", userIds);

      const usersMap = new Map((usersData || []).map((user: any) => [user.id, user.email]));

      // Transform the data
      const transformedUsers: SmsLockedUser[] = (membersData || []).map((member: any) => {
        const userPref = member.user_preferences;
        const lockoutTime = new Date(userPref.sms_lockout_until);
        const currentTime = new Date();
        const hoursRemaining = Math.max(
          0,
          Math.ceil((lockoutTime.getTime() - currentTime.getTime()) / (1000 * 60 * 60))
        );

        return {
          id: member.id,
          pin_number: member.pin_number,
          first_name: member.first_name,
          last_name: member.last_name,
          email: usersMap.get(member.id) || undefined,
          phone: member.phone_number,
          division_id: member.division_id,
          division_name: divisionsMap.get(member.division_id) || "Unknown Division",
          sms_lockout_until: userPref.sms_lockout_until,
          phone_verification_status: userPref.phone_verification_status,
          locked_duration_hours: hoursRemaining,
        };
      });

      // Sort by lockout time (most recent first) in JavaScript
      transformedUsers.sort((a, b) => {
        const timeA = new Date(a.sms_lockout_until).getTime();
        const timeB = new Date(b.sms_lockout_until).getTime();
        return timeB - timeA; // Descending order (most recent first)
      });

      setLockedUsers(transformedUsers);
    } catch (err) {
      console.error("Error fetching SMS locked users:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch SMS locked users");
    } finally {
      setIsLoading(false);
    }
  };

  // Unlock a user from SMS lockout
  const unlockUser = async (user: SmsLockedUser) => {
    if (!session?.user?.id) {
      showErrorToast("Authentication required to unlock users");
      return;
    }

    Alert.alert(
      "Unlock SMS Access",
      `Are you sure you want to unlock SMS access for ${user.first_name} ${user.last_name} (PIN: ${user.pin_number})?\n\nThis will allow them to attempt phone verification again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlock",
          style: "default",
          onPress: async () => {
            try {
              setIsUnlocking((prev) => ({ ...prev, [user.id]: true }));

              // Clear the SMS lockout
              const { error: unlockError } = await supabase
                .from("user_preferences")
                .update({
                  sms_lockout_until: null,
                  phone_verification_status: "not_started",
                  updated_at: new Date().toISOString(),
                })
                .eq("user_id", user.id);

              if (unlockError) throw unlockError;

              // Log the unlock action for audit purposes
              const { error: auditError } = await supabase.from("sms_webhook_audit_log").insert({
                event_type: "ADMIN_UNLOCK",
                phone_number: user.phone || "unknown",
                message_body: `Admin unlock by ${session.user.email} for user ${user.pin_number}`,
                user_id: user.id,
                created_at: new Date().toISOString(),
              });

              if (auditError) {
                console.warn("Failed to log admin unlock action:", auditError);
              }

              showSuccessToast(`Successfully unlocked SMS access for ${user.first_name} ${user.last_name}`);

              // Refresh the list
              await fetchSmsLockedUsers();
            } catch (error) {
              console.error("Error unlocking user:", error);
              showErrorToast(error instanceof Error ? error.message : "Failed to unlock SMS access");
            } finally {
              setIsUnlocking((prev) => ({ ...prev, [user.id]: false }));
            }
          },
        },
      ]
    );
  };

  // Load data on mount
  useEffect(() => {
    fetchSmsLockedUsers();
  }, [divisionFilter]);

  if (isLoading && lockedUsers.length === 0) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
        <ThemedText style={styles.loadingText}>Loading SMS locked users...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="lock-closed" size={20} color={Colors[colorScheme].tint} />
            <ThemedText style={styles.title}>SMS Locked Users</ThemedText>
            {lockedUsers.length > 0 && (
              <View style={[styles.badge, { backgroundColor: Colors.dark.error }]}>
                <ThemedText style={styles.badgeText}>{lockedUsers.length}</ThemedText>
              </View>
            )}
          </View>
          <TouchableOpacityComponent style={styles.refreshButton} onPress={fetchSmsLockedUsers}>
            <Ionicons name="refresh" size={20} color={Colors[colorScheme].tint} />
          </TouchableOpacityComponent>
        </View>

        {/* Error State */}
        {error && (
          <ThemedView style={styles.errorContainer}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <TouchableOpacityComponent style={styles.retryButton} onPress={fetchSmsLockedUsers}>
              <ThemedText style={[styles.retryButtonText, { color: Colors[colorScheme].tint }]}>Retry</ThemedText>
            </TouchableOpacityComponent>
          </ThemedView>
        )}

        {/* Users List */}
        {lockedUsers.length === 0 ? (
          <ThemedView style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle" size={48} color={Colors[colorScheme].text + "40"} />
            <ThemedText style={styles.emptyText}>No SMS locked users</ThemedText>
            <ThemedText style={styles.emptySubtext}>All users have SMS verification access</ThemedText>
          </ThemedView>
        ) : (
          <View style={styles.usersList}>
            {lockedUsers.map((user) => (
              <AnimatedThemedView
                key={user.id}
                style={styles.userCard}
                entering={FadeIn}
                exiting={FadeOut}
                layout={Layout.springify()}
              >
                <View style={styles.userHeader}>
                  <View style={styles.userInfo}>
                    <Ionicons name="person" size={16} color={Colors[colorScheme].text} />
                    <ThemedText style={styles.userName}>
                      {user.first_name} {user.last_name}
                    </ThemedText>
                    <View style={[styles.statusBadge, { backgroundColor: Colors.dark.error + "20" }]}>
                      <ThemedText style={[styles.statusText, { color: Colors.dark.error }]}>LOCKED</ThemedText>
                    </View>
                  </View>
                  <ThemedText style={styles.lockoutTime}>{user.locked_duration_hours}h remaining</ThemedText>
                </View>

                <View style={styles.userDetails}>
                  <ThemedText style={styles.userDetail}>PIN: {user.pin_number}</ThemedText>
                  <ThemedText style={styles.userDetail}>Division: {user.division_name}</ThemedText>
                  {user.phone && <ThemedText style={styles.userDetail}>Phone: {user.phone}</ThemedText>}
                  <ThemedText style={styles.userDetail}>
                    Status: {user.phone_verification_status.replace(/_/g, " ")}
                  </ThemedText>
                </View>

                {/* Actions */}
                <View style={styles.userActions}>
                  <TouchableOpacityComponent
                    style={[styles.unlockButton, { borderColor: Colors.dark.success }]}
                    onPress={() => unlockUser(user)}
                    disabled={isUnlocking[user.id]}
                  >
                    {isUnlocking[user.id] ? (
                      <ActivityIndicator size="small" color={Colors.dark.success} />
                    ) : (
                      <Ionicons name="lock-open" size={16} color={Colors.dark.success} />
                    )}
                    <ThemedText style={[styles.unlockButtonText, { color: Colors.dark.success }]}>
                      {isUnlocking[user.id] ? "Unlocking..." : "Unlock SMS Access"}
                    </ThemedText>
                  </TouchableOpacityComponent>
                </View>
              </AnimatedThemedView>
            ))}
          </View>
        )}
      </ThemedScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 16,
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    padding: 32,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  refreshButton: {
    padding: 8,
  },
  errorContainer: {
    padding: 16,
    backgroundColor: Colors.dark.error + "20",
    borderColor: Colors.dark.error,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 8,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  emptyContainer: {
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "500",
    marginTop: 16,
    opacity: 0.7,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.5,
    textAlign: "center",
    marginTop: 8,
  },
  usersList: {
    flex: 1,
  },
  usersListContent: {
    paddingBottom: 16,
  },
  userCard: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderLeftWidth: 4,
    borderLeftColor: Colors.dark.error,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    backgroundColor: Colors.dark.background,
  },
  userHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  userName: {
    fontWeight: "600",
    fontSize: 16,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
  },
  lockoutTime: {
    fontSize: 12,
    opacity: 0.6,
    fontWeight: "500",
  },
  userDetails: {
    marginBottom: 12,
    gap: 4,
  },
  userDetail: {
    fontSize: 14,
    opacity: 0.7,
  },
  userActions: {
    flexDirection: "row",
    gap: 8,
  },
  unlockButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 6,
    flex: 1,
    justifyContent: "center",
  },
  unlockButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
});

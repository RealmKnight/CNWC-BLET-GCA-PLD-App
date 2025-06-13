import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { Stack } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/utils/supabase";
import { router } from "expo-router";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";

type ColorScheme = keyof typeof Colors;

interface SMSCostStats {
  dailyCost: number;
  weeklyCost: number;
  monthlyCost: number;
  dailyCount: number;
  weeklyCount: number;
  monthlyCount: number;
  topUsers: Array<{ name: string; count: number; cost: number; userId: string }>;
  budgetStatus: {
    dailyBudget: number;
    monthlyBudget: number;
    dailySpent: number;
    monthlySpent: number;
    dailyPercentUsed: number;
    monthlyPercentUsed: number;
  };
  divisionBreakdown: Array<{ division: string; count: number; cost: number }>;
}

function SMSCostDashboard() {
  const { session, userRole } = useAuth();
  const colorScheme = (useColorScheme() ?? "light") as ColorScheme;
  const [stats, setStats] = useState<SMSCostStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    checkAdminPermission();
    fetchCostStats();
  }, []);

  const checkAdminPermission = async () => {
    if (!session?.user?.id) return;

    const { data: member } = await supabase.from("members").select("role").eq("id", session.user.id).single();

    if (!member || !["admin", "union_admin", "application_admin"].includes(member.role)) {
      router.replace("/(tabs)/home");
      return;
    }
  };

  const fetchCostStats = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const { data, error } = await supabase.functions.invoke("get-sms-cost-stats");

      if (error) throw error;

      setStats(data);
    } catch (error) {
      console.error("Error fetching SMS cost stats:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    fetchCostStats(true);
  };

  const getBudgetStatusColor = (percentUsed: number) => {
    if (percentUsed >= 90) return "#ff3b30";
    if (percentUsed >= 75) return "#ff9500";
    return "#34c759";
  };

  if (!userRole || !["admin", "union_admin", "application_admin"].includes(userRole)) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>You do not have permission to view this page.</ThemedText>
      </ThemedView>
    );
  }

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading SMS cost statistics...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <ThemedView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          SMS Cost Dashboard
        </ThemedText>

        {/* Cost Overview Cards */}
        <View style={styles.statsGrid}>
          <ThemedView style={[styles.statCard, { backgroundColor: Colors[colorScheme].card }]}>
            <View style={styles.statHeader}>
              <Ionicons name="today" size={24} color={Colors[colorScheme].tint} />
              <ThemedText style={styles.statValue}>${stats?.dailyCost.toFixed(2) || "0.00"}</ThemedText>
            </View>
            <ThemedText style={styles.statLabel}>Today</ThemedText>
            <ThemedText style={styles.statCount}>{stats?.dailyCount || 0} messages</ThemedText>
          </ThemedView>

          <ThemedView style={[styles.statCard, { backgroundColor: Colors[colorScheme].card }]}>
            <View style={styles.statHeader}>
              <Ionicons name="calendar" size={24} color={Colors[colorScheme].tint} />
              <ThemedText style={styles.statValue}>${stats?.weeklyCost.toFixed(2) || "0.00"}</ThemedText>
            </View>
            <ThemedText style={styles.statLabel}>This Week</ThemedText>
            <ThemedText style={styles.statCount}>{stats?.weeklyCount || 0} messages</ThemedText>
          </ThemedView>

          <ThemedView style={[styles.statCard, { backgroundColor: Colors[colorScheme].card }]}>
            <View style={styles.statHeader}>
              <Ionicons name="calendar-outline" size={24} color={Colors[colorScheme].tint} />
              <ThemedText style={styles.statValue}>${stats?.monthlyCost.toFixed(2) || "0.00"}</ThemedText>
            </View>
            <ThemedText style={styles.statLabel}>This Month</ThemedText>
            <ThemedText style={styles.statCount}>{stats?.monthlyCount || 0} messages</ThemedText>
          </ThemedView>
        </View>

        {/* Budget Status */}
        {stats?.budgetStatus && (
          <ThemedView style={[styles.section, { backgroundColor: Colors[colorScheme].card }]}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Budget Status
            </ThemedText>

            <View style={styles.budgetRow}>
              <ThemedText style={styles.budgetLabel}>Daily Budget:</ThemedText>
              <View style={styles.budgetInfo}>
                <ThemedText style={styles.budgetAmount}>
                  ${stats.budgetStatus.dailySpent.toFixed(2)} / ${stats.budgetStatus.dailyBudget.toFixed(2)}
                </ThemedText>
                <ThemedText
                  style={[styles.budgetPercent, { color: getBudgetStatusColor(stats.budgetStatus.dailyPercentUsed) }]}
                >
                  {stats.budgetStatus.dailyPercentUsed.toFixed(1)}%
                </ThemedText>
              </View>
            </View>

            <View style={styles.budgetRow}>
              <ThemedText style={styles.budgetLabel}>Monthly Budget:</ThemedText>
              <View style={styles.budgetInfo}>
                <ThemedText style={styles.budgetAmount}>
                  ${stats.budgetStatus.monthlySpent.toFixed(2)} / ${stats.budgetStatus.monthlyBudget.toFixed(2)}
                </ThemedText>
                <ThemedText
                  style={[styles.budgetPercent, { color: getBudgetStatusColor(stats.budgetStatus.monthlyPercentUsed) }]}
                >
                  {stats.budgetStatus.monthlyPercentUsed.toFixed(1)}%
                </ThemedText>
              </View>
            </View>
          </ThemedView>
        )}

        {/* Top SMS Users */}
        {stats?.topUsers && stats.topUsers.length > 0 && (
          <ThemedView style={[styles.section, { backgroundColor: Colors[colorScheme].card }]}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Top SMS Users (This Month)
            </ThemedText>

            {stats.topUsers.map((user, index) => (
              <View key={user.userId} style={styles.userRow}>
                <View style={styles.userRank}>
                  <ThemedText style={styles.rankNumber}>#{index + 1}</ThemedText>
                </View>
                <View style={styles.userInfo}>
                  <ThemedText style={styles.userName}>{user.name}</ThemedText>
                  <View style={styles.userStats}>
                    <ThemedText style={styles.userCount}>{user.count} SMS</ThemedText>
                    <ThemedText style={styles.userCost}>${user.cost.toFixed(2)}</ThemedText>
                  </View>
                </View>
              </View>
            ))}
          </ThemedView>
        )}

        {/* Division Breakdown */}
        {stats?.divisionBreakdown && stats.divisionBreakdown.length > 0 && (
          <ThemedView style={[styles.section, { backgroundColor: Colors[colorScheme].card }]}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Division Breakdown (This Month)
            </ThemedText>

            {stats.divisionBreakdown.map((division, index) => (
              <View key={division.division} style={styles.divisionRow}>
                <ThemedText style={styles.divisionName}>{division.division}</ThemedText>
                <View style={styles.divisionStats}>
                  <ThemedText style={styles.divisionCount}>{division.count} SMS</ThemedText>
                  <ThemedText style={styles.divisionCost}>${division.cost.toFixed(2)}</ThemedText>
                </View>
              </View>
            ))}
          </ThemedView>
        )}

        {/* Budget Management Button */}
        <TouchableOpacity
          style={[styles.manageBudgetButton, { backgroundColor: Colors[colorScheme].tint }]}
          onPress={() => {
            // Navigate to budget management screen (to be implemented)
            console.log("Navigate to budget management");
          }}
        >
          <Ionicons name="settings" size={20} color="white" />
          <ThemedText style={styles.manageBudgetText}>Manage SMS Budget</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 20,
  },
  title: {
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  statCard: {
    flex: 1,
    minWidth: 150,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  statHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
  },
  statLabel: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 4,
  },
  statCount: {
    fontSize: 12,
    opacity: 0.6,
  },
  section: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  sectionTitle: {
    marginBottom: 16,
  },
  budgetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  budgetLabel: {
    flex: 1,
  },
  budgetInfo: {
    alignItems: "flex-end",
  },
  budgetAmount: {
    fontSize: 14,
    fontWeight: "600",
  },
  budgetPercent: {
    fontSize: 12,
    fontWeight: "bold",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  userRank: {
    width: 40,
    alignItems: "center",
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: "bold",
    opacity: 0.7,
  },
  userInfo: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  userName: {
    flex: 1,
    fontSize: 16,
  },
  userStats: {
    alignItems: "flex-end",
  },
  userCount: {
    fontSize: 14,
    opacity: 0.7,
  },
  userCost: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#007AFF",
  },
  divisionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  divisionName: {
    flex: 1,
    fontSize: 16,
  },
  divisionStats: {
    alignItems: "flex-end",
  },
  divisionCount: {
    fontSize: 14,
    opacity: 0.7,
  },
  divisionCost: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#007AFF",
  },
  manageBudgetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 8,
    marginTop: 10,
  },
  manageBudgetText: {
    color: "white",
    fontWeight: "600",
    marginLeft: 8,
  },
});

export default function Page() {
  return (
    <>
      <Stack.Screen
        options={{
          title: "SMS Cost Dashboard",
          headerShown: true,
        }}
      />
      <SMSCostDashboard />
    </>
  );
}

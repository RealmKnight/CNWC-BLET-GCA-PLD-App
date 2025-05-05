import React, { useState, useEffect, useCallback } from "react";
import { StyleSheet, FlatList, RefreshControl, View } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { supabase } from "@/utils/supabase";
import { Colors } from "@/constants/Colors";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "@/hooks/useColorScheme";
import { AdvertisementCard } from "./AdvertisementCard";
import Toast from "react-native-toast-message";
import { Advertisement } from "@/store/advertisementStore";

interface AdvertisementCampaignsProps {
  onEditAdvertisement: (id: string) => void;
}

export function AdvertisementCampaigns({ onEditAdvertisement }: AdvertisementCampaignsProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [advertisements, setAdvertisements] = useState<
    (Advertisement & {
      start_date: string;
      end_date: string;
    })[]
  >([]);
  const [filter, setFilter] = useState<"all" | "active" | "draft" | "inactive">("all");

  const fetchAdvertisements = useCallback(async () => {
    try {
      setIsLoading(true);

      let query = supabase
        .from("advertisements")
        .select("*")
        .order("updated_at", { ascending: false })
        .eq("is_deleted", false);

      // Apply status filter
      if (filter !== "all") {
        query = query.eq("status", filter);
      }

      const { data, error } = await query;

      if (error) throw error;

      setAdvertisements(data || []);
    } catch (error) {
      console.error("Error fetching advertisements:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to load advertisements",
      });
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchAdvertisements();
  }, [fetchAdvertisements]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAdvertisements();
    setRefreshing(false);
  };

  const handleDeleteAdvertisement = async (id: string) => {
    try {
      const { error } = await supabase.from("advertisements").update({ is_deleted: true }).eq("id", id);

      if (error) throw error;

      // Update state to remove the deleted ad
      setAdvertisements((prev) => prev.filter((ad) => ad.id !== id));

      Toast.show({
        type: "success",
        text1: "Success",
        text2: "Advertisement deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting advertisement:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to delete advertisement",
      });
    }
  };

  const handleStatusChange = async (id: string, status: "draft" | "active" | "inactive") => {
    try {
      const { error } = await supabase.from("advertisements").update({ status }).eq("id", id);

      if (error) throw error;

      // Update state to reflect the status change
      setAdvertisements((prev) => prev.map((ad) => (ad.id === id ? { ...ad, status } : ad)));

      Toast.show({
        type: "success",
        text1: "Success",
        text2: `Advertisement status changed to ${status}`,
      });
    } catch (error) {
      console.error("Error updating advertisement status:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to update advertisement status",
      });
    }
  };

  const renderFilterButton = (
    filterValue: "all" | "active" | "draft" | "inactive",
    label: string,
    icon: keyof typeof Ionicons.glyphMap
  ) => {
    const isActive = filter === filterValue;

    return (
      <ThemedTouchableOpacity
        style={[styles.filterButton, isActive && { backgroundColor: Colors[colorScheme].tint }]}
        onPress={() => setFilter(filterValue)}
      >
        <Ionicons name={icon} size={16} color={isActive ? "#000000" : Colors[colorScheme].text} />
        <ThemedText style={[styles.filterButtonText, isActive && { color: "#000000" }]}>{label}</ThemedText>
      </ThemedTouchableOpacity>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.filterContainer}>
        <View style={styles.filterRow}>
          {renderFilterButton("all", "All", "list")}
          {renderFilterButton("active", "Active", "checkmark-circle")}
          {renderFilterButton("draft", "Draft", "document-outline")}
          {renderFilterButton("inactive", "Inactive", "pause-circle")}
        </View>
      </ThemedView>

      <FlatList
        data={advertisements}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AdvertisementCard
            advertisement={item}
            onEdit={() => onEditAdvertisement(item.id)}
            onDelete={handleDeleteAdvertisement}
            onStatusChange={handleStatusChange}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <ThemedView style={styles.emptyContainer}>
            {isLoading ? (
              <ThemedText>Loading advertisements...</ThemedText>
            ) : (
              <>
                <Ionicons name="alert-circle-outline" size={48} color={Colors[colorScheme].text} />
                <ThemedText style={styles.emptyText}>No advertisements found</ThemedText>
                <ThemedText style={styles.emptySubtext}>
                  {filter !== "all"
                    ? `Try changing the filter or create a new advertisement with "${filter}" status.`
                    : "Create your first advertisement to get started!"}
                </ThemedText>
              </>
            )}
          </ThemedView>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 8,
    backgroundColor: Colors.dark.card,
    color: Colors.dark.buttonText,
  },
  filterButtonText: {
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    backgroundColor: Colors.dark.card,
  },
  emptyContainer: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
    opacity: 0.7,
    marginTop: 8,
  },
});

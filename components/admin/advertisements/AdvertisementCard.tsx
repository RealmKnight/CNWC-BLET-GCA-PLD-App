import React from "react";
import { StyleSheet, TouchableOpacity, Image } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { Ionicons } from "@expo/vector-icons";
import { AdvertisementStatusToggle } from "./AdvertisementStatusToggle";
import { format } from "date-fns";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Advertisement } from "@/store/advertisementStore";

interface AdvertisementCardProps {
  advertisement: Advertisement & {
    start_date: string;
    end_date: string;
  };
  onEdit: () => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: "draft" | "active" | "inactive") => void;
}

export function AdvertisementCard({ advertisement, onEdit, onDelete, onStatusChange }: AdvertisementCardProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  const handleStatusChange = (newStatus: "draft" | "active" | "inactive") => {
    onStatusChange(advertisement.id, newStatus);
  };

  const isActive = new Date() >= new Date(advertisement.start_date) && new Date() <= new Date(advertisement.end_date);

  return (
    <ThemedView style={[styles.container, { backgroundColor: Colors[colorScheme].card }]}>
      <ThemedView style={styles.header}>
        <ThemedText style={styles.title}>{advertisement.title}</ThemedText>
        <AdvertisementStatusToggle
          status={advertisement.status}
          onStatusChange={handleStatusChange}
          disabled={!isActive} // Disable toggling if outside date range
        />
      </ThemedView>

      <ThemedView style={styles.content}>
        {advertisement.image_url && (
          <Image source={{ uri: advertisement.image_url }} style={styles.thumbnail} resizeMode="contain" />
        )}

        <ThemedView style={styles.details}>
          <ThemedText style={styles.description} numberOfLines={2}>
            {advertisement.description}
          </ThemedText>

          <ThemedView style={styles.dateContainer}>
            <ThemedView style={styles.dateItem}>
              <Ionicons name="calendar" size={14} color={Colors[colorScheme].text} />
              <ThemedText style={styles.dateText}>
                {format(new Date(advertisement.start_date), "MMM d, yyyy")} -
                {format(new Date(advertisement.end_date), "MMM d, yyyy")}
              </ThemedText>
            </ThemedView>

            <ThemedText
              style={[
                styles.activeStatus,
                { color: isActive ? Colors[colorScheme].success : Colors[colorScheme].error },
              ]}
            >
              {isActive ? "In Date Range" : "Out of Date Range"}
            </ThemedText>
          </ThemedView>
        </ThemedView>
      </ThemedView>

      <ThemedView style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={onEdit}>
          <Ionicons name="create-outline" size={20} color={Colors[colorScheme].text} />
          <ThemedText style={styles.actionText}>Edit</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => onDelete(advertisement.id)}>
          <Ionicons name="trash-outline" size={20} color={Colors[colorScheme].error} />
          <ThemedText style={[styles.actionText, { color: Colors[colorScheme].error }]}>Delete</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    flex: 1,
    marginRight: 12,
  },
  content: {
    flexDirection: "row",
    padding: 16,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 4,
    marginRight: 16,
  },
  details: {
    flex: 1,
    justifyContent: "space-between",
  },
  description: {
    fontSize: 14,
    marginBottom: 8,
  },
  dateContainer: {
    gap: 4,
  },
  dateItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateText: {
    fontSize: 12,
    opacity: 0.7,
  },
  activeStatus: {
    fontSize: 12,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.1)",
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 8,
  },
  actionText: {
    fontSize: 14,
  },
  deleteButton: {
    borderLeftWidth: 1,
    borderLeftColor: "rgba(128, 128, 128, 0.1)",
  },
});

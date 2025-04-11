import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";

interface DivisionDetails {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  location: string;
}

export default function DivisionDetailsScreen() {
  const { divisionID } = useLocalSearchParams();
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const insets = useSafeAreaInsets();
  const [division, setDivision] = useState<DivisionDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDivisionDetails() {
      try {
        const { data, error } = await supabase.from("divisions").select("*").eq("id", divisionID).single();

        if (error) throw error;

        if (data) {
          setDivision({
            id: data.id,
            name: data.name,
            description: data.description,
            memberCount: data.member_count || 0,
            location: data.location || "N/A",
          });
        }
      } catch (error) {
        console.error("Error fetching division details:", error);
      } finally {
        setIsLoading(false);
      }
    }

    if (divisionID) {
      fetchDivisionDetails();
    }
  }, [divisionID]);

  if (isLoading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ThemedText>Loading division details...</ThemedText>
      </ThemedView>
    );
  }

  if (!division) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ThemedText>Division not found</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedScrollView
      style={[
        styles.container,
        {
          backgroundColor: Colors[colorScheme].background,
          paddingTop: insets.top,
        },
      ]}
      contentContainerStyle={styles.contentContainer}
    >
      <ThemedView style={styles.header}>
        <ThemedText type="title">{division.name}</ThemedText>
        <ThemedText style={styles.location}>{division.location}</ThemedText>
      </ThemedView>

      <ThemedView style={styles.content}>
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">About</ThemedText>
          <ThemedText style={styles.description}>{division.description}</ThemedText>
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Statistics</ThemedText>
          <ThemedText style={styles.stat}>Members: {division.memberCount}</ThemedText>
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Recent Activity</ThemedText>
          <ThemedText style={styles.description}>Recent division activity will be displayed here.</ThemedText>
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Upcoming Events</ThemedText>
          <ThemedText style={styles.description}>Division events and meetings will be listed here.</ThemedText>
        </ThemedView>
      </ThemedView>
    </ThemedScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
  },
  content: {
    gap: 16,
  },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#B4975A",
    gap: 8,
  },
  description: {
    fontSize: 14,
    color: "#666",
  },
  location: {
    fontSize: 16,
    color: "#B4975A",
    marginTop: 4,
  },
  stat: {
    fontSize: 14,
    color: "#666",
  },
});

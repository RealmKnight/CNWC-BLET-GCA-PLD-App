import { StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { NavigationCard } from "@/components/NavigationCard";
import { useAuth } from "@/hooks/useAuth";

interface DivisionDetails {
  id: number;
  name: string;
  location?: string;
  description?: string;
  member_count?: number;
  created_at: string;
}

export default function DivisionDetailsScreen() {
  const { divisionName } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const [division, setDivision] = useState<DivisionDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is authenticated
    if (!session) {
      console.log("[DivisionDetails] No active session, redirecting to login");
      router.replace("/(auth)/login");
      return;
    }

    async function fetchDivisionDetails() {
      try {
        setIsLoading(true);
        setError(null);

        // Always treat divisionName as a string for lookup
        const divisionNameString = String(divisionName).trim();
        console.log("[DivisionDetails] Looking up division by name:", divisionNameString);

        // First get division details
        const { data: divisionData, error: divisionError } = await supabase
          .from("divisions")
          .select("*")
          .eq("name", divisionNameString)
          .limit(1)
          .maybeSingle();

        if (divisionError) {
          console.error("[DivisionDetails] Supabase error:", divisionError);
          throw new Error(divisionError.message);
        }

        if (!divisionData) {
          console.error("[DivisionDetails] Division not found:", divisionNameString);
          throw new Error(`Division ${divisionNameString} not found`);
        }

        // Then get member count
        const { count: memberCount, error: countError } = await supabase
          .from("members")
          .select("*", { count: "exact", head: true })
          .eq("division_id", divisionData.id);

        if (countError) {
          console.error("[DivisionDetails] Error counting members:", countError);
          // Don't throw here, just set count to 0
        }

        console.log("[DivisionDetails] Found division:", { ...divisionData, memberCount });
        setDivision({
          ...divisionData,
          member_count: memberCount || 0,
        });
      } catch (err) {
        console.error("[DivisionDetails] Error fetching division details:", err);
        setError(err instanceof Error ? err.message : "Failed to load division details");
        // Redirect back to home after a delay if there's an error
        setTimeout(() => {
          router.replace("/(tabs)");
        }, 2000);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDivisionDetails();
  }, [divisionName, router, session]);

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading division details...</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
        <ThemedText style={styles.errorSubtext}>Redirecting to home...</ThemedText>
      </ThemedView>
    );
  }

  if (!division) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>Division not found</ThemedText>
        <ThemedText style={styles.errorSubtext}>Redirecting to home...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedScrollView style={styles.container}>
      <ThemedView style={styles.content}>
        <ThemedView style={styles.header}>
          <ThemedText style={styles.title}>Division {division.name}</ThemedText>
          {division.location && <ThemedText style={styles.subtitle}>{division.location}</ThemedText>}
          {division.description && <ThemedText style={styles.description}>{division.description}</ThemedText>}
        </ThemedView>

        <NavigationCard
          title="Members"
          description={`View all ${division.member_count || 0} division members`}
          icon="people"
          href={`/division/${division.name}/members`}
        />
        <NavigationCard
          title="Officers"
          description="View division officers and leadership"
          icon="person-circle"
          href={`/division/${division.name}/officers`}
        />
        <NavigationCard
          title="Meetings"
          description="Access meeting schedules and minutes"
          icon="calendar"
          href={`/division/${division.name}/meetings`}
        />
        <NavigationCard
          title="Documents"
          description="View division documents and bylaws"
          icon="document-text"
          href={`/division/${division.name}/documents`}
        />
        <NavigationCard
          title="Announcements"
          description="View division announcements and updates"
          icon="megaphone"
          href={`/division/${division.name}/announcements`}
        />
      </ThemedView>
    </ThemedScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 8,
    textAlign: "center",
  },
  description: {
    fontSize: 14,
    opacity: 0.8,
    lineHeight: 20,
    textAlign: "center",
  },
  errorText: {
    color: "#FF3B30",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
  },
  errorSubtext: {
    color: "#FF3B30",
    textAlign: "center",
    fontSize: 14,
    marginTop: 8,
    opacity: 0.8,
  },
});

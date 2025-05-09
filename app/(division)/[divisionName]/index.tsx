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
  const [isUUID, setIsUUID] = useState(false);

  // Add a separate effect to handle UUID detection and navigation
  useEffect(() => {
    // Check if divisionName looks like a UUID (which would be a user ID mistakenly routed here)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (divisionName && typeof divisionName === "string" && uuidRegex.test(divisionName)) {
      console.log("[DivisionDetails] UUID detected as division name, likely a profile ID:", divisionName);
      setIsUUID(true);
      // Use setTimeout to ensure navigation happens after component is fully mounted
      setTimeout(() => {
        router.replace("/(tabs)");
      }, 100);
    }
  }, [divisionName, router]);

  useEffect(() => {
    // Check if user is authenticated
    if (!session) {
      console.log("[DivisionDetails] No active session, redirecting to login");
      router.replace("/(auth)/login");
      return;
    }

    // Skip fetching if we detected a UUID
    if (isUUID) {
      return;
    }

    async function fetchDivisionDetails() {
      try {
        setIsLoading(true);
        setError(null);
        setDivision(null); // Reset division state at the start

        // --- Enhanced Validation ---
        if (
          !divisionName ||
          typeof divisionName !== "string" ||
          divisionName.trim() === "" ||
          divisionName === "index"
        ) {
          console.error("[DivisionDetails] Invalid or missing divisionName parameter:", divisionName);
          throw new Error("Invalid division name provided.");
        }

        // Remove the UUID check from here (moved to separate useEffect)

        // Always treat divisionName as a string for lookup AFTER validation
        const divisionNameString = divisionName.trim();
        // ---------------------------

        console.log("[DivisionDetails] Looking up division by name:", divisionNameString);

        // First get division details
        const { data: divisionData, error: divisionError } = await supabase
          .from("divisions")
          .select("*")
          .eq("name", divisionNameString)
          .limit(1)
          .maybeSingle();

        if (divisionError) {
          console.error("[DivisionDetails] Supabase error fetching division:", divisionError);
          // Use a more specific error message if possible
          throw new Error(`Failed to load division details: ${divisionError.message}`);
        }

        if (!divisionData) {
          console.error("[DivisionDetails] Division not found:", divisionNameString);
          throw new Error(`Division '${divisionNameString}' not found`);
        }

        // Then get member count
        const { count: memberCount, error: countError } = await supabase
          .from("members")
          .select("*", { count: "exact", head: true })
          .eq("division_id", divisionData.id);

        if (countError) {
          console.warn("[DivisionDetails] Error counting members:", countError);
          // Non-fatal, just log and proceed with count as 0
        }

        console.log("[DivisionDetails] Found division:", { ...divisionData, member_count: memberCount || 0 });
        setDivision({
          ...divisionData,
          member_count: memberCount || 0,
        });
      } catch (err) {
        console.error("[DivisionDetails] Error in fetchDivisionDetails:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
        // Keep the redirect logic for now, seems intentional
        setTimeout(() => {
          if (router) {
            // Check if router is available
            router.replace("/(tabs)");
          }
        }, 2000);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDivisionDetails();
  }, [divisionName, router, session, isUUID]);

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
          title="Announcements"
          description="View division announcements and updates"
          icon="megaphone"
          href={`/${encodeURIComponent(division.name)}/announcements`}
        />
        <NavigationCard
          title="Meetings"
          description="Access meeting schedules and minutes"
          icon="calendar"
          href={`/${encodeURIComponent(division.name)}/meetings`}
        />
        <NavigationCard
          title="Members"
          description={`View all ${division.member_count || 0} division members`}
          icon="people"
          href={`/${encodeURIComponent(division.name)}/members`}
        />
        <NavigationCard
          title="Officers"
          description="View division officers and leadership"
          icon="person-circle"
          href={`/${encodeURIComponent(division.name)}/officers`}
        />
        <NavigationCard
          title="Documents"
          description="View division documents and bylaws"
          icon="document-text"
          href={`/${encodeURIComponent(division.name)}/documents`}
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

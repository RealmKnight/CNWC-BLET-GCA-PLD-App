import React from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";

interface Officer {
  id: string;
  member_pin: number;
  first_name: string;
  last_name: string;
  phone_number?: string;
  position: string;
  start_date: string;
  end_date?: string;
}

// Helper function to format position display
function formatPosition(position: string): string {
  // Remove underscores and capitalize each word
  return position
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export default function DivisionOfficersScreen() {
  const { divisionName } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const { width } = useWindowDimensions(); // Get current screen width

  const isMobile = width < 768; // Consider screens less than 768px as mobile

  useEffect(() => {
    // Check if user is authenticated
    if (!session) {
      console.log("[DivisionOfficers] No active session, redirecting to login");
      router.replace("/(auth)/login");
      return;
    }

    async function fetchDivisionOfficers() {
      try {
        setIsLoading(true);
        setError(null);

        // --- Validation ---
        if (!divisionName || typeof divisionName !== "string" || divisionName.trim() === "") {
          console.error("[DivisionOfficers] Invalid or missing divisionName parameter:", divisionName);
          throw new Error("Invalid division name provided.");
        }

        const divisionNameString = divisionName.trim();
        console.log("[DivisionOfficers] Looking up officers for division:", divisionNameString);

        // Get all current officers for this division
        const { data, error: officersError } = await supabase
          .from("current_officers")
          .select("id, member_pin, first_name, last_name, phone_number, position, start_date, end_date")
          .eq("division", divisionNameString)
          .order("position");

        if (officersError) {
          console.error("[DivisionOfficers] Supabase error fetching officers:", officersError);
          throw new Error(`Failed to load officers: ${officersError.message}`);
        }

        console.log(`[DivisionOfficers] Found ${data?.length || 0} officers for division ${divisionNameString}`);
        setOfficers(data || []);
      } catch (err) {
        console.error("[DivisionOfficers] Error in fetchDivisionOfficers:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    fetchDivisionOfficers();
  }, [divisionName, router, session]);

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading division officers...</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
        <ThemedText style={styles.errorSubtext}>An error occurred loading officers</ThemedText>
      </ThemedView>
    );
  }

  // Group officers by position type
  const leadershipPositions = [
    "local_chairman",
    "vice_local_chairman",
    "secretary_treasurer",
    "legislative_representative",
  ];
  const leadership = officers.filter((officer) => leadershipPositions.includes(officer.position.toLowerCase()));
  const otherOfficers = officers.filter((officer) => !leadershipPositions.includes(officer.position.toLowerCase()));

  return (
    <ThemedScrollView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText style={styles.title}>Division {divisionName} Officers</ThemedText>
        <ThemedText style={styles.subtitle}>Division Leadership and Representatives</ThemedText>
      </ThemedView>

      {officers.length === 0 ? (
        <ThemedView style={styles.emptyState}>
          <ThemedText style={styles.emptyStateText}>No officers found for this division</ThemedText>
        </ThemedView>
      ) : (
        <>
          {/* Other Officers Section */}
          {otherOfficers.length > 0 && (
            <ThemedView style={styles.sectionContainer}>
              <ThemedText style={styles.sectionTitle}>Officers</ThemedText>

              <ThemedView style={styles.officersContainer}>
                {otherOfficers.map((officer, index) => (
                  <OfficerCard
                    key={officer.id ? officer.id : `officer-${index}`}
                    officer={officer}
                    isMobile={isMobile}
                  />
                ))}
              </ThemedView>
            </ThemedView>
          )}
        </>
      )}
    </ThemedScrollView>
  );
}

// Component for displaying an individual officer
function OfficerCard({ officer, isMobile }: { officer: Officer; isMobile: boolean }) {
  return (
    <ThemedView style={[styles.officerCard, isMobile ? styles.officerCardMobile : styles.officerCardDesktop]}>
      <ThemedView style={styles.officerHeader}>
        <ThemedText style={styles.officerName}>
          {officer.first_name} {officer.last_name}
        </ThemedText>
        <ThemedText style={styles.officerPosition}>{formatPosition(officer.position)}</ThemedText>
      </ThemedView>

      <ThemedView style={styles.officerDetails}>
        {officer.phone_number && (
          <ThemedView style={styles.detailRow}>
            <Ionicons name="call-outline" size={16} color="#666" />
            <ThemedText style={styles.detailText}>{officer.phone_number}</ThemedText>
          </ThemedView>
        )}

        <ThemedView style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={16} color="#666" />
          <ThemedText style={styles.detailText}>Since: {new Date(officer.start_date).toLocaleDateString()}</ThemedText>
        </ThemedView>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 8,
  },
  sectionContainer: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  officersContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  officerCard: {
    padding: 16,
    borderRadius: 8,
    margin: "1%",
    backgroundColor: Colors.dark.card,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  officerCardMobile: {
    width: "98%", // Full width for mobile with margin
  },
  officerCardDesktop: {
    width: "48%", // Half width for desktop
  },
  officerHeader: {
    marginBottom: 12,
    borderRadius: 8,
    padding: 8,
  },
  officerName: {
    fontSize: 18,
    fontWeight: "500",
  },
  officerPosition: {
    fontSize: 16,
    color: Colors.dark.secondary,
    marginTop: 2,
  },
  officerDetails: {
    gap: 8,
    borderRadius: 8,
    padding: 6,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    opacity: 0.8,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyStateText: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.7,
    marginLeft: 16,
    padding: 8,
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

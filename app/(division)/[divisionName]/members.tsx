import { StyleSheet, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  pin_number: number;
  engineer_date: string;
  wc_sen_roster: number;
  current_zone_id: number;
}

interface Zone {
  id: number;
  name: string;
  members: Member[];
}

export default function DivisionMembersScreen() {
  const { divisionName } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [divisionId, setDivisionId] = useState<number | null>(null);
  const { width } = useWindowDimensions(); // Get current screen width

  const isMobile = width < 768; // Consider screens less than 768px as mobile

  useEffect(() => {
    // Check if user is authenticated
    if (!session) {
      console.log("[DivisionMembers] No active session, redirecting to login");
      router.replace("/(auth)/login");
      return;
    }

    async function fetchDivisionMembers() {
      try {
        setIsLoading(true);
        setError(null);

        // --- Validation ---
        if (!divisionName || typeof divisionName !== "string" || divisionName.trim() === "") {
          console.error("[DivisionMembers] Invalid or missing divisionName parameter:", divisionName);
          throw new Error("Invalid division name provided.");
        }

        const divisionNameString = divisionName.trim();
        console.log("[DivisionMembers] Looking up division by name:", divisionNameString);

        // First get division ID
        const { data: divisionData, error: divisionError } = await supabase
          .from("divisions")
          .select("id, name")
          .eq("name", divisionNameString)
          .limit(1)
          .maybeSingle();

        if (divisionError) {
          console.error("[DivisionMembers] Supabase error fetching division:", divisionError);
          throw new Error(`Failed to load division details: ${divisionError.message}`);
        }

        if (!divisionData) {
          console.error("[DivisionMembers] Division not found:", divisionNameString);
          throw new Error(`Division '${divisionNameString}' not found`);
        }

        setDivisionId(divisionData.id);

        // Get all zones for this division
        const { data: zonesData, error: zonesError } = await supabase
          .from("zones")
          .select("id, name")
          .eq("division_id", divisionData.id)
          .order("name");

        if (zonesError) {
          console.error("[DivisionMembers] Supabase error fetching zones:", zonesError);
          throw new Error(`Failed to load zones: ${zonesError.message}`);
        }

        // Get all ACTIVE members for this division
        const { data: membersData, error: membersError } = await supabase
          .from("members")
          .select("id, first_name, last_name, pin_number, engineer_date, wc_sen_roster, current_zone_id")
          .eq("division_id", divisionData.id)
          .eq("status", "ACTIVE") // Only get ACTIVE members
          .order("wc_sen_roster", { ascending: true }); // Order by seniority

        if (membersError) {
          console.error("[DivisionMembers] Supabase error fetching members:", membersError);
          throw new Error(`Failed to load members: ${membersError.message}`);
        }

        // Organize members by zone
        const zonesWithMembers = zonesData.map((zone) => {
          const zoneMembers = membersData.filter((member) => member.current_zone_id === zone.id);
          return {
            ...zone,
            members: zoneMembers,
          };
        });

        console.log(`[DivisionMembers] Found ${membersData.length} members across ${zonesData.length} zones`);
        setZones(zonesWithMembers);
      } catch (err) {
        console.error("[DivisionMembers] Error in fetchDivisionMembers:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    fetchDivisionMembers();
  }, [divisionName, router, session]);

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading division members...</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
        <ThemedText style={styles.errorSubtext}>An error occurred loading members</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedScrollView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText style={styles.title}>Division {divisionName} Members</ThemedText>
        <ThemedText style={styles.subtitle}>Sorted by WC Seniority, Separated by Zone</ThemedText>
      </ThemedView>

      {zones.length === 0 ? (
        <ThemedView style={styles.emptyState}>
          <ThemedText style={styles.emptyStateText}>No members found for this division</ThemedText>
        </ThemedView>
      ) : (
        zones.map((zone) => (
          <ThemedView key={zone.id} style={styles.zoneContainer}>
            <ThemedText style={styles.zoneTitle}>{zone.name}</ThemedText>

            <ThemedView style={styles.membersContainer}>
              {zone.members.length === 0 ? (
                <ThemedText style={styles.emptyZoneText}>No members in this zone</ThemedText>
              ) : (
                zone.members.map((member, index) => (
                  <ThemedView
                    key={member.id ? member.id : `member-${zone.id}-${index}`}
                    style={[styles.memberCard, isMobile ? styles.memberCardMobile : styles.memberCardDesktop]}
                  >
                    <ThemedView style={styles.memberInfo}>
                      <ThemedText style={styles.memberName}>
                        {member.first_name} {member.last_name}
                      </ThemedText>
                      <ThemedView style={styles.memberDetails}>
                        <ThemedText style={styles.memberPin}>PIN: {member.pin_number}</ThemedText>
                        <ThemedText style={styles.memberDate}>
                          Engineer Date:{" "}
                          {member.engineer_date ? new Date(member.engineer_date).toLocaleDateString() : "N/A"}
                        </ThemedText>
                      </ThemedView>
                    </ThemedView>
                  </ThemedView>
                ))
              )}
            </ThemedView>
          </ThemedView>
        ))
      )}
    </ThemedScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    alignItems: "center",
    backgroundColor: Colors.dark.card,
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
  zoneContainer: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  zoneTitle: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 12,
    paddingBottom: 8,
    paddingTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  membersContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  memberCard: {
    padding: 12,
    borderRadius: 8,
    margin: "1%",
    backgroundColor: Colors.dark.card,
    boxShadow: "0 0 10px 0 rgba(0, 0, 0, 0.1)",
    elevation: 1,
  },
  memberCardMobile: {
    width: "98%", // Full width for mobile with margin
  },
  memberCardDesktop: {
    width: "48%", // Half width for desktop
  },
  memberInfo: {
    flex: 1,
    backgroundColor: Colors.dark.card,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "500",
  },
  memberDetails: {
    marginTop: 4,
    width: "auto",
    borderRadius: 8,
    padding: 8,
  },
  memberPin: {
    fontSize: 14,
    opacity: 0.8,
  },
  memberDate: {
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
  emptyZoneText: {
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

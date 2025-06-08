import { StyleSheet, useWindowDimensions, TouchableOpacity, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "@/hooks/useColorScheme";

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  pin_number: number;
  engineer_date: string;
  wc_sen_roster: number;
  dwp_sen_roster: number;
  dmir_sen_roster: number;
  eje_sen_roster: number;
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
  const { session, userRole, member } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [divisionId, setDivisionId] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<string>("wc_sen_roster");
  const [isUpdatingSortOrder, setIsUpdatingSortOrder] = useState(false);
  const [showSortSelector, setShowSortSelector] = useState(false);
  const { width } = useWindowDimensions();
  const colorScheme = useColorScheme() ?? "light";

  const isMobile = width < 768;

  // Check if user can modify division settings
  const canModifyDivisionSettings = () => {
    if (!userRole || !member) return false;

    // Application and union admins can modify any division
    if (userRole === "application_admin" || userRole === "union_admin") {
      return true;
    }

    // Division admins can only modify their own division
    if (userRole === "division_admin" && member.division_id === divisionId) {
      return true;
    }

    return false;
  };

  // Sort order options
  const sortOrderOptions = [
    { label: "Wisconsin Central (WC)", value: "wc_sen_roster" },
    { label: "Duluth, Winnipeg & Pacific (DWP)", value: "dwp_sen_roster" },
    { label: "Duluth, Missabe & Iron Range (DMIR)", value: "dmir_sen_roster" },
    { label: "Elgin, Joliet & Eastern (EJ&E)", value: "eje_sen_roster" },
  ];

  // Helper function to get sort order display name
  const getSortOrderDisplayName = (sortOrder: string) => {
    switch (sortOrder) {
      case "wc_sen_roster":
        return "WC Seniority";
      case "dwp_sen_roster":
        return "DWP Seniority";
      case "dmir_sen_roster":
        return "DMIR Seniority";
      case "eje_sen_roster":
        return "EJ&E Seniority";
      default:
        return "WC Seniority";
    }
  };

  // Helper function to sort members by the specified field
  const sortMembersByField = (members: Member[], field: string) => {
    return [...members].sort((a, b) => {
      const aValue = a[field as keyof Member] as number;
      const bValue = b[field as keyof Member] as number;

      // Handle null/undefined values - put them at the end
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      return aValue - bValue;
    });
  };

  // Function to update sort order
  const updateSortOrder = async (newSortOrder: string) => {
    if (!divisionId || !canModifyDivisionSettings()) return;

    setIsUpdatingSortOrder(true);
    try {
      const { error } = await supabase
        .from("divisions")
        .update({ default_sort_order: newSortOrder })
        .eq("id", divisionId);

      if (error) throw error;

      setSortOrder(newSortOrder);
      setShowSortSelector(false);

      // Re-sort the current zones with the new order
      const updatedZones = zones.map((zone) => ({
        ...zone,
        members: sortMembersByField(zone.members, newSortOrder),
      }));
      setZones(updatedZones);
    } catch (error) {
      console.error("Error updating sort order:", error);
    } finally {
      setIsUpdatingSortOrder(false);
    }
  };

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

        // First get division ID and sort preference
        const { data: divisionData, error: divisionError } = await supabase
          .from("divisions")
          .select("id, name, default_sort_order")
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
        setSortOrder(divisionData.default_sort_order || "wc_sen_roster");

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

        // Get all ACTIVE members for this division with all roster fields
        const { data: membersData, error: membersError } = await supabase
          .from("members")
          .select(
            "id, first_name, last_name, pin_number, engineer_date, wc_sen_roster, dwp_sen_roster, dmir_sen_roster, eje_sen_roster, current_zone_id"
          )
          .eq("division_id", divisionData.id)
          .eq("status", "ACTIVE"); // Only get ACTIVE members

        if (membersError) {
          console.error("[DivisionMembers] Supabase error fetching members:", membersError);
          throw new Error(`Failed to load members: ${membersError.message}`);
        }

        // Organize members by zone and sort within each zone
        const zonesWithMembers = zonesData.map((zone) => {
          const zoneMembers = membersData.filter((member) => member.current_zone_id === zone.id);
          const sortedMembers = sortMembersByField(zoneMembers, divisionData.default_sort_order || "wc_sen_roster");
          return {
            ...zone,
            members: sortedMembers,
          };
        });

        console.log(
          `[DivisionMembers] Found ${membersData.length} members across ${zonesData.length} zones, sorted by ${
            divisionData.default_sort_order || "wc_sen_roster"
          }`
        );
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
        <ThemedView style={styles.titleContainer}>
          <ThemedText style={styles.title}>Division {divisionName} Members</ThemedText>
          <ThemedView style={styles.subtitleContainer}>
            <ThemedText style={styles.subtitle}>
              Sorted by {getSortOrderDisplayName(sortOrder)}, Separated by Zone
            </ThemedText>
          </ThemedView>
        </ThemedView>
        {canModifyDivisionSettings() && (
          <ThemedView style={styles.viewSortButton}>
            <TouchableOpacity
              style={styles.sortButton}
              onPress={() => setShowSortSelector(!showSortSelector)}
              disabled={isUpdatingSortOrder}
            >
              <Ionicons name="swap-vertical" size={20} color={Colors[colorScheme as keyof typeof Colors].tint} />
              <ThemedText style={styles.sortButtonText}>Change Sort</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        )}

        {showSortSelector && canModifyDivisionSettings() && (
          <ThemedView style={styles.sortSelectorContainer}>
            <ThemedText style={styles.sortSelectorTitle}>Select Sort Order:</ThemedText>
            {sortOrderOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.sortOption,
                  sortOrder === option.value && styles.sortOptionSelected,
                  isUpdatingSortOrder && styles.sortOptionDisabled,
                ]}
                onPress={() => !isUpdatingSortOrder && updateSortOrder(option.value)}
                disabled={isUpdatingSortOrder}
              >
                <Ionicons
                  name={sortOrder === option.value ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={
                    sortOrder === option.value
                      ? Colors[colorScheme as keyof typeof Colors].tint
                      : Colors[colorScheme as keyof typeof Colors].text
                  }
                />
                <ThemedText
                  style={[styles.sortOptionText, sortOrder === option.value && styles.sortOptionTextSelected]}
                >
                  {option.label}
                </ThemedText>
              </TouchableOpacity>
            ))}
            {isUpdatingSortOrder && (
              <ThemedView style={styles.updatingIndicator}>
                <ActivityIndicator size="small" color={Colors[colorScheme as keyof typeof Colors].tint} />
                <ThemedText style={styles.updatingText}>Updating sort order...</ThemedText>
              </ThemedView>
            )}
          </ThemedView>
        )}
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  titleContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    borderRadius: 8,
    padding: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
  },
  subtitleContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    marginLeft: 8,
  },
  viewSortButton: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: 8,
  },
  sortButton: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    padding: 8,
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 4,
    color: Colors.dark.tint,
  },
  sortSelectorContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sortSelectorTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  sortOptionSelected: {
    backgroundColor: Colors.dark.card,
  },
  sortOptionDisabled: {
    opacity: 0.5,
  },
  sortOptionText: {
    fontSize: 14,
    marginLeft: 12,
  },
  sortOptionTextSelected: {
    fontWeight: "600",
    color: Colors.dark.tint,
  },
  updatingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  updatingText: {
    fontSize: 14,
    marginLeft: 8,
    opacity: 0.7,
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

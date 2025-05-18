import React from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";

interface GCAMember {
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

export default function GCAOfficersScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<GCAMember[]>([]);
  const { width } = useWindowDimensions(); // Get current screen width

  const isMobile = width < 768; // Consider screens less than 768px as mobile

  useEffect(() => {
    // Check if user is authenticated
    if (!session) {
      console.log("[GCAOfficers] No active session, redirecting to login");
      router.replace("/(auth)/login");
      return;
    }

    async function fetchGCAMembers() {
      try {
        setIsLoading(true);
        setError(null);

        // Placeholder data until gca_members table is created
        // In the future, this will be replaced with a real database query
        const mockMembers: GCAMember[] = [
          {
            id: "1",
            member_pin: 1001,
            first_name: "John",
            last_name: "Doe",
            phone_number: "(555) 123-4567",
            position: "general_chairman",
            start_date: "2023-01-01",
          },
          {
            id: "2",
            member_pin: 1002,
            first_name: "Jane",
            last_name: "Smith",
            phone_number: "(555) 987-6543",
            position: "vice_general_chairman",
            start_date: "2023-02-15",
          },
          {
            id: "3",
            member_pin: 1003,
            first_name: "Michael",
            last_name: "Johnson",
            phone_number: "(555) 456-7890",
            position: "secretary",
            start_date: "2023-03-10",
          },
          {
            id: "4",
            member_pin: 1004,
            first_name: "Sarah",
            last_name: "Williams",
            position: "member",
            start_date: "2023-04-05",
          },
        ];

        setMembers(mockMembers);

        // Future implementation will look like:
        /*
        const { data, error: membersError } = await supabase
          .from("gca_members")
          .select("id, member_pin, first_name, last_name, phone_number, position, start_date, end_date")
          .order("position");

        if (membersError) {
          console.error("[GCAOfficers] Supabase error fetching members:", membersError);
          throw new Error(`Failed to load GCA members: ${membersError.message}`);
        }

        console.log(`[GCAOfficers] Found ${data?.length || 0} GCA members`);
        setMembers(data || []);
        */
      } catch (err) {
        console.error("[GCAOfficers] Error in fetchGCAMembers:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    fetchGCAMembers();
  }, [router, session]);

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading GCA officers and members...</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
        <ThemedText style={styles.errorSubtext}>An error occurred loading GCA officers and members</ThemedText>
      </ThemedView>
    );
  }

  // Group members by position type
  const leadershipPositions = ["general_chairman", "vice_general_chairman", "secretary", "treasurer"];
  const leadership = members.filter((member) => leadershipPositions.includes(member.position.toLowerCase()));
  const regularMembers = members.filter((member) => !leadershipPositions.includes(member.position.toLowerCase()));

  return (
    <ThemedScrollView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText style={styles.title}>GCA Officers and Members</ThemedText>
        <ThemedText style={styles.subtitle}>General Committee of Adjustment</ThemedText>
      </ThemedView>

      {members.length === 0 ? (
        <ThemedView style={styles.emptyState}>
          <ThemedText style={styles.emptyStateText}>No GCA officers or members found</ThemedText>
        </ThemedView>
      ) : (
        <>
          {/* Leadership Section */}
          {leadership.length > 0 && (
            <ThemedView style={styles.sectionContainer}>
              <ThemedText style={styles.sectionTitle}>Leadership</ThemedText>

              <ThemedView style={styles.membersContainer}>
                {leadership.map((member, index) => (
                  <MemberCard key={member.id ? member.id : `member-${index}`} member={member} isMobile={isMobile} />
                ))}
              </ThemedView>
            </ThemedView>
          )}

          {/* Regular Members Section */}
          {regularMembers.length > 0 && (
            <ThemedView style={styles.sectionContainer}>
              <ThemedText style={styles.sectionTitle}>Members</ThemedText>

              <ThemedView style={styles.membersContainer}>
                {regularMembers.map((member, index) => (
                  <MemberCard key={member.id ? member.id : `member-${index}`} member={member} isMobile={isMobile} />
                ))}
              </ThemedView>
            </ThemedView>
          )}
        </>
      )}
    </ThemedScrollView>
  );
}

// Component for displaying an individual member
function MemberCard({ member, isMobile }: { member: GCAMember; isMobile: boolean }) {
  return (
    <ThemedView style={[styles.memberCard, isMobile ? styles.memberCardMobile : styles.memberCardDesktop]}>
      <ThemedView style={styles.memberHeader}>
        <ThemedText style={styles.memberName}>
          {member.first_name} {member.last_name}
        </ThemedText>
        <ThemedText style={styles.memberPosition}>{formatPosition(member.position)}</ThemedText>
      </ThemedView>

      <ThemedView style={styles.memberDetails}>
        {member.phone_number && (
          <ThemedView style={styles.detailRow}>
            <Ionicons name="call-outline" size={16} color="#666" />
            <ThemedText style={styles.detailText}>{member.phone_number}</ThemedText>
          </ThemedView>
        )}

        <ThemedView style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={16} color="#666" />
          <ThemedText style={styles.detailText}>Since: {new Date(member.start_date).toLocaleDateString()}</ThemedText>
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
  membersContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  memberCard: {
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
  memberCardMobile: {
    width: "98%", // Full width for mobile with margin
  },
  memberCardDesktop: {
    width: "48%", // Half width for desktop
  },
  memberHeader: {
    marginBottom: 12,
    borderRadius: 8,
    padding: 8,
  },
  memberName: {
    fontSize: 18,
    fontWeight: "500",
  },
  memberPosition: {
    fontSize: 16,
    color: Colors.dark.secondary,
    marginTop: 2,
  },
  memberDetails: {
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

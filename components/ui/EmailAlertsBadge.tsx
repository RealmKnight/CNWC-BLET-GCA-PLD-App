import React, { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { supabase } from "@/utils/supabase";
import { createRealtimeChannel } from "@/utils/realtime";

interface EmailAlertsBadgeProps {
  divisionFilter?: string; // Optional division filter for division admins
}

export function EmailAlertsBadge({ divisionFilter }: EmailAlertsBadgeProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [alertCount, setAlertCount] = useState(0);

  const fetchAlertCount = async () => {
    try {
      let count = 0;

      // Count email delivery failures (unacknowledged)
      if (divisionFilter) {
        // For division admins, we need to filter by division manually
        // First get the division ID
        const { data: divisionData } = await supabase
          .from("divisions")
          .select("id")
          .eq("name", divisionFilter)
          .single();

        if (divisionData) {
          // Get failures with request and member data
          const { data: failures } = await supabase
            .from("email_tracking")
            .select(
              `
              id,
              fallback_notification_sent,
              request:pld_sdv_requests (
                member:members (
                  division_id
                )
              )
            `
            )
            .in("status", ["failed", "bounced", "complained"])
            .gte("retry_count", 3)
            .eq("fallback_notification_sent", false);

          if (failures) {
            count += failures.filter((failure: any) => failure.request?.member?.division_id === divisionData.id).length;
          }
        }
      } else {
        // For company admins, get all failures
        const { count: failureCount } = await supabase
          .from("email_tracking")
          .select("*", { count: "exact", head: true })
          .in("status", ["failed", "bounced", "complained"])
          .gte("retry_count", 3)
          .eq("fallback_notification_sent", false);

        count += failureCount || 0;
      }

      // Count recent unacknowledged email settings changes (last 24 hours)
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      let auditQuery = supabase
        .from("division_email_audit_log")
        .select("*", { count: "exact", head: true })
        .gte("created_at", twentyFourHoursAgo.toISOString())
        .eq("acknowledged", false); // Only count unacknowledged changes

      if (divisionFilter) {
        const { data: divisionData } = await supabase
          .from("divisions")
          .select("id")
          .eq("name", divisionFilter)
          .single();

        if (divisionData) {
          auditQuery = auditQuery.eq("division_id", divisionData.id);
        }
      }

      const { count: auditCount } = await auditQuery;
      count += auditCount || 0;

      setAlertCount(count);
    } catch (error) {
      console.error("Error fetching email alert count:", error);
      setAlertCount(0);
    }
  };

  useEffect(() => {
    fetchAlertCount();

    // Set up real-time subscription for email tracking changes
    let emailTrackingSubscription: any;
    (async () => {
      emailTrackingSubscription = await createRealtimeChannel("email_alerts_badge");

      emailTrackingSubscription
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "email_tracking",
          },
          () => {
            fetchAlertCount();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "division_email_audit_log",
          },
          () => {
            fetchAlertCount();
          }
        )
        .subscribe();
    })();

    return () => {
      emailTrackingSubscription?.unsubscribe?.();
    };
  }, [divisionFilter]);

  if (alertCount === 0) {
    return null;
  }

  return (
    <View style={styles.badge}>
      <ThemedText style={styles.badgeText}>{alertCount > 99 ? "99+" : alertCount.toString()}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: Colors.light.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Colors.light.background,
  },
  badgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
});

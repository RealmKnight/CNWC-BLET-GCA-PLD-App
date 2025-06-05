import React, { useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  Platform,
  View,
  Modal,
  ScrollView,
  Pressable,
  ViewStyle,
  TextStyle,
  Dimensions,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { format, parseISO } from "date-fns";
import { supabase } from "@/utils/supabase";
import { Tables } from "@/types/supabase";
import Toast from "react-native-toast-message";
import { ActivityIndicator } from "react-native";
import { AuditEventType } from "./constants";

interface PldSdvRequestDetailsProps {
  request:
    | (Tables<"pld_sdv_requests"> & {
        member?: {
          id: string;
          pin_number: number;
          first_name: string | null;
          last_name: string | null;
        };
      })
    | null;
  isVisible: boolean;
  onClose: () => void;
  onRequestUpdated: () => void;
  adminUserId: string;
}

interface AuditEvent {
  timestamp: string;
  type: AuditEventType;
  actor: {
    id: string;
    name: string;
  };
  details: {
    from?: string;
    to?: string;
    reason?: string;
    comment?: string;
  };
}

export function PldSdvRequestDetails({
  request,
  isVisible,
  onClose,
  onRequestUpdated,
  adminUserId,
}: PldSdvRequestDetailsProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [isUpdating, setIsUpdating] = useState(false);
  const [auditTrail, setAuditTrail] = useState<AuditEvent[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const windowHeight = Dimensions.get("window").height;

  // Fetch audit trail when request changes
  useEffect(() => {
    async function fetchAuditTrail() {
      if (!request) return;

      setIsLoadingAudit(true);
      try {
        // Construct audit trail from request data
        const trail: AuditEvent[] = [];

        // Created event
        if (request.created_at) {
          trail.push({
            timestamp: request.created_at,
            type: "created",
            actor: {
              id: "system",
              name: "System",
            },
            details: {},
          });
        }

        // Response event
        if (request.responded_at && request.responded_by) {
          trail.push({
            timestamp: request.responded_at,
            type: "responded",
            actor: {
              id: request.responded_by,
              name: "Admin", // You might want to fetch actual user names
            },
            details: {
              to: request.status,
            },
          });
        }

        // Action event
        if (request.actioned_at && request.actioned_by) {
          trail.push({
            timestamp: request.actioned_at,
            type: "actioned",
            actor: {
              id: request.actioned_by,
              name: "Admin", // You might want to fetch actual user names
            },
            details: {
              to: request.status,
              comment: request.denial_comment || undefined,
            },
          });
        }

        // Sort by timestamp
        trail.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        setAuditTrail(trail);
      } catch (error) {
        console.error("[PldSdvRequestDetails] Error fetching audit trail:", error);
      } finally {
        setIsLoadingAudit(false);
      }
    }

    if (isVisible && request) {
      fetchAuditTrail();
    }
  }, [request, isVisible]);

  // Render audit event
  const renderAuditEvent = (event: AuditEvent) => (
    <View key={event.timestamp} style={styles.auditEvent}>
      <ThemedText style={styles.auditTimestamp}>{format(parseISO(event.timestamp), "MMM d, yyyy HH:mm:ss")}</ThemedText>
      <ThemedText style={styles.auditType}>
        {event.type.charAt(0).toUpperCase() + event.type.slice(1).replace("_", " ")}
      </ThemedText>
      <ThemedText>By: {event.actor.name}</ThemedText>
      {event.details.from && <ThemedText>From: {event.details.from}</ThemedText>}
      {event.details.to && <ThemedText>To: {event.details.to}</ThemedText>}
      {event.details.comment && <ThemedText>Comment: {event.details.comment}</ThemedText>}
    </View>
  );

  const handleStatusUpdate = useCallback(
    async (newStatus: string) => {
      if (!request || !adminUserId) return;

      setIsUpdating(true);
      try {
        const { error } = await supabase
          .from("pld_sdv_requests")
          .update({
            status: newStatus,
            actioned_at: new Date().toISOString(),
            actioned_by: adminUserId,
          })
          .eq("id", request.id);

        if (error) throw error;

        Toast.show({
          type: "success",
          text1: "Request Updated",
          text2: `Request status changed to ${newStatus}`,
        });

        onRequestUpdated();
        onClose();
      } catch (error) {
        console.error("[PldSdvRequestDetails] Error updating request:", error);
        Toast.show({
          type: "error",
          text1: "Update Failed",
          text2: error instanceof Error ? error.message : "Failed to update request",
        });
      } finally {
        setIsUpdating(false);
      }
    },
    [request, adminUserId, onRequestUpdated, onClose]
  );

  if (!request || !isVisible) return null;

  const modalContent = (
    <View style={styles.modalOverlay}>
      <ThemedView style={[styles.modalContent, { maxHeight: windowHeight * 0.8 }]}>
        <ScrollView contentContainerStyle={styles.scrollViewContent}>
          <ThemedText style={styles.title}>Request Details</ThemedText>

          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Member Information</ThemedText>
            <ThemedText>
              Name: {request.member ? `${request.member.last_name}, ${request.member.first_name}` : "Unknown"}
            </ThemedText>
            <ThemedText>PIN: {request.member?.pin_number}</ThemedText>
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Request Information</ThemedText>
            <ThemedText>Type: {request.leave_type}</ThemedText>
            <ThemedText>Date: {format(parseISO(request.request_date), "MMMM d, yyyy")}</ThemedText>
            <ThemedText>Status: {request.status}</ThemedText>
            {request.denial_comment && <ThemedText>Denial Comment: {request.denial_comment}</ThemedText>}
            {request.denial_reason_id && <ThemedText>Denial Reason ID: {request.denial_reason_id}</ThemedText>}
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Audit Trail</ThemedText>
            {isLoadingAudit ? (
              <ActivityIndicator size="small" color={Colors[colorScheme].tint} />
            ) : auditTrail.length > 0 ? (
              auditTrail.map(renderAuditEvent)
            ) : (
              <ThemedText>No audit history available</ThemedText>
            )}
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Actions</ThemedText>
            <View style={styles.actionButtons}>
              {request.status === "pending" && (
                <>
                  <Button
                    onPress={() => handleStatusUpdate("approved")}
                    disabled={isUpdating}
                    style={[styles.actionButton, styles.approveButton]}
                  >
                    <ThemedText style={styles.buttonText}>{isUpdating ? "Approving..." : "Approve"}</ThemedText>
                  </Button>
                  <Button
                    onPress={() => handleStatusUpdate("denied")}
                    disabled={isUpdating}
                    style={[styles.actionButton, styles.denyButton]}
                  >
                    <ThemedText style={styles.buttonText}>{isUpdating ? "Denying..." : "Deny"}</ThemedText>
                  </Button>
                  <Button
                    onPress={() => handleStatusUpdate("waitlisted")}
                    disabled={isUpdating}
                    style={[styles.actionButton, styles.waitlistButton]}
                  >
                    <ThemedText style={styles.buttonText}>{isUpdating ? "Waitlisting..." : "Waitlist"}</ThemedText>
                  </Button>
                </>
              )}
            </View>
          </View>
        </ScrollView>

        <Pressable style={styles.closeButton} onPress={onClose}>
          <ThemedText style={styles.closeButtonText}>Close</ThemedText>
        </Pressable>
      </ThemedView>
    </View>
  );

  return Platform.OS === "web" ? (
    <Modal visible={isVisible} transparent={true} onRequestClose={onClose} animationType="fade">
      {modalContent}
    </Modal>
  ) : (
    <Modal
      visible={isVisible}
      transparent={true}
      onRequestClose={onClose}
      animationType="slide"
      hardwareAccelerated={true}
    >
      {modalContent}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: Platform.OS === "web" ? "80%" : "90%",
    maxWidth: 600,
    borderRadius: 10,
    padding: 20,
  },
  scrollViewContent: {
    paddingBottom: 20,
    backgroundColor: Colors.dark.card,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
    flexWrap: "wrap",
    gap: 10,
  },
  actionButton: {
    minWidth: 120,
    padding: 10,
  },
  approveButton: {
    backgroundColor: Colors.light.success,
  },
  denyButton: {
    backgroundColor: Colors.light.error,
  },
  waitlistButton: {
    backgroundColor: Colors.light.warning,
  },
  buttonText: {
    color: "#fff",
    textAlign: "center",
  },
  closeButton: {
    marginTop: 20,
    padding: 10,
    alignItems: "center",
    backgroundColor: Colors.dark.buttonBackground,
    borderRadius: 8,
  },
  closeButtonText: {
    fontSize: 16,
    color: Colors.dark.buttonText,
  },
  auditEvent: {
    padding: 8,
    borderLeftWidth: 2,
    borderLeftColor: Colors.light.tint,
    marginBottom: 8,
  } as ViewStyle,
  auditTimestamp: {
    fontSize: 12,
    opacity: 0.8,
    marginBottom: 4,
  } as TextStyle,
  auditType: {
    fontWeight: "600",
    marginBottom: 4,
  } as TextStyle,
});

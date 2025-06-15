import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity, Platform } from "react-native";
import Toast from "react-native-toast-message";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/utils/supabase";
import { router } from "expo-router";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";

interface DivisionUser {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
}

export function EmergencySMS() {
  const { session, userRole } = useAuth();
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [message, setMessage] = useState("");
  const [targetUsers, setTargetUsers] = useState<"all" | "division">("division");
  const [divisionUsers, setDivisionUsers] = useState<DivisionUser[]>([]);
  const [sending, setSending] = useState(false);
  const [userDivision, setUserDivision] = useState<string | null>(null);

  useEffect(() => {
    // Fetch division users only for admins that require it
    if (userRole === "division_admin") {
      fetchDivisionUsers();
    }
  }, [userRole]);

  const fetchDivisionUsers = async () => {
    if (!session?.user?.id) return;

    try {
      const { data: adminMember, error } = await supabase
        .from("members")
        .select("division_name")
        .eq("id", session.user.id)
        .single();

      if (error) {
        console.error("Division fetch error:", error);
        return;
      }

      if (adminMember?.division_name) {
        const { data: users } = await supabase
          .from("members")
          .select("id, first_name, last_name, phone")
          .eq("division_name", adminMember.division_name)
          .eq("status", "active")
          .not("phone", "is", null);

        setUserDivision(adminMember.division_name);
        setDivisionUsers(users || []);
      }
    } catch (error) {
      console.error("Error fetching division users:", error);
    }
  };

  const sendEmergencySMS = async () => {
    if (!message.trim()) {
      Toast.show({ type: "error", text1: "Please enter a message" });
      return;
    }

    // Confirmation on web
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        `This will send an emergency SMS that bypasses user preferences and rate limits.\n\nMessage: "${message}"\nTarget: ${
          targetUsers === "all" ? "All users" : "Division users"
        }\n\nAre you sure you want to proceed?`
      );
      if (!confirmed) return;
    }

    await confirmSendEmergencySMS();
  };

  const confirmSendEmergencySMS = async () => {
    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-emergency-sms", {
        body: {
          message,
          targetUsers,
          divisionName: userRole === "division_admin" ? userDivision : undefined,
          adminId: session?.user?.id,
        },
      });

      if (error) throw error;

      Toast.show({
        type: data.failCount > 0 ? "info" : "success",
        text1: `Emergency SMS sent to ${data.sentCount} users. ${data.failCount} failed.`,
      });

      setMessage("");
    } catch (error) {
      console.error("Emergency SMS error:", error);
      Toast.show({ type: "error", text1: "Failed to send emergency SMS" });
    } finally {
      setSending(false);
    }
  };

  if (!userRole || !["union_admin", "application_admin", "division_admin"].includes(userRole)) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Checking permissions...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <ThemedView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Emergency SMS Notification
        </ThemedText>

        {/* Warning */}
        <ThemedView style={[styles.warningCard, { backgroundColor: Colors[colorScheme].card }]}>
          <Ionicons name="warning" size={24} color="#ff6b6b" style={styles.warningIcon} />
          <ThemedText style={styles.warning}>
            This feature bypasses user SMS preferences and rate limits. Use only for genuine emergencies.
          </ThemedText>
        </ThemedView>

        {/* Message */}
        <ThemedView style={styles.formSection}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Emergency Message
          </ThemedText>

          <ThemedTextInput
            style={styles.messageInput}
            placeholder="Enter emergency message..."
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={4}
            maxLength={300}
          />

          <ThemedText style={styles.charCount}>
            {message.length}/300 characters
            {message.length > 160 && (
              <ThemedText style={styles.truncateNote}>
                {"\n"}(Will be truncated in SMS, full message available in app)
              </ThemedText>
            )}
          </ThemedText>
        </ThemedView>

        {/* Target Users */}
        <ThemedView style={styles.formSection}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Target Users
          </ThemedText>

          {(userRole === "union_admin" || userRole === "application_admin") && (
            <TouchableOpacity
              style={[
                styles.targetButton,
                { borderColor: Colors[colorScheme].border },
                targetUsers === "all" && {
                  backgroundColor: Colors[colorScheme].buttonBackground,
                  borderColor: Colors[colorScheme].buttonText,
                },
              ]}
              onPress={() => setTargetUsers("all")}
            >
              <Ionicons
                name={targetUsers === "all" ? "radio-button-on" : "radio-button-off"}
                size={24}
                color={targetUsers === "all" ? Colors[colorScheme].buttonText : Colors[colorScheme].text}
              />
              <ThemedText
                style={{
                  marginLeft: 12,
                  flex: 1,
                  color: targetUsers === "all" ? Colors[colorScheme].buttonText : Colors[colorScheme].text,
                }}
              >
                All Users (System-wide)
              </ThemedText>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.targetButton,
              { borderColor: Colors[colorScheme].border },
              targetUsers === "division" && {
                backgroundColor: Colors[colorScheme].buttonBackground,
                borderColor: Colors[colorScheme].tint,
              },
            ]}
            onPress={() => setTargetUsers("division")}
          >
            <Ionicons
              name={targetUsers === "division" ? "radio-button-on" : "radio-button-off"}
              size={24}
              color={targetUsers === "division" ? Colors[colorScheme].buttonText : Colors[colorScheme].text}
            />
            <ThemedText
              style={{
                marginLeft: 12,
                flex: 1,
                color: targetUsers === "division" ? Colors[colorScheme].buttonText : Colors[colorScheme].text,
              }}
            >
              Division Users ({divisionUsers.length} users)
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>

        {/* Send Button */}
        <TouchableOpacity
          style={[
            styles.sendButton,
            {
              backgroundColor: sending || !message.trim() ? Colors[colorScheme].buttonBackground + "80" : "#ff3b30",
              borderColor: "#ff3b30",
            },
          ]}
          onPress={sendEmergencySMS}
          disabled={sending || !message.trim()}
        >
          <Ionicons name={sending ? "hourglass" : "send"} size={20} color="white" style={styles.sendButtonIcon} />
          <ThemedText style={styles.sendButtonText}>
            {sending ? "Sending Emergency SMS..." : "Send Emergency SMS"}
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 20 },
  title: { marginBottom: 10 },
  warningCard: {
    flexDirection: "row",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ff6b6b",
    alignItems: "flex-start",
  },
  warningIcon: { marginRight: 12, marginTop: 2 },
  warning: { flex: 1, color: "#ff6b6b", fontStyle: "italic", lineHeight: 20 },
  formSection: { gap: 12 },
  sectionTitle: { marginBottom: 8 },
  messageInput: { minHeight: 100, textAlignVertical: "top", padding: 12 },
  charCount: { fontSize: 12, opacity: 0.7 },
  truncateNote: { color: "#ff6b6b", fontStyle: "italic" },
  targetButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 20,
  },
  sendButtonIcon: { marginRight: 8, color: Colors.dark.error },
  sendButtonText: { color: Colors.dark.error, fontWeight: "600", fontSize: 16 },
});

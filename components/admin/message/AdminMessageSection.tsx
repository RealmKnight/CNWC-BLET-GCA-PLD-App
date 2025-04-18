import React, { useState } from "react";
import { StyleSheet, View, Platform, useWindowDimensions, TextInput } from "react-native";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { Button } from "@/components/ui";

// Types for recipient selection
interface RecipientType {
  id: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const RECIPIENT_TYPES: RecipientType[] = [
  {
    id: "division_admins",
    label: "Division Admins",
    description: "Send to all division administrators",
    icon: "people-outline",
  },
  {
    id: "union_admins",
    label: "Union Admins",
    description: "Send to all union administrators",
    icon: "briefcase-outline",
  },
  {
    id: "application_admins",
    label: "Application Admins",
    description: "Send to all application administrators",
    icon: "settings-outline",
  },
];

// Platform-specific message input component
const MessageInput = ({
  value,
  onChangeText,
  style,
  numberOfLines,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  style: any;
  numberOfLines?: number;
  placeholder?: string;
}) => {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const colors = Colors[colorScheme];

  if (Platform.OS === "web") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChangeText(e.target.value)}
        placeholder={placeholder}
        rows={numberOfLines || 8}
        style={{
          ...style,
          fontFamily: "inherit",
          color: colors.text,
          backgroundColor: colors.background,
          width: "100%",
          resize: "vertical",
        }}
      />
    );
  }

  return (
    <ThemedTextInput
      multiline
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      style={style}
      numberOfLines={numberOfLines}
    />
  );
};

export function AdminMessageSection() {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const colors = Colors[colorScheme];
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== "web" || width < 768;

  const [messageText, setMessageText] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);

  // Toggle recipient selection
  const toggleRecipient = (recipientId: string) => {
    setSelectedRecipients((prev) =>
      prev.includes(recipientId) ? prev.filter((id) => id !== recipientId) : [...prev, recipientId]
    );
  };

  // Calculate total recipient count (placeholder for now)
  const totalRecipients = selectedRecipients.length > 0 ? selectedRecipients.length * 5 : 0; // Mock calculation

  // Placeholder for sending message
  const handleSendMessage = () => {
    alert("This feature is coming soon. Message composition saved.");
    setMessageText("");
    setSelectedRecipients([]);
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={[styles.featureNotice, { backgroundColor: colors.tint + "10" }]}>
        <Ionicons name="information-circle-outline" size={24} color={colors.tint} />
        <ThemedText style={styles.noticeText}>
          This feature is coming soon. You can compose messages, but they won't be sent yet.
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Select Recipients</ThemedText>
        <ThemedView style={styles.recipientTypes}>
          {RECIPIENT_TYPES.map((type) => (
            <TouchableOpacity
              key={type.id}
              style={[
                styles.recipientType,
                { backgroundColor: colors.card },
                selectedRecipients.includes(type.id) && { backgroundColor: colors.tint },
              ]}
              onPress={() => toggleRecipient(type.id)}
            >
              <Ionicons
                name={type.icon}
                size={24}
                color={selectedRecipients.includes(type.id) ? colors.buttonText : colors.icon}
              />
              <ThemedView style={styles.recipientTextContainer}>
                <ThemedText
                  style={[styles.recipientLabel, selectedRecipients.includes(type.id) && { color: colors.buttonText }]}
                >
                  {type.label}
                </ThemedText>
                <ThemedText
                  style={[
                    styles.recipientDescription,
                    { color: colors.textDim },
                    selectedRecipients.includes(type.id) && { color: colors.buttonText, opacity: 0.9 },
                  ]}
                >
                  {type.description}
                </ThemedText>
              </ThemedView>
            </TouchableOpacity>
          ))}
        </ThemedView>

        {selectedRecipients.length > 0 && (
          <ThemedView style={styles.recipientCount}>
            <ThemedText>Total recipients: {totalRecipients}</ThemedText>
          </ThemedView>
        )}
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Compose Message</ThemedText>
        <MessageInput
          placeholder="Type your message here..."
          value={messageText}
          onChangeText={setMessageText}
          style={{
            ...styles.messageInput,
            borderColor: colors.border,
          }}
          numberOfLines={isMobile ? 6 : 8}
        />
      </ThemedView>

      <View style={styles.actionsContainer}>
        <Button onPress={handleSendMessage} disabled={messageText.trim() === "" || selectedRecipients.length === 0}>
          Send Message
        </Button>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 24,
  },
  featureNotice: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    gap: 12,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
  },
  section: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  recipientTypes: {
    gap: 12,
  },
  recipientType: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    gap: 12,
  },
  recipientTextContainer: {
    flex: 1,
  },
  recipientLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  recipientDescription: {
    fontSize: 14,
    opacity: 0.7,
  },
  recipientCount: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: 8,
  },
  messageInput: {
    height: 200,
    textAlignVertical: "top",
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  actionsContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
    marginTop: 16,
  },
});

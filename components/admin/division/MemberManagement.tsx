import React, { useState, useCallback } from "react";
import { StyleSheet, Platform, Pressable } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { MemberList } from "./MemberList";

type MemberAction = "list" | "add" | "edit";

interface Member {
  first_name: string;
  last_name: string;
  pin_number: string | number;
  division: string;
}

export function MemberManagement() {
  const [currentAction, setCurrentAction] = useState<MemberAction>("list");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;

  const handleEditMember = useCallback((member: Member) => {
    setSelectedMember(member);
    setCurrentAction("edit");
  }, []);

  const triggerRefresh = () => {
    setRefreshKey((prevKey) => prevKey + 1);
    setCurrentAction("list");
  };

  const ButtonComponent = Platform.OS === "web" ? Pressable : TouchableOpacity;

  const renderActionButtons = () => (
    <ThemedView style={styles.actionButtons}>
      <ButtonComponent
        style={[styles.actionButton, currentAction === "list" && styles.activeButton]}
        onPress={() => setCurrentAction("list")}
      >
        <Ionicons name="list" size={24} color={currentAction === "list" ? "#000000" : tintColor} />
        <ThemedText style={[styles.buttonText, currentAction === "list" && styles.activeText]}>Member List</ThemedText>
      </ButtonComponent>

      <ButtonComponent
        style={[styles.actionButton, currentAction === "add" && styles.activeButton]}
        onPress={() => setCurrentAction("add")}
      >
        <Ionicons name="person-add" size={24} color={currentAction === "add" ? "#000000" : tintColor} />
        <ThemedText style={[styles.buttonText, currentAction === "add" && styles.activeText]}>Add Member</ThemedText>
      </ButtonComponent>
    </ThemedView>
  );

  const renderContent = () => {
    switch (currentAction) {
      case "list":
        return (
          <ThemedView style={styles.contentContainer}>
            <MemberList onEditMember={handleEditMember} refreshTrigger={refreshKey} />
          </ThemedView>
        );
      case "add":
        return (
          <ThemedView style={styles.contentContainer}>
            <ThemedText type="subtitle">Add New Member</ThemedText>
            {/* TODO: Implement add member form and call triggerRefresh on success */}
          </ThemedView>
        );
      case "edit":
        return (
          <ThemedView style={styles.contentContainer}>
            <ThemedText type="subtitle">Edit Member</ThemedText>
            {selectedMember && (
              <ThemedText>
                Editing: {selectedMember.first_name} {selectedMember.last_name}
              </ThemedText>
            )}
            {/* TODO: Implement edit member form and call triggerRefresh on success */}
          </ThemedView>
        );
      default:
        return null;
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Member Management</ThemedText>
      </ThemedView>
      {renderActionButtons()}
      {renderContent()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  header: {
    marginBottom: 24,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.light.tint,
    ...(Platform.OS === "web"
      ? {
          cursor: "pointer",
        }
      : {}),
  },
  activeButton: {
    backgroundColor: Colors.light.tint,
  },
  buttonText: {
    fontSize: 16,
  },
  activeText: {
    color: "#000000",
  },
  contentContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    minHeight: 0,
    overflow: Platform.OS === "web" ? "hidden" : undefined,
  },
});

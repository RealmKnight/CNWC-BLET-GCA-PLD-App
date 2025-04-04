import React from "react";
import { StyleSheet, View, Platform } from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { AssignOfficerPosition } from "@/components/admin/division/AssignOfficerPosition";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useOfficerPositions } from "@/hooks/useOfficerPositions";
import { OfficerPosition } from "@/types/officers";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AssignOfficerScreen() {
  const { position, division } = useLocalSearchParams<{
    position: string;
    division: string;
  }>();
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { fetchCurrentOfficers } = useOfficerPositions({ division: division || "" });

  const handleAssign = () => {
    fetchCurrentOfficers();
    router.back();
  };

  const handleClose = () => {
    router.back();
  };

  if (!position || !division) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <ThemedView style={styles.container}>
          <ThemedText>Missing required parameters</ThemedText>
          <TouchableOpacityComponent onPress={handleClose} style={styles.closeButton}>
            <ThemedText>Close</ThemedText>
          </TouchableOpacityComponent>
        </ThemedView>
      </SafeAreaView>
    );
  }

  // Configure the screen for modal presentation
  if (Platform.OS !== "web") {
    return (
      <>
        <Stack.Screen
          options={{
            title: position,
            presentation: "modal",
            headerLeft: () => (
              <TouchableOpacityComponent onPress={handleClose}>
                <ThemedText style={styles.headerButton}>Cancel</ThemedText>
              </TouchableOpacityComponent>
            ),
          }}
        />
        <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
          <AssignOfficerPosition
            position={position as OfficerPosition}
            division={division}
            onAssign={handleAssign}
            onCancel={handleClose}
            visible={true}
          />
        </SafeAreaView>
      </>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacityComponent onPress={handleClose} style={styles.closeButton}>
            <ThemedView style={styles.closeButtonInner}>
              <Ionicons name="close" size={24} color={Colors[colorScheme].text} />
              <ThemedText style={styles.closeButtonText}>Close</ThemedText>
            </ThemedView>
          </TouchableOpacityComponent>
          <ThemedText type="subtitle" style={styles.title}>
            {position}
          </ThemedText>
          <View style={styles.closeButton} />
        </View>

        <View style={styles.content}>
          <AssignOfficerPosition
            position={position as OfficerPosition}
            division={division}
            onAssign={handleAssign}
            onCancel={handleClose}
            visible={true}
          />
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    flex: 1,
  },
  closeButton: {
    width: Platform.OS === "ios" ? 80 : 70,
    justifyContent: "center",
  },
  closeButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: 20,
    justifyContent: "center",
  },
  closeButtonText: {
    marginLeft: 4,
    fontSize: 16,
  },
  content: {
    flex: 1,
  },
  headerButton: {
    fontSize: 17,
    color: Colors.light.tint,
    marginLeft: 8,
  },
});

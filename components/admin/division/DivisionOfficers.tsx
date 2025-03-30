import React, { useState } from "react";
import { StyleSheet, Platform, Modal, useWindowDimensions, ScrollView, Pressable, View } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInUp,
  SlideOutDown,
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { PanGestureHandler, PanGestureHandlerGestureEvent } from "react-native-gesture-handler";
import { AssignOfficerPosition } from "./AssignOfficerPosition";
import { useOfficerPositions } from "@/hooks/useOfficerPositions";
import { router } from "expo-router";

const AnimatedThemedView = Animated.createAnimatedComponent(ThemedView);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacityComponent);

// Define required and optional officer positions
const REQUIRED_POSITIONS = [
  "President",
  "Vice-President",
  "Secretary/Treasurer",
  "Alternate Secretary/Treasurer",
  "Legislative Representative",
  "Alternate Legislative Representative",
  "Local Chairman",
  "First Vice-Local Chairman",
  "Second Vice-Local Chairman",
  "Guide",
  "Chaplain",
  "Delegate to the National Division",
  "First Alternate Delegate to the National Division",
  "Second Alternate Delegate to the National Division",
  "First Trustee",
  "Second Trustee",
  "Third Trustee",
  "First Alternate Trustee",
  "Second Alternate Trustee",
  "Third Alternate Trustee",
] as const;

const OPTIONAL_POSITIONS = [
  "Third Vice-Local Chairman",
  "Fourth Vice-Local Chairman",
  "Fifth Vice-Local Chairman",
] as const;

type RequiredPosition = (typeof REQUIRED_POSITIONS)[number];
type OptionalPosition = (typeof OPTIONAL_POSITIONS)[number];
type OfficerPosition = RequiredPosition | OptionalPosition;

interface Officer {
  position: OfficerPosition;
  memberId: string;
  memberName: string;
  startDate: string;
  isRequired: boolean;
}

const isWeb = Platform.OS === "web";

type GestureContext = {
  y: number;
};

interface DivisionOfficersProps {
  division: string;
}

export function DivisionOfficers({ division }: DivisionOfficersProps) {
  const [selectedPosition, setSelectedPosition] = useState<OfficerPosition | null>(null);
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;
  const { width } = useWindowDimensions();
  const { fetchCurrentOfficers } = useOfficerPositions({ division });

  const handlePositionPress = (position: OfficerPosition) => {
    setSelectedPosition(position);
    if (!isWeb) {
      router.push({
        pathname: "/assign-officer",
        params: {
          position,
          division,
        },
      });
    }
  };

  const renderPositionList = () => (
    <ScrollView
      style={styles.positionListScroll}
      contentContainerStyle={styles.positionListContent}
      showsVerticalScrollIndicator={true}
    >
      <ThemedText type="subtitle">Required Positions</ThemedText>
      {REQUIRED_POSITIONS.map((position) => (
        <TouchableOpacityComponent
          key={position}
          style={[styles.positionItem, selectedPosition === position && styles.selectedPosition]}
          onPress={() => handlePositionPress(position)}
        >
          <ThemedText style={[styles.positionText, selectedPosition === position && styles.selectedPositionText]}>
            {position}
          </ThemedText>
          <Ionicons
            name={isWeb ? "chevron-forward" : "chevron-down"}
            size={20}
            color={selectedPosition === position ? "#fff" : Colors[colorScheme].text}
          />
        </TouchableOpacityComponent>
      ))}

      <ThemedText type="subtitle" style={styles.optionalTitle}>
        Optional Positions
      </ThemedText>
      {OPTIONAL_POSITIONS.map((position) => (
        <TouchableOpacityComponent
          key={position}
          style={[styles.positionItem, selectedPosition === position && styles.selectedPosition]}
          onPress={() => handlePositionPress(position)}
        >
          <ThemedText style={[styles.positionText, selectedPosition === position && styles.selectedPositionText]}>
            {position}
          </ThemedText>
          <Ionicons
            name={isWeb ? "chevron-forward" : "chevron-down"}
            size={20}
            color={selectedPosition === position ? "#fff" : Colors[colorScheme].text}
          />
        </TouchableOpacityComponent>
      ))}
    </ScrollView>
  );

  const renderPositionDetails = () => {
    if (!selectedPosition) {
      return (
        <ThemedView style={styles.detailsPlaceholder}>
          <ThemedText>Select a position to view or edit its details</ThemedText>
        </ThemedView>
      );
    }

    return (
      <ScrollView style={styles.positionDetailsScroll}>
        <AnimatedThemedView entering={FadeIn} exiting={FadeOut} style={styles.positionDetails}>
          <ThemedText type="subtitle">{selectedPosition}</ThemedText>
          <AssignOfficerPosition
            position={selectedPosition}
            division={division}
            onAssign={() => {
              // Refresh the officers list
              fetchCurrentOfficers();
              // Clear the selection if on mobile
              if (!isWeb) {
                setSelectedPosition(null);
              }
            }}
            onCancel={() => {
              if (!isWeb) {
                setSelectedPosition(null);
              }
            }}
          />
        </AnimatedThemedView>
      </ScrollView>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Division Officers</ThemedText>
      </ThemedView>
      <ThemedView style={styles.content}>
        {renderPositionList()}
        {isWeb && renderPositionDetails()}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginBottom: 24,
  },
  content: {
    flex: 1,
    flexDirection: isWeb ? "row" : "column",
    gap: 24,
  },
  positionListScroll: {
    flex: isWeb ? undefined : 1,
    width: isWeb ? 300 : "100%",
  },
  positionListContent: {
    padding: 16,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
  },
  positionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 8,
    marginVertical: 4,
    backgroundColor: Colors.light.background,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  selectedPosition: {
    backgroundColor: Colors.light.tint,
  },
  positionText: {
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
  selectedPositionText: {
    color: "#fff",
  },
  optionalTitle: {
    marginTop: 24,
    marginBottom: 8,
  },
  positionDetailsScroll: {
    flex: 1,
  },
  positionDetails: {
    flex: 1,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 20,
  },
  detailsPlaceholder: {
    flex: 1,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },
});

import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { NavigationCard } from "@/components/NavigationCard";

type ColorSchemeName = keyof typeof Colors;

export default function RostersScreen() {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;

  return (
    <ThemedScrollView style={styles.container}>
      <ThemedView style={styles.content}>
        <NavigationCard
          title="Extra Board"
          description="View and manage extra board assignments and rotations"
          icon="list"
          href="/(rosters)/extra-board"
        />
        <NavigationCard
          title="Regular Assignments"
          description="Access regular job assignments and schedules"
          icon="calendar"
          href="/(rosters)/regular"
        />
        <NavigationCard
          title="Vacation Schedule"
          description="View and request vacation time"
          icon="sunny"
          href="/(rosters)/vacation"
        />
        <NavigationCard
          title="Time Claims"
          description="Submit and track time claims"
          icon="time"
          href="/(rosters)/time-claims"
        />
        <NavigationCard
          title="Schedule Changes"
          description="View recent and upcoming schedule changes"
          icon="git-compare"
          href="/(rosters)/changes"
        />
      </ThemedView>
    </ThemedScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
  },
});

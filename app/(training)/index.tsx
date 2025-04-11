import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { NavigationCard } from "@/components/NavigationCard";

export default function TrainingScreen() {
  return (
    <ThemedScrollView style={styles.container}>
      <ThemedView style={styles.content}>
        <NavigationCard
          title="Required Training"
          description="View and complete required training modules"
          icon="checkmark-circle"
          href="/(training)/required"
        />
        <NavigationCard
          title="Optional Courses"
          description="Browse additional training opportunities"
          icon="school"
          href="/(training)/optional"
        />
        <NavigationCard
          title="My Certifications"
          description="Track your training certifications"
          icon="ribbon"
          href="/(training)/certifications"
        />
        <NavigationCard
          title="Training Calendar"
          description="View upcoming training sessions"
          icon="calendar"
          href="/(training)/calendar"
        />
        <NavigationCard
          title="Training Resources"
          description="Access training materials and guides"
          icon="document-text"
          href="/(training)/resources"
        />
        <NavigationCard
          title="Training History"
          description="View your completed training records"
          icon="time"
          href="/(training)/history"
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

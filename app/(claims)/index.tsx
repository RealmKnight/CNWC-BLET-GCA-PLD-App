import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { NavigationCard } from "@/components/NavigationCard";

export default function ClaimsScreen() {
  return (
    <ThemedScrollView style={styles.container}>
      <ThemedView style={styles.content}>
        <NavigationCard
          title="File New Claim"
          description="Submit a new claim or grievance"
          icon="add-circle"
          href="/(claims)/new"
        />
        <NavigationCard
          title="My Claims"
          description="View and track your submitted claims"
          icon="folder"
          href="/(claims)/my-claims"
        />
        <NavigationCard
          title="Time Claims"
          description="Submit and track time-related claims"
          icon="time"
          href="/(claims)/time"
        />
        <NavigationCard
          title="Contract Violations"
          description="Report and track contract violations"
          icon="alert-circle"
          href="/(claims)/violations"
        />
        <NavigationCard
          title="Claim Resources"
          description="Access guides and resources for filing claims"
          icon="information-circle"
          href="/(claims)/resources"
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

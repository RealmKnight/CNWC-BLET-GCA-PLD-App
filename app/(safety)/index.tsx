import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { NavigationCard } from "@/components/NavigationCard";

export default function SafetyScreen() {
  return (
    <ThemedScrollView style={styles.container}>
      <ThemedView style={styles.content}>
        <NavigationCard
          title="Report Safety Issue"
          description="Submit a new safety concern or hazard report"
          icon="warning"
          href="/(safety)/report"
        />
        <NavigationCard
          title="My Reports"
          description="View and track your submitted safety reports"
          icon="folder"
          href="/(safety)/my-reports"
        />
        <NavigationCard
          title="Safety Alerts"
          description="View current safety alerts and notices"
          icon="alert-circle"
          href="/(safety)/alerts"
        />
        <NavigationCard
          title="Safety Resources"
          description="Access safety guidelines and procedures"
          icon="information-circle"
          href="/(safety)/resources"
        />
        <NavigationCard
          title="Safety Committee"
          description="Contact safety committee members"
          icon="people"
          href="/(safety)/committee"
        />
        <NavigationCard
          title="Safety Statistics"
          description="View safety performance metrics"
          icon="stats-chart"
          href="/(safety)/statistics"
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

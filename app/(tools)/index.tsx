import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { NavigationCard } from "@/components/NavigationCard";

export default function ToolsScreen() {
  return (
    <ThemedScrollView style={styles.container}>
      <ThemedView style={styles.content}>
        <NavigationCard
          title="Pay Calculator"
          description="Calculate pay rates and overtime"
          icon="calculator"
          href="/(tools)/pay-calculator"
        />
        <NavigationCard
          title="Duty Hours"
          description="Track and calculate duty hours"
          icon="time"
          href="/(tools)/duty-hours"
        />
        <NavigationCard
          title="Rule Book"
          description="Access the digital rule book"
          icon="book"
          href="/(tools)/rule-book"
        />
        <NavigationCard
          title="Forms"
          description="Access and submit common forms"
          icon="document-text"
          href="/(tools)/forms"
        />
        <NavigationCard
          title="Important Links"
          description="Quick access to important websites"
          icon="link"
          href="/(tools)/links"
        />
        <NavigationCard
          title="Contact Directory"
          description="Important contact information"
          icon="call"
          href="/(tools)/contacts"
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

import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { NavigationCard } from "@/components/NavigationCard";

export default function AgreementsScreen() {
  return (
    <ThemedScrollView style={styles.container}>
      <ThemedView style={styles.content}>
        <NavigationCard
          title="Current Agreement"
          description="View the current collective bargaining agreement"
          icon="document-text"
          href="/(agreements)/current"
        />
        <NavigationCard
          title="Local Agreements"
          description="Access division-specific agreements and memorandums"
          icon="file-tray-full"
          href="/(agreements)/local"
        />
        <NavigationCard
          title="Side Letters"
          description="View side letters and supplemental agreements"
          icon="mail"
          href="/(agreements)/side-letters"
        />
        <NavigationCard
          title="Historical Agreements"
          description="Access archive of past agreements and changes"
          icon="time"
          href="/(agreements)/historical"
        />
        {/* <NavigationCard
          title="Agreement Updates"
          description="View recent changes and updates to agreements"
          icon="git-compare"
          href="/(agreements)/updates"
        /> */}
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

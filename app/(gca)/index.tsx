import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { NavigationCard } from "@/components/NavigationCard";

export default function GCAScreen() {
  return (
    <ThemedScrollView style={styles.container}>
      <ThemedView style={styles.content}>
        <NavigationCard
          title="Announcements"
          description="Important GCA announcements and updates"
          icon="megaphone"
          href="/(gca)/announcements"
        />
        <NavigationCard
          title="Documents"
          description="View general GCA documents and resources"
          icon="document-text"
          href="/(gca)/documents"
        />
        <NavigationCard
          title="Meeting Minutes"
          description="Access GCA meeting minutes and notes"
          icon="document-text"
          href="/(gca)/minutes"
        />
        <NavigationCard
          title="GCA Officers and Members"
          description="Contact information for GCA officers and members"
          icon="people"
          href="/(gca)/gca-officers"
        />
        <NavigationCard title="Bylaws" description="View GCA bylaws and regulations" icon="book" href="/(gca)/bylaws" />
        <NavigationCard
          title="Contact GCA"
          description="Get in touch with GCA representatives"
          icon="mail"
          href="/(gca)/contact"
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

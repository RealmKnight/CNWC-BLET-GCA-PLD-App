import { Image, StyleSheet, Platform } from "react-native";
import ParallaxScrollView from "@/components/ParallaxScrollView";
import { ThemedView } from "@/components/ThemedView";
import { NavigationCard } from "@/components/NavigationCard";

export default function HomeScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: "#A1CEDC", dark: "#000000FF" }}
      headerImage={<Image source={require("@/assets/images/BLETblackgold.png")} style={styles.reactLogo} />}
    >
      <ThemedView style={styles.container}>
        <ThemedView style={styles.cardContainer}>
          <NavigationCard
            title="My Division"
            description="View and manage your division information, officers, and members"
            icon="people"
            href="/division"
          />
          <NavigationCard
            title="Rosters"
            description="Access and manage division rosters and schedules"
            icon="calendar"
            href="/rosters"
          />
          <NavigationCard
            title="Agreements"
            description="View and search through union agreements and contracts"
            icon="document-text"
            href="/agreements"
          />
          <NavigationCard
            title="Claims"
            description="File and track claims and grievances"
            icon="file-tray-full"
            href="/claims"
          />
          <NavigationCard title="GCA" description="Access GCA resources and information" icon="business" href="/gca" />
          <NavigationCard
            title="Tools & Links"
            description="Access helpful tools and important links"
            icon="construct"
            href="/tools"
          />
          <NavigationCard
            title="Safety"
            description="Report safety concerns and access safety resources"
            icon="shield-checkmark"
            href="/safety"
          />
          <NavigationCard
            title="Training"
            description="Access training materials and resources"
            icon="school"
            href="/training"
          />
        </ThemedView>
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    alignItems: "center",
  },
  cardContainer: {
    width: "100%",
    maxWidth: Platform.OS === "web" ? 1280 : "100%",
    paddingVertical: 16,
    gap: 12,
  },
  reactLogo: {
    width: 180,
    height: 226,
    position: "absolute",
    top: 10,
    left: "50%",
    transform: [{ translateX: -90 }],
  },
});

import React from "react";
import { Image, StyleSheet, Platform } from "react-native";
import ParallaxScrollView from "@/components/ParallaxScrollView";
import { ThemedView } from "@/components/ThemedView";
import { NavigationCard } from "@/components/NavigationCard";
import { useAuth } from "@/hooks/useAuth";
import { useUserStore } from "@/store/userStore";
import { ThemedText } from "@/components/ThemedText";
import { HelloWave } from "@/components/HelloWave";
import { Colors } from "@/constants/Colors";
import { AdvertisementBanner } from "@/components/AdvertisementBanner";

export default function HomeScreen() {
  const { member } = useAuth();
  const division = useUserStore((state) => state.division);

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: "#A1CEDC", dark: Colors.dark.card }}
      headerImage={
        <ThemedView style={styles.headerContainer}>
          <Image source={require("@/assets/images/BLETblackgold.png")} style={styles.reactLogo} />
          <AdvertisementBanner location="home" style={styles.adBanner} maxHeight={70} />
        </ThemedView>
      }
    >
      <ThemedView style={styles.container}>
        <ThemedView style={styles.cardContainer}>
          <ThemedView style={styles.welcomeContainer}>
            <HelloWave />
            <ThemedText style={styles.welcomeText}>
              {member?.first_name ? `Hello, ${member.first_name}!` : "Welcome!"}
            </ThemedText>
          </ThemedView>

          {!division && (
            <ThemedText style={styles.noticeText}>
              You aren't assigned to a division. Contact your local chairman to get set up.
            </ThemedText>
          )}

          <NavigationCard
            title="GCA/Local Profile"
            description="View your GCA and local information"
            icon="people"
            href="/(gca)/profile"
          />

          <NavigationCard
            title="Division Calendar"
            description="View and manage your division calendar"
            icon="calendar"
            href="/(division)/calendar"
          />

          <NavigationCard
            title="Time Management"
            description="Vacation and personal leave management"
            icon="time"
            href="/(tabs)/mytime"
          />

          <NavigationCard title="Tools" description="Helpful BLET tools and calculators" icon="build" href="/(tools)" />

          <NavigationCard
            title="Safety"
            description="Report safety issues and concerns"
            icon="shield-checkmark"
            href="/(safety)"
          />

          <NavigationCard
            title="Training"
            description="Access training materials and resources"
            icon="school"
            href="/(training)"
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
  headerContainer: {
    width: "100%",
    height: 250,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    backgroundColor: Colors.dark.card,
  },
  reactLogo: {
    width: 120,
    height: 150,
    backgroundColor: Colors.dark.card,
  },
  adBanner: {
    width: 640,
    backgroundColor: Colors.dark.card,
    maxHeight: 70,
  },
  welcomeContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    width: "100%",
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: "bold",
    marginLeft: 8,
  },
  noticeText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 16,
    color: Colors.dark.disabled,
  },
});

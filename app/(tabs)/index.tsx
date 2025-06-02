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
import { AnnouncementBadge } from "@/components/ui/AnnouncementBadge";
import { useBadgeStore } from "@/store/badgeStore";

export default function HomeScreen() {
  const { member } = useAuth();
  const division = useUserStore((state) => state.division);
  const announcementUnreadCount = useBadgeStore((state) => state.announcementUnreadCount);

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
            <ThemedText style={styles.welcomeText}>Welcome, {member?.first_name}</ThemedText>
          </ThemedView>
          <ThemedText style={styles.noticeText}>
            The links below "Agreements" are only placeholders for future functionality of the app. They work, but the
            subsequent links on the pages they lead to do not.
          </ThemedText>
          <NavigationCard
            title="My Division"
            description="View your division information, officers, and members"
            icon="people"
            href={division ? `/(division)/${division}` : "/(division)"}
            badge={
              <AnnouncementBadge
                targetType="division"
                divisionId={member?.division_id || undefined}
                color={Colors.dark.announcementBadgeDivision}
              />
            }
          />
          <NavigationCard
            title="Rosters"
            description="Access division rosters and schedules"
            icon="calendar"
            href="/(rosters)"
          />
          <NavigationCard
            title="GCA"
            description="Access GCA resources and information"
            icon="business"
            href="/(gca)"
            badge={<AnnouncementBadge targetType="gca" color={Colors.dark.announcementBadgeGCA} />}
          />
          <NavigationCard
            title="Agreements"
            description="View and search through union agreements and contracts"
            icon="document-text"
            href="/(agreements)"
          />
          <NavigationCard
            title="Claims"
            description="File and track claims and grievances"
            icon="file-tray-full"
            href="/(claims)"
          />
          <NavigationCard
            title="Safety"
            description="Report safety concerns and access safety resources"
            icon="shield-checkmark"
            href="/(safety)"
          />
          <NavigationCard
            title="Tools & Links"
            description="Access helpful tools and important links"
            icon="construct"
            href="/(tools)"
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
    color: Colors.dark.warning,
  },
});

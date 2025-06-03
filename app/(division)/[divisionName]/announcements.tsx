import { useEffect, useState } from "react";
import { StyleSheet, Platform, useWindowDimensions, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

// Components
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { DivisionLoadingIndicator } from "@/components/ui/DivisionLoadingIndicator";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAnnouncementStore } from "@/store/announcementStore";
import { useAuth } from "@/hooks/useAuth";
import { useUserStore } from "@/store/userStore";
import { AnnouncementCard } from "@/components/ui/AnnouncementCard";
import { AnnouncementModal } from "@/components/modals/AnnouncementModal";
import type { Announcement } from "@/types/announcements";

type ColorSchemeName = keyof typeof Colors;

export default function DivisionAnnouncementsPage() {
  const params = useLocalSearchParams();
  const divisionName = params.divisionName as string;
  const router = useRouter();
  const { session, member } = useAuth();
  const division = useUserStore((state) => state.division);
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";

  // State
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Use the announcement store with individual selectors (following pattern from meetings.tsx)
  const announcements = useAnnouncementStore((state) => state.announcements);
  const isLoading = useAnnouncementStore((state) => state.isLoading);
  const loadingOperation = useAnnouncementStore((state) => state.loadingOperation);
  const error = useAnnouncementStore((state) => state.error);
  const currentDivisionContext = useAnnouncementStore((state) => state.currentDivisionContext);

  // Get store actions (following pattern from meetings.tsx)
  const fetchDivisionAnnouncements = useAnnouncementStore((state) => state.fetchDivisionAnnouncements);
  const setDivisionContext = useAnnouncementStore((state) => state.setDivisionContext);
  const subscribeToAnnouncements = useAnnouncementStore((state) => state.subscribeToAnnouncements);
  const unsubscribeFromAnnouncements = useAnnouncementStore((state) => state.unsubscribeFromAnnouncements);
  const markAnnouncementAsRead = useAnnouncementStore((state) => state.markAnnouncementAsRead);
  const acknowledgeAnnouncement = useAnnouncementStore((state) => state.acknowledgeAnnouncement);

  // Set division context and fetch announcements (following pattern from meetings.tsx)
  useEffect(() => {
    if (divisionName) {
      setDivisionContext(divisionName);
      fetchDivisionAnnouncements(divisionName);
    }
  }, [divisionName, setDivisionContext, fetchDivisionAnnouncements]);

  // Validate division context matches user's division (prevent unauthorized access)
  useEffect(() => {
    if (member && divisionName) {
      // Get division from userStore since that's where division name is stored
      const userDivisionName = division; // This comes from userStore and is already a string
      if (userDivisionName && userDivisionName !== divisionName) {
        console.warn(`User division ${userDivisionName} does not match route division ${divisionName}`);
        // Handle unauthorized access - redirect or show error
        router.replace("/(tabs)");
      }
    }
  }, [member, divisionName, division, router]);

  // Subscribe to realtime updates (following pattern from meetings.tsx)
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const setupSubscription = async () => {
      cleanup = await subscribeToAnnouncements(divisionName);
    };

    setupSubscription();

    return () => {
      if (cleanup) cleanup();
    };
  }, [divisionName, subscribeToAnnouncements]);

  // Get division-specific announcements (following pattern from meetings.tsx)
  const divisionAnnouncements = announcements[divisionName] || [];

  // Loading state (following pattern from meetings.tsx)
  if (isLoading && !divisionAnnouncements.length) {
    return (
      <DivisionLoadingIndicator
        divisionName={divisionName}
        operation={loadingOperation || "Loading announcements"}
        isVisible={true}
      />
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      </ThemedView>
    );
  }

  const handleAnnouncementPress = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setModalVisible(true);
  };

  const handleMarkAsRead = async (announcementId: string) => {
    await markAnnouncementAsRead(announcementId);
  };

  const handleAcknowledge = async (announcementId: string) => {
    await acknowledgeAnnouncement(announcementId);
  };

  const closeModal = () => {
    setSelectedAnnouncement(null);
    setModalVisible(false);
  };

  return (
    <ScrollView
      style={[styles.container, Platform.OS === "android" && styles.androidContainer]}
      contentContainerStyle={[styles.contentContainer, Platform.OS === "android" && styles.androidContentContainer]}
      nestedScrollEnabled={true}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={true}
    >
      <ThemedView style={styles.content}>
        {/* Division Announcements Header */}
        <ThemedView style={styles.header}>
          <Ionicons name="megaphone" size={24} color={Colors[colorScheme].announcementBadgeDivision} />
          <ThemedText style={styles.title}>Division {divisionName} Announcements</ThemedText>
        </ThemedView>

        {/* Announcements List with Division Context Validation */}
        <ThemedView style={styles.announcementsContainer}>
          {divisionAnnouncements.length > 0 ? (
            divisionAnnouncements.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                divisionContext={divisionName}
                divisionId={member?.division_id ?? undefined}
                onPress={() => handleAnnouncementPress(announcement)}
                onMarkAsRead={() => handleMarkAsRead(announcement.id)}
              />
            ))
          ) : (
            <ThemedView style={styles.noAnnouncementsContainer}>
              <Ionicons name="megaphone-outline" size={48} color={Colors[colorScheme].textDim} />
              <ThemedText style={styles.noAnnouncementsText}>No announcements for Division {divisionName}</ThemedText>
              <ThemedText style={styles.noAnnouncementsSubtext}>
                Check back later for important updates from your division.
              </ThemedText>
            </ThemedView>
          )}
        </ThemedView>

        {/* Announcement Modal */}
        {selectedAnnouncement && (
          <AnnouncementModal
            announcement={selectedAnnouncement}
            visible={modalVisible}
            onClose={closeModal}
            onMarkAsRead={() => handleMarkAsRead(selectedAnnouncement.id)}
            onAcknowledge={() => handleAcknowledge(selectedAnnouncement.id)}
          />
        )}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  androidContainer: {
    flex: 1,
    height: "auto",
    maxHeight: "100%",
  },
  contentContainer: {
    flexGrow: 1,
  },
  androidContentContainer: {
    flexGrow: 1,
    paddingBottom: 50,
  },
  content: {
    flex: 1,
    padding: 16,
    maxWidth: Platform.OS === "web" ? undefined : "100%",
    alignSelf: "center",
    width: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginLeft: 12,
  },
  announcementsContainer: {
    flex: 1,
  },
  noAnnouncementsContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    minHeight: 300,
  },
  noAnnouncementsText: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 16,
    marginBottom: 8,
  },
  noAnnouncementsSubtext: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: "center",
    lineHeight: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: Colors.dark.error,
    textAlign: "center",
  },
});

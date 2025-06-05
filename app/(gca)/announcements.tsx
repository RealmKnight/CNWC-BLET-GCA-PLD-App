import { useEffect, useState } from "react";
import { StyleSheet, Platform, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

// Components
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAnnouncementStore } from "@/store/announcementStore";
import { useAuth } from "@/hooks/useAuth";
import { AnnouncementCard } from "@/components/ui/AnnouncementCard";
import { AnnouncementModal } from "@/components/modals/AnnouncementModal";
import type { Announcement } from "@/types/announcements";

type ColorSchemeName = keyof typeof Colors;

export default function GCAAnnouncementsPage() {
  const router = useRouter();
  const { session, member } = useAuth();
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

  // Get store actions (following pattern from meetings.tsx)
  const fetchGCAnnouncements = useAnnouncementStore((state) => state.fetchGCAnnouncements);
  const setDivisionContext = useAnnouncementStore((state) => state.setDivisionContext);
  const subscribeToAnnouncements = useAnnouncementStore((state) => state.subscribeToAnnouncements);
  const markAnnouncementAsRead = useAnnouncementStore((state) => state.markAnnouncementAsRead);
  const acknowledgeAnnouncement = useAnnouncementStore((state) => state.acknowledgeAnnouncement);

  // Set GCA context and fetch announcements
  useEffect(() => {
    setDivisionContext("GCA"); // Set context to GCA for union announcements
    fetchGCAnnouncements();
  }, [setDivisionContext, fetchGCAnnouncements]);

  // Subscribe to realtime updates for GCA announcements
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const setupSubscription = async () => {
      cleanup = await subscribeToAnnouncements("GCA");
    };

    setupSubscription();

    return () => {
      if (cleanup) cleanup();
    };
  }, [subscribeToAnnouncements]);

  // Get GCA announcements (following pattern from meetings.tsx)
  const gcaAnnouncements = announcements["GCA"] || [];

  // Loading state (following pattern from meetings.tsx)
  if (isLoading && !gcaAnnouncements.length) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ThemedText style={styles.loadingText}>Loading GCA announcements...</ThemedText>
      </ThemedView>
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
    <ThemedScrollView style={styles.container}>
      <ThemedView style={styles.content}>
        {/* GCA Announcements Header */}
        <ThemedView style={styles.header}>
          <Ionicons name="business" size={24} color={Colors[colorScheme].announcementBadgeGCA} />
          <ThemedText style={styles.title}>GCA Union Announcements</ThemedText>
        </ThemedView>

        {/* Announcements List */}
        <ThemedView style={styles.announcementsContainer}>
          {gcaAnnouncements.length > 0 ? (
            gcaAnnouncements.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                divisionContext="GCA"
                onPress={() => handleAnnouncementPress(announcement)}
                onMarkAsRead={() => handleMarkAsRead(announcement.id)}
              />
            ))
          ) : (
            <ThemedView style={styles.noAnnouncementsContainer}>
              <Ionicons name="business-outline" size={48} color={Colors[colorScheme].textDim} />
              <ThemedText style={styles.noAnnouncementsText}>No GCA announcements available</ThemedText>
              <ThemedText style={styles.noAnnouncementsSubtext}>
                Check back later for important union-wide updates and announcements.
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
    </ThemedScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    fontSize: 16,
    textAlign: "center",
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

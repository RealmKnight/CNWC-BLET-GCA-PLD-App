import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
  Alert,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAnnouncementStore } from "@/store/announcementStore";
import { useUserStore } from "@/store/userStore";
import { AnnouncementModal } from "@/components/modals/AnnouncementModal";
import { AnnouncementAnalyticsModal } from "@/components/modals/AnnouncementAnalyticsModal";
import { AnnouncementCard } from "@/components/ui/AnnouncementCard";
import { AnnouncementAnalyticsDashboard } from "@/components/admin/analytics/AnnouncementAnalyticsDashboard";
import { Input } from "@/components/ui/Input";
import { Select, SelectOption } from "@/components/ui/Select";
import { Announcement, DetailedAnnouncementAnalytics } from "@/types/announcements";

type ColorSchemeName = keyof typeof Colors;

interface DivisionAnnouncementsAdminProps {
  division: string;
}

export function DivisionAnnouncementsAdmin({ division }: DivisionAnnouncementsAdminProps) {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Add refs to track component state and prevent race conditions
  const isMountedRef = useRef(true);
  const currentDivisionRef = useRef(division);
  const isInitializedRef = useRef(false);

  // Use a single stable store subscription to prevent getSnapshot caching issues
  const storeState = useAnnouncementStore();

  // Extract values from store state to prevent accessing nested properties in render
  const announcements = useMemo(() => {
    return storeState.announcements[division] || [];
  }, [storeState.announcements, division]);

  const isLoading = storeState.isLoading;
  const error = storeState.error;

  // Get store actions once and memoize them
  const storeActions = useMemo(
    () => ({
      fetchDivisionAnnouncements: storeState.fetchDivisionAnnouncements,
      setDivisionContext: storeState.setDivisionContext,
      createAnnouncement: storeState.createAnnouncement,
      updateAnnouncement: storeState.updateAnnouncement,
      deleteAnnouncement: storeState.deleteAnnouncement,
      markAnnouncementAsRead: storeState.markAnnouncementAsRead,
      acknowledgeAnnouncement: storeState.acknowledgeAnnouncement,
      getDetailedAnnouncementAnalytics: storeState.getDetailedAnnouncementAnalytics,
    }),
    [
      storeState.fetchDivisionAnnouncements,
      storeState.setDivisionContext,
      storeState.createAnnouncement,
      storeState.updateAnnouncement,
      storeState.deleteAnnouncement,
      storeState.markAnnouncementAsRead,
      storeState.acknowledgeAnnouncement,
      storeState.getDetailedAnnouncementAnalytics,
    ]
  );

  // User info with stable selectors
  const member = useUserStore((state) => state.member);
  const userRole = useUserStore((state) => state.userRole);
  const userDivision = useUserStore((state) => state.division);

  // Local state
  const [activeTab, setActiveTab] = useState<"list" | "create" | "analytics">("list");
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [isAnnouncementModalVisible, setIsAnnouncementModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Analytics modal state
  const [selectedAnnouncementForAnalytics, setSelectedAnnouncementForAnalytics] = useState<string | null>(null);
  const [analyticsModalVisible, setAnalyticsModalVisible] = useState(false);
  const [currentAnalytics, setCurrentAnalytics] = useState<DetailedAnnouncementAnalytics | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    links: [] as Array<{ url: string; label: string }>,
    document_ids: [] as string[],
    end_date: "",
    requires_acknowledgment: false,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Stable permission check function - moved outside useEffect
  const canManageAnnouncements = useMemo(() => {
    if (userRole === "application_admin" || userRole === "union_admin") {
      return true; // Can manage any division
    }
    if (userRole === "division_admin" && userDivision === division) {
      return true; // Can only manage own division
    }
    return false;
  }, [userRole, userDivision, division]);

  // Handle division changes and cleanup
  useEffect(() => {
    if (!division) {
      return;
    }

    // If division has changed, reset state immediately to prevent stale data
    if (currentDivisionRef.current !== division) {
      console.log(`[DivisionAnnouncementsAdmin] Division changing from ${currentDivisionRef.current} to ${division}`);

      currentDivisionRef.current = division;

      // Reset all component state immediately
      setActiveTab("list");
      setSelectedAnnouncement(null);
      setIsAnnouncementModalVisible(false);
      setAnalyticsModalVisible(false);
      setCurrentAnalytics(null);
      setFormError(null);
      isInitializedRef.current = false;

      // Add a small delay to prevent rapid fire division changes
      const divisionChangeTimer = setTimeout(() => {
        if (isMountedRef.current && currentDivisionRef.current === division && canManageAnnouncements) {
          // Only proceed if we're still mounted and division hasn't changed again
          initializeDivisionData();
        }
      }, 100);

      return () => clearTimeout(divisionChangeTimer);
    }

    // Initialize division data if not already done
    const initializeDivisionData = async () => {
      if (!isInitializedRef.current && isMountedRef.current && canManageAnnouncements) {
        isInitializedRef.current = true;

        try {
          console.log(`[DivisionAnnouncementsAdmin] Initializing data for division: ${division}`);
          storeActions.setDivisionContext(division);
          await storeActions.fetchDivisionAnnouncements(division);
        } catch (error) {
          console.error(`[DivisionAnnouncementsAdmin] Error initializing division ${division}:`, error);
          if (isMountedRef.current) {
            setFormError(error instanceof Error ? error.message : "Failed to initialize division data");
          }
        }
      }
    };

    // Call initialization if division context hasn't changed and we can manage announcements
    if (currentDivisionRef.current === division && canManageAnnouncements) {
      initializeDivisionData();
    }
  }, [division, canManageAnnouncements, storeActions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Handle refresh
  const onRefresh = useCallback(async () => {
    if (!isMountedRef.current || !canManageAnnouncements) return;

    setRefreshing(true);
    try {
      await storeActions.fetchDivisionAnnouncements(division);
    } catch (error) {
      console.error("Error refreshing announcements:", error);
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [division, storeActions, canManageAnnouncements]);

  // Handle form submission
  const handleSubmit = async () => {
    if (!canManageAnnouncements) {
      setFormError("You don't have permission to manage announcements for this division");
      return;
    }

    if (!formData.title.trim() || !formData.message.trim()) {
      setFormError("Title and message are required");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      // Get division ID for target_division_ids
      const { data: divisionData } = await import("@/utils/supabase").then(({ supabase }) =>
        supabase.from("divisions").select("id").eq("name", division).single()
      );

      await storeActions.createAnnouncement({
        title: formData.title.trim(),
        message: formData.message.trim(),
        links: formData.links.filter((link) => link.url.trim() && link.label.trim()),
        document_ids: formData.document_ids,
        target_type: "division",
        target_division_ids: divisionData?.id ? [divisionData.id] : [],
        start_date: new Date().toISOString(),
        end_date: formData.end_date || null,
        is_active: true,
        require_acknowledgment: formData.requires_acknowledgment,
      });

      // Reset form
      setFormData({
        title: "",
        message: "",
        links: [],
        document_ids: [],
        end_date: "",
        requires_acknowledgment: false,
      });

      // Switch to list tab
      setActiveTab("list");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to create announcement");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete announcement
  const handleDeleteAnnouncement = (announcement: Announcement) => {
    Alert.alert(
      "Delete Announcement",
      `Are you sure you want to delete "${announcement.title}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await storeActions.deleteAnnouncement(announcement.id);
            } catch (error) {
              Alert.alert("Error", "Failed to delete announcement");
            }
          },
        },
      ]
    );
  };

  // Handle announcement press
  const handleAnnouncementPress = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setIsAnnouncementModalVisible(true);
  };

  // Handle mark as read
  const handleMarkAsRead = async (announcementId: string) => {
    await storeActions.markAnnouncementAsRead(announcementId);
  };

  // Handle acknowledge
  const handleAcknowledge = async (announcement: Announcement) => {
    await storeActions.acknowledgeAnnouncement(announcement.id);
  };

  // Add link to form
  const addLink = () => {
    setFormData((prev) => ({
      ...prev,
      links: [...prev.links, { url: "", label: "" }],
    }));
  };

  // Remove link from form
  const removeLink = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      links: prev.links.filter((_, i) => i !== index),
    }));
  };

  // Update link in form
  const updateLink = (index: number, field: "url" | "label", value: string) => {
    setFormData((prev) => ({
      ...prev,
      links: prev.links.map((link, i) => (i === index ? { ...link, [field]: value } : link)),
    }));
  };

  // Render tab buttons
  const renderTabButtons = () => (
    <View style={styles.tabContainer}>
      <TouchableOpacity
        style={[styles.tabButton, activeTab === "list" && styles.activeTabButton]}
        onPress={() => setActiveTab("list")}
      >
        <Ionicons
          name="list"
          size={20}
          color={activeTab === "list" ? Colors[colorScheme].background : Colors[colorScheme].text}
        />
        <ThemedText style={[styles.tabButtonText, activeTab === "list" && styles.activeTabButtonText]}>
          Announcements
        </ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.tabButton, activeTab === "create" && styles.activeTabButton]}
        onPress={() => setActiveTab("create")}
      >
        <Ionicons
          name="add-circle"
          size={20}
          color={activeTab === "create" ? Colors[colorScheme].background : Colors[colorScheme].text}
        />
        <ThemedText style={[styles.tabButtonText, activeTab === "create" && styles.activeTabButtonText]}>
          Create
        </ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.tabButton, activeTab === "analytics" && styles.activeTabButton]}
        onPress={() => setActiveTab("analytics")}
      >
        <Ionicons
          name="analytics"
          size={20}
          color={activeTab === "analytics" ? Colors[colorScheme].background : Colors[colorScheme].text}
        />
        <ThemedText style={[styles.tabButtonText, activeTab === "analytics" && styles.activeTabButtonText]}>
          Analytics
        </ThemedText>
      </TouchableOpacity>
    </View>
  );

  // Render announcements list
  const renderAnnouncementsList = () => (
    <ScrollView
      style={styles.scrollContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <ThemedView style={styles.listContainer}>
        <ThemedView style={styles.listHeader}>
          <ThemedText type="subtitle">Division Announcements</ThemedText>
          <ThemedText style={styles.listSubtitle}>
            {announcements.length} announcement{announcements.length !== 1 ? "s" : ""}
          </ThemedText>
        </ThemedView>

        {announcements.length === 0 ? (
          <ThemedView style={styles.emptyContainer}>
            <Ionicons name="megaphone-outline" size={48} color={Colors[colorScheme].text} style={styles.emptyIcon} />
            <ThemedText style={styles.emptyText}>No announcements yet</ThemedText>
            <ThemedText style={styles.emptySubtext}>Create your first announcement to get started</ThemedText>
          </ThemedView>
        ) : (
          announcements.map((announcement) => (
            <View key={announcement.id} style={styles.announcementContainer}>
              <AnnouncementCard
                announcement={announcement}
                divisionContext={division}
                divisionId={member?.division_id ?? undefined}
                onPress={() => handleAnnouncementPress(announcement)}
                onMarkAsRead={() => handleMarkAsRead(announcement.id)}
              />
              <View style={styles.adminActions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.analyticsButton]}
                  onPress={async () => {
                    try {
                      setSelectedAnnouncementForAnalytics(announcement.id);
                      const analytics = await storeActions.getDetailedAnnouncementAnalytics(announcement.id);
                      setCurrentAnalytics(analytics);
                      setAnalyticsModalVisible(true);
                    } catch (error) {
                      console.error("Failed to load analytics:", error);
                      Alert.alert("Error", "Failed to load analytics data");
                    }
                  }}
                >
                  <Ionicons name="analytics" size={16} color={Colors[colorScheme].background} />
                  <ThemedText style={styles.actionButtonText}>Analytics</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => handleDeleteAnnouncement(announcement)}
                >
                  <Ionicons name="trash" size={16} color={Colors[colorScheme].background} />
                  <ThemedText style={styles.actionButtonText}>Delete</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ThemedView>
    </ScrollView>
  );

  // Render create form
  const renderCreateForm = () => (
    <ScrollView style={styles.scrollContainer}>
      <ThemedView style={styles.formContainer}>
        <ThemedView style={styles.formHeader}>
          <ThemedText type="subtitle">Create New Announcement</ThemedText>
          <ThemedText style={styles.formSubtitle}>
            This announcement will be visible to all members in {division} division
          </ThemedText>
        </ThemedView>

        {formError && (
          <ThemedView style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={20} color={Colors[colorScheme].error} />
            <ThemedText style={[styles.errorText, { color: Colors[colorScheme].error }]}>{formError}</ThemedText>
          </ThemedView>
        )}

        <ThemedView style={styles.formGroup}>
          <ThemedText style={styles.label}>Title *</ThemedText>
          <Input
            placeholder="Enter announcement title"
            value={formData.title}
            onChangeText={(text) => setFormData((prev) => ({ ...prev, title: text }))}
            style={styles.input}
          />
        </ThemedView>

        <ThemedView style={styles.formGroup}>
          <ThemedText style={styles.label}>Message *</ThemedText>
          <Input
            placeholder="Enter announcement message"
            value={formData.message}
            onChangeText={(text) => setFormData((prev) => ({ ...prev, message: text }))}
            style={[styles.input, styles.textArea]}
            multiline
            numberOfLines={6}
          />
        </ThemedView>

        <ThemedView style={styles.formGroup}>
          <ThemedText style={styles.label}>Links</ThemedText>
          {formData.links.map((link, index) => (
            <View key={index} style={styles.linkContainer}>
              <View style={styles.linkInputs}>
                <Input
                  placeholder="Link URL"
                  value={link.url}
                  onChangeText={(text) => updateLink(index, "url", text)}
                  style={[styles.input, styles.linkInput]}
                />
                <Input
                  placeholder="Link Label"
                  value={link.label}
                  onChangeText={(text) => updateLink(index, "label", text)}
                  style={[styles.input, styles.linkInput]}
                />
              </View>
              <TouchableOpacity style={styles.removeLinkButton} onPress={() => removeLink(index)}>
                <Ionicons name="close-circle" size={24} color={Colors[colorScheme].error} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addLinkButton} onPress={addLink}>
            <Ionicons name="add-circle-outline" size={20} color={Colors[colorScheme].tint} />
            <ThemedText style={[styles.addLinkText, { color: Colors[colorScheme].tint }]}>Add Link</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        <ThemedView style={styles.formGroup}>
          <ThemedText style={styles.label}>End Date (Optional)</ThemedText>
          <Input
            placeholder="YYYY-MM-DD"
            value={formData.end_date}
            onChangeText={(text) => setFormData((prev) => ({ ...prev, end_date: text }))}
            style={styles.input}
          />
          <ThemedText style={styles.helpText}>Leave empty for permanent announcement</ThemedText>
        </ThemedView>

        <ThemedView style={styles.formGroup}>
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setFormData((prev) => ({ ...prev, requires_acknowledgment: !prev.requires_acknowledgment }))}
          >
            <Ionicons
              name={formData.requires_acknowledgment ? "checkbox" : "square-outline"}
              size={24}
              color={Colors[colorScheme].tint}
            />
            <ThemedText style={styles.checkboxText}>Require member acknowledgment</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: Colors[colorScheme].tint }]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <ThemedText style={[styles.submitButtonText, { color: Colors[colorScheme].background }]}>
              {isSubmitting ? "Creating..." : "Create Announcement"}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    </ScrollView>
  );

  // Render analytics
  const renderAnalytics = () => (
    <ScrollView style={styles.scrollContainer}>
      <ThemedView style={styles.analyticsContainer}>
        <AnnouncementAnalyticsDashboard
          divisionContext={division}
          showExportOptions={userRole === "application_admin" || userRole === "union_admin"}
        />
      </ThemedView>
    </ScrollView>
  );

  // Show permission error if user can't manage announcements
  if (!canManageAnnouncements) {
    return (
      <ThemedView style={styles.container}>
        <ThemedView style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors[colorScheme].error} />
          <ThemedText style={[styles.errorText, { color: Colors[colorScheme].error }]}>
            You don't have permission to manage announcements for this division.
          </ThemedText>
        </ThemedView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {renderTabButtons()}

      {isLoading ? (
        <ThemedView style={styles.loadingContainer}>
          <ThemedText>Loading announcements...</ThemedText>
        </ThemedView>
      ) : error ? (
        <ThemedView style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={24} color={Colors[colorScheme].error} />
          <ThemedText style={[styles.errorText, { color: Colors[colorScheme].error }]}>{error}</ThemedText>
        </ThemedView>
      ) : (
        <>
          {activeTab === "list" && renderAnnouncementsList()}
          {activeTab === "create" && renderCreateForm()}
          {activeTab === "analytics" && renderAnalytics()}
        </>
      )}

      <AnnouncementModal
        announcement={selectedAnnouncement}
        visible={isAnnouncementModalVisible}
        onClose={() => {
          setIsAnnouncementModalVisible(false);
          setSelectedAnnouncement(null);
        }}
        onMarkAsRead={handleMarkAsRead}
        onAcknowledge={handleAcknowledge}
      />

      <AnnouncementAnalyticsModal
        analytics={currentAnalytics}
        visible={analyticsModalVisible}
        onClose={() => {
          setAnalyticsModalVisible(false);
          setSelectedAnnouncementForAnalytics(null);
          setCurrentAnalytics(null);
        }}
        onExport={(format) => {
          // Handle export functionality
          console.log(`Export analytics for announcement ${selectedAnnouncementForAnalytics} as ${format}`);
          // Could implement export logic here
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 8,
  },
  activeTabButton: {
    backgroundColor: Colors.dark.tint,
    borderBottomWidth: 2,
    borderBottomColor: Colors.dark.tint,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  activeTabButtonText: {
    color: Colors.dark.background,
  },
  scrollContainer: {
    flex: 1,
  },
  listContainer: {
    padding: 16,
  },
  listHeader: {
    marginBottom: 16,
  },
  listSubtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyIcon: {
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "500",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: "center",
  },
  announcementContainer: {
    marginBottom: 16,
  },
  adminActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  analyticsButton: {
    backgroundColor: Colors.dark.tint,
  },
  deleteButton: {
    backgroundColor: Colors.dark.error,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.dark.background,
  },
  formContainer: {
    padding: 16,
  },
  formHeader: {
    marginBottom: 24,
  },
  formSubtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 4,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 8,
  },
  input: {
    height: 48,
  },
  textArea: {
    height: 120,
    textAlignVertical: "top",
  },
  linkContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  linkInputs: {
    flex: 1,
    gap: 8,
  },
  linkInput: {
    height: 40,
  },
  removeLinkButton: {
    padding: 4,
  },
  addLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  addLinkText: {
    fontSize: 14,
    fontWeight: "500",
  },
  helpText: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkboxText: {
    fontSize: 16,
  },
  buttonContainer: {
    marginTop: 24,
  },
  submitButton: {
    height: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  analyticsContainer: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    margin: 16,
    backgroundColor: "rgba(231, 76, 60, 0.1)",
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
  },
});

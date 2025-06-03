import React, { useState, useEffect, useCallback } from "react";
import { StyleSheet, TouchableOpacity, ScrollView, View, Alert, RefreshControl } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TabBar, Tab } from "@/components/admin/TabBar";
import { Ionicons } from "@expo/vector-icons";
import { useAnnouncementStore } from "@/store/announcementStore";
import { useUserStore } from "@/store/userStore";
import { AnnouncementModal } from "@/components/modals/AnnouncementModal";
import { AnnouncementCard } from "@/components/ui/AnnouncementCard";
import { AnnouncementAnalyticsDashboard } from "@/components/admin/analytics/AnnouncementAnalyticsDashboard";
import { Input } from "@/components/ui/Input";
import { Select, SelectOption } from "@/components/ui/Select";
import { Announcement } from "@/types/announcements";

interface DivisionOption {
  value: string;
  label: string;
}

export function UnionAnnouncementManager() {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [activeTab, setActiveTab] = useState("create");

  // Store selectors - using announcements directly instead of gcaAnnouncements
  const announcements = useAnnouncementStore((state) => state.announcements);
  const isLoading = useAnnouncementStore((state) => state.isLoading);
  const error = useAnnouncementStore((state) => state.error);

  // Store actions
  const setDivisionContext = useAnnouncementStore((state) => state.setDivisionContext);
  const fetchGCAnnouncements = useAnnouncementStore((state) => state.fetchGCAnnouncements);
  const fetchDivisionAnnouncements = useAnnouncementStore((state) => state.fetchDivisionAnnouncements);
  const createAnnouncement = useAnnouncementStore((state) => state.createAnnouncement);
  const deleteAnnouncement = useAnnouncementStore((state) => state.deleteAnnouncement);
  const markAnnouncementAsRead = useAnnouncementStore((state) => state.markAnnouncementAsRead);
  const acknowledgeAnnouncement = useAnnouncementStore((state) => state.acknowledgeAnnouncement);
  const getAnnouncementAnalytics = useAnnouncementStore((state) => state.getAnnouncementAnalytics);

  // User info
  const member = useUserStore((state) => state.member);
  const userRole = useUserStore((state) => state.userRole);

  // Local state
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [isAnnouncementModalVisible, setIsAnnouncementModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState<string>("GCA");
  const [divisions, setDivisions] = useState<DivisionOption[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    links: [] as Array<{ url: string; label: string }>,
    document_ids: [] as string[],
    target_type: "GCA" as "division" | "GCA",
    target_division: "GCA",
    end_date: "",
    requires_acknowledgment: false,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Memoize permission check function to prevent infinite loops
  const canManageUnionAnnouncements = useCallback(() => {
    return userRole === "application_admin" || userRole === "union_admin";
  }, [userRole]);

  // Load divisions for division selector
  useEffect(() => {
    const loadDivisions = async () => {
      try {
        const { supabase } = await import("@/utils/supabase");
        const { data, error } = await supabase.from("divisions").select("id, name").order("name");

        if (error) throw error;

        const divisionOptions: DivisionOption[] = [
          { value: "GCA", label: "GCA (Union-wide)" },
          ...data.map((div) => ({ value: div.name, label: div.name })),
        ];

        setDivisions(divisionOptions);
      } catch (error) {
        console.error("Error loading divisions:", error);
      }
    };

    if (canManageUnionAnnouncements()) {
      loadDivisions();
    }
  }, [canManageUnionAnnouncements]);

  // Initialize and fetch announcements - Fixed to prevent infinite loops
  useEffect(() => {
    if (!canManageUnionAnnouncements()) {
      return;
    }

    if (selectedDivision === "GCA") {
      setDivisionContext("GCA");
      fetchGCAnnouncements();
    } else {
      setDivisionContext(selectedDivision);
      fetchDivisionAnnouncements(selectedDivision);
    }
  }, [selectedDivision, userRole]); // Only depend on selectedDivision and userRole

  // Handle refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (selectedDivision === "GCA") {
        await fetchGCAnnouncements();
      } else {
        await fetchDivisionAnnouncements(selectedDivision);
      }
    } catch (error) {
      console.error("Error refreshing announcements:", error);
    } finally {
      setRefreshing(false);
    }
  }, [selectedDivision, fetchGCAnnouncements, fetchDivisionAnnouncements]);

  // Handle form submission
  const handleSubmit = async () => {
    if (!canManageUnionAnnouncements()) {
      setFormError("You don't have permission to manage union announcements");
      return;
    }

    if (!formData.title.trim() || !formData.message.trim()) {
      setFormError("Title and message are required");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      let targetDivisionIds: number[] = [];

      if (formData.target_type === "division" && formData.target_division !== "GCA") {
        // Get division ID for target_division_ids
        const { supabase } = await import("@/utils/supabase");
        const { data: divisionData } = await supabase
          .from("divisions")
          .select("id")
          .eq("name", formData.target_division)
          .single();

        if (divisionData?.id) {
          targetDivisionIds = [divisionData.id];
        }
      }

      await createAnnouncement({
        title: formData.title.trim(),
        message: formData.message.trim(),
        links: formData.links.filter((link) => link.url.trim() && link.label.trim()),
        document_ids: formData.document_ids,
        target_type: formData.target_type,
        target_division_ids: targetDivisionIds,
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
        target_type: "GCA",
        target_division: "GCA",
        end_date: "",
        requires_acknowledgment: false,
      });

      // Switch to manage tab
      setActiveTab("manage");
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
              await deleteAnnouncement(announcement.id);
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
    await markAnnouncementAsRead(announcementId);
  };

  // Handle acknowledge
  const handleAcknowledge = async (announcement: Announcement) => {
    await acknowledgeAnnouncement(announcement.id);
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

  // Update target type and division
  const handleTargetTypeChange = (type: "division" | "GCA") => {
    setFormData((prev) => ({
      ...prev,
      target_type: type,
      target_division: type === "GCA" ? "GCA" : divisions.find((d) => d.value !== "GCA")?.value || "GCA",
    }));
  };

  // Get current announcements based on selected division - fixed implementation
  const getCurrentAnnouncements = () => {
    return announcements[selectedDivision] || [];
  };

  const tabs: Tab[] = [
    { key: "create", title: "Create", icon: "add-circle", outlineIcon: "add-circle-outline" },
    { key: "manage", title: "Manage", icon: "list", outlineIcon: "list-outline" },
    { key: "scheduled", title: "Scheduled", icon: "calendar", outlineIcon: "calendar-outline" },
    { key: "analytics", title: "Analytics", icon: "analytics", outlineIcon: "analytics-outline" },
  ];

  // Create Announcement Tab
  const CreateAnnouncementTab = () => (
    <ScrollView style={styles.scrollContainer}>
      <ThemedView style={styles.formContainer}>
        <ThemedView style={styles.formHeader}>
          <ThemedText type="subtitle">Create New Announcement</ThemedText>
          <ThemedText style={styles.formSubtitle}>Create announcements for the union or specific divisions</ThemedText>
        </ThemedView>

        {formError && (
          <ThemedView style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={20} color={Colors[colorScheme].error} />
            <ThemedText style={[styles.errorText, { color: Colors[colorScheme].error }]}>{formError}</ThemedText>
          </ThemedView>
        )}

        <ThemedView style={styles.formGroup}>
          <ThemedText style={styles.label}>Target Audience *</ThemedText>
          <View style={styles.targetTypeContainer}>
            <TouchableOpacity
              style={[styles.targetTypeButton, formData.target_type === "GCA" && styles.activeTargetTypeButton]}
              onPress={() => handleTargetTypeChange("GCA")}
            >
              <ThemedText
                style={[styles.targetTypeText, formData.target_type === "GCA" && styles.activeTargetTypeText]}
              >
                Union-wide (GCA)
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.targetTypeButton, formData.target_type === "division" && styles.activeTargetTypeButton]}
              onPress={() => handleTargetTypeChange("division")}
            >
              <ThemedText
                style={[styles.targetTypeText, formData.target_type === "division" && styles.activeTargetTypeText]}
              >
                Specific Division
              </ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>

        {formData.target_type === "division" && (
          <ThemedView style={styles.formGroup}>
            <ThemedText style={styles.label}>Select Division *</ThemedText>
            <Select
              value={formData.target_division}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, target_division: value as string }))}
              options={divisions.filter((d) => d.value !== "GCA")}
              placeholder="Select a division"
              style={styles.select}
            />
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

  // Manage Announcements Tab
  const ManageAnnouncementsTab = () => {
    const currentAnnouncements = getCurrentAnnouncements();

    return (
      <ScrollView
        style={styles.scrollContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ThemedView style={styles.listContainer}>
          <ThemedView style={styles.listHeader}>
            <ThemedText type="subtitle">Manage Announcements</ThemedText>
            <View style={styles.divisionSelector}>
              <ThemedText style={styles.selectorLabel}>Viewing: </ThemedText>
              <Select
                value={selectedDivision}
                onValueChange={(value) => setSelectedDivision(value as string)}
                options={divisions}
                placeholder="Select context"
                style={styles.divisionSelect}
              />
            </View>
          </ThemedView>

          <ThemedText style={styles.listSubtitle}>
            {currentAnnouncements.length} announcement{currentAnnouncements.length !== 1 ? "s" : ""} in{" "}
            {selectedDivision}
          </ThemedText>

          {currentAnnouncements.length === 0 ? (
            <ThemedView style={styles.emptyContainer}>
              <Ionicons name="megaphone-outline" size={48} color={Colors[colorScheme].text} style={styles.emptyIcon} />
              <ThemedText style={styles.emptyText}>No announcements yet</ThemedText>
              <ThemedText style={styles.emptySubtext}>Create your first announcement to get started</ThemedText>
            </ThemedView>
          ) : (
            currentAnnouncements.map((announcement) => (
              <View key={announcement.id} style={styles.announcementContainer}>
                <AnnouncementCard
                  announcement={announcement}
                  divisionContext={selectedDivision}
                  divisionId={member?.division_id ?? undefined}
                  onPress={() => handleAnnouncementPress(announcement)}
                  onMarkAsRead={() => handleMarkAsRead(announcement.id)}
                />
                <View style={styles.adminActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.analyticsButton]}
                    onPress={() => {
                      getAnnouncementAnalytics(announcement.id);
                      setActiveTab("analytics");
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
  };

  // Scheduled Announcements Tab (placeholder)
  const ScheduledAnnouncementsTab = () => (
    <ThemedView style={styles.placeholderContainer}>
      <ThemedText style={styles.placeholderText}>Scheduled Announcements Coming Soon</ThemedText>
      <ThemedText style={styles.placeholderSubtext}>
        This feature will allow you to schedule announcements for future dates
      </ThemedText>
    </ThemedView>
  );

  // Analytics Tab
  const AnalyticsTab = () => <AnnouncementAnalyticsDashboard showExportOptions={true} />;

  const renderContent = () => {
    switch (activeTab) {
      case "create":
        return <CreateAnnouncementTab />;
      case "manage":
        return <ManageAnnouncementsTab />;
      case "scheduled":
        return <ScheduledAnnouncementsTab />;
      case "analytics":
        return <AnalyticsTab />;
      default:
        return null;
    }
  };

  // Show permission error if user can't manage union announcements
  if (!canManageUnionAnnouncements()) {
    return (
      <ThemedView style={styles.container}>
        <ThemedView style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors[colorScheme].error} />
          <ThemedText style={[styles.errorText, { color: Colors[colorScheme].error }]}>
            You don't have permission to manage union announcements.
          </ThemedText>
        </ThemedView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Union Announcements</ThemedText>
      </ThemedView>

      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

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
        renderContent()
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  scrollContainer: {
    flex: 1,
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
  select: {
    height: 48,
  },
  targetTypeContainer: {
    flexDirection: "row",
    gap: 8,
  },
  targetTypeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
  },
  activeTargetTypeButton: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
  },
  targetTypeText: {
    fontSize: 14,
    fontWeight: "500",
  },
  activeTargetTypeText: {
    color: Colors.dark.background,
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
  listContainer: {
    padding: 16,
  },
  listHeader: {
    marginBottom: 16,
  },
  divisionSelector: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  selectorLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  divisionSelect: {
    minWidth: 150,
    height: 40,
  },
  listSubtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 16,
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
  placeholderContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    flex: 1,
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: "500",
    marginBottom: 8,
    textAlign: "center",
  },
  placeholderSubtext: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: "center",
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

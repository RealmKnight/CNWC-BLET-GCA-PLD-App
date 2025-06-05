import React, { useState, useEffect } from "react";
import { StyleSheet, TouchableOpacity, ActivityIndicator, View, ScrollView, Platform, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useDivisionManagementStore, Division, Zone } from "@/store/divisionManagementStore";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Input } from "@/components/ui/Input";
import { Select, SelectOption } from "@/components/ui/Select";
import { KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface EditDivisionFormProps {
  division: Division;
  onComplete?: () => void;
}

export const EditDivisionForm = ({ division, onComplete }: EditDivisionFormProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const themeColor = Colors[colorScheme as keyof typeof Colors];
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get("window").height;

  const { updateDivision, createZone, error, clearError, divisions, zones, fetchDivisions, fetchZonesForDivision } =
    useDivisionManagementStore();

  // Division fields
  const [name, setName] = useState(division.name);
  const [location, setLocation] = useState(division.location);

  // Zone management state
  const [divisionZones, setDivisionZones] = useState<Zone[]>([]);
  const [addingZone, setAddingZone] = useState(false);

  // New zone options
  const [createNewZone, setCreateNewZone] = useState(true);
  const [assignExistingZone, setAssignExistingZone] = useState(false);

  // Zone fields
  const [zoneName, setZoneName] = useState("");
  const [existingZoneId, setExistingZoneId] = useState<number | null>(null);
  const [sourceZoneInfo, setSourceZoneInfo] = useState<{ divisionId: number | null; divisionName: string }>({
    divisionId: null,
    divisionName: "",
  });

  // List of all zones across divisions that could be reassigned
  const [allZones, setAllZones] = useState<
    Array<{ id: number; name: string; division_id: number; divisionName: string }>
  >([]);

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch zones for this division when the component mounts or division changes
  useEffect(() => {
    const fetchCurrentDivisionZones = async () => {
      await fetchZonesForDivision(division.id);
      const currentZones = zones[division.id] || [];
      setDivisionZones(currentZones);
    };

    fetchCurrentDivisionZones();
  }, [division.id, fetchZonesForDivision, zones]);

  // Fetch divisions and all zones when component mounts
  useEffect(() => {
    fetchDivisions();
  }, [fetchDivisions]);

  // When divisions change, fetch zones for each division
  useEffect(() => {
    if (divisions.length > 0) {
      Promise.all(divisions.map((div) => fetchZonesForDivision(div.id))).catch((err) =>
        console.error("Error fetching zones for divisions:", err)
      );
    }
  }, [divisions, fetchZonesForDivision]);

  // Update the allZones list when zones change
  useEffect(() => {
    const zonesArray: Array<{ id: number; name: string; division_id: number; divisionName: string }> = [];

    // For each division
    divisions.forEach((div) => {
      // Skip the current division, we don't want to move zones within the same division
      if (div.id === division.id) {
        return;
      }

      // Get zones for this division
      const divisionZones = zones[div.id] || [];

      // Skip the "Unassigned" division or divisions with only one zone
      if (div.name === "Unassigned" || divisionZones.length <= 1) {
        return;
      }

      // Add each zone to our array with division info
      divisionZones.forEach((zone) => {
        zonesArray.push({
          id: zone.id,
          name: zone.name,
          division_id: zone.division_id,
          divisionName: div.name,
        });
      });
    });

    setAllZones(zonesArray);
  }, [divisions, zones, division.id]);

  // Reset form when division changes
  useEffect(() => {
    setName(division.name);
    setLocation(division.location);
    setFormError(null);
    setSuccessMessage(null);
    setAddingZone(false);
    setZoneName("");
    setExistingZoneId(null);
    setCreateNewZone(true);
    setAssignExistingZone(false);
  }, [division]);

  // Handle selection of an existing zone
  useEffect(() => {
    if (existingZoneId) {
      const selectedZone = allZones.find((zone) => zone.id === existingZoneId);
      if (selectedZone) {
        setSourceZoneInfo({
          divisionId: selectedZone.division_id,
          divisionName: selectedZone.divisionName,
        });
      }
    } else {
      setSourceZoneInfo({ divisionId: null, divisionName: "" });
    }
  }, [existingZoneId, allZones]);

  // Toggle between zone creation options
  const toggleCreateNew = () => {
    setCreateNewZone(true);
    setAssignExistingZone(false);
  };

  const toggleAssignExisting = () => {
    setCreateNewZone(false);
    setAssignExistingZone(true);
  };

  const toggleAddZone = () => {
    setAddingZone(!addingZone);
    // Reset zone form fields when toggling
    if (!addingZone) {
      setZoneName("");
      setExistingZoneId(null);
      setCreateNewZone(true);
      setAssignExistingZone(false);
    }
  };

  const validateForm = () => {
    if (!name.trim()) {
      setFormError("Division name is required");
      return false;
    }

    if (!location.trim()) {
      setFormError("Location is required");
      return false;
    }

    return true;
  };

  const validateZoneForm = () => {
    // Skip zone validation for "Unassigned" division
    if (name.trim().toLowerCase() === "unassigned") {
      return true;
    }

    // Validate zone creation
    if (createNewZone && !zoneName.trim()) {
      setFormError("Zone name is required when creating a new zone");
      return false;
    }

    // Validate zone assignment
    if (assignExistingZone && existingZoneId === null) {
      setFormError("Please select a zone to assign to this division");
      return false;
    }

    // If this zone is the only one in its division, prevent assignment
    if (assignExistingZone && existingZoneId !== null && sourceZoneInfo.divisionId !== null) {
      const sourceDivisionZones = zones[sourceZoneInfo.divisionId] || [];
      if (sourceDivisionZones.length <= 1) {
        setFormError(
          `Cannot assign this zone because it's the only zone in ${sourceZoneInfo.divisionName} division. All divisions must have at least one zone.`
        );
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    setFormError(null);
    clearError();
    setSuccessMessage(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Update division information
      await updateDivision(division.id, {
        name: name.trim(),
        location: location.trim(),
      });

      setSuccessMessage(`Division updated successfully!`);

      // Call onComplete callback if provided
      if (onComplete) {
        onComplete();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "An error occurred while updating the division");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddZone = async () => {
    setFormError(null);
    clearError();

    if (!validateZoneForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (createNewZone) {
        // Create a new zone for this division
        await createZone({
          name: zoneName.trim(),
          division_id: division.id,
        });

        setSuccessMessage(`New zone "${zoneName}" created successfully!`);
      } else if (assignExistingZone && existingZoneId !== null) {
        // Assign existing zone to this division
        const selectedZone = allZones.find((zone) => zone.id === existingZoneId);
        if (selectedZone) {
          await useDivisionManagementStore.getState().updateZone(existingZoneId, {
            division_id: division.id,
          });

          setSuccessMessage(`Zone "${selectedZone.name}" moved to this division successfully!`);
        }
      }

      // Reset zone form
      setZoneName("");
      setExistingZoneId(null);
      setAddingZone(false);

      // Refresh zones for this division
      await fetchZonesForDivision(division.id);
      setDivisionZones(zones[division.id] || []);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "An error occurred while updating zones");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Convert zones to select options
  const zoneOptions: SelectOption[] = allZones.map((zone) => ({
    label: `${zone.name} (${zone.divisionName} Division)`,
    value: zone.id,
  }));

  // Check if this division already has zones
  const hasZones = divisionZones.length > 0;
  const isUnassignedDivision = division.name.toLowerCase() === "unassigned";

  // Render content that will be inside the scroll view
  const renderContent = () => (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Edit Division</ThemedText>

      <ThemedText style={styles.description}>Update the division information and manage its zones.</ThemedText>

      {formError && (
        <ThemedView style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={20} color={themeColor.error} />
          <ThemedText style={[styles.errorText, { color: themeColor.error }]}>{formError}</ThemedText>
        </ThemedView>
      )}

      {error && (
        <ThemedView style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={20} color={themeColor.error} />
          <ThemedText style={[styles.errorText, { color: themeColor.error }]}>{error}</ThemedText>
        </ThemedView>
      )}

      {successMessage && (
        <ThemedView style={styles.successContainer}>
          <Ionicons name="checkmark-circle-outline" size={20} color={themeColor.success} />
          <ThemedText style={[styles.successText, { color: themeColor.success }]}>{successMessage}</ThemedText>
        </ThemedView>
      )}

      {/* Division Information Section */}
      <ThemedView style={styles.sectionContainer}>
        <ThemedText style={styles.sectionTitle}>Division Information</ThemedText>

        <ThemedView style={styles.formGroup}>
          <ThemedText style={styles.label}>Division Name</ThemedText>
          <Input placeholder="Enter division name" value={name} onChangeText={setName} style={styles.input} />
        </ThemedView>

        <ThemedView style={styles.formGroup}>
          <ThemedText style={styles.label}>Location</ThemedText>
          <Input placeholder="Enter location" value={location} onChangeText={setLocation} style={styles.input} />
        </ThemedView>

        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: isSubmitting ? themeColor.tabIconDefault : themeColor.tint }]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={Colors.dark.text} />
          ) : (
            <ThemedText style={styles.submitButtonText}>Update Division</ThemedText>
          )}
        </TouchableOpacity>
      </ThemedView>

      {/* Zones Section - Hide for Unassigned division */}
      {!isUnassignedDivision && (
        <ThemedView style={styles.sectionContainer}>
          <ThemedText style={styles.sectionTitle}>Zones Management</ThemedText>

          {/* Show current zones */}
          {hasZones ? (
            <ThemedView style={styles.currentZonesContainer}>
              <ThemedText style={styles.subsectionTitle}>Current Zones</ThemedText>
              {divisionZones.map((zone) => (
                <ThemedView key={zone.id} style={styles.zoneItem}>
                  <ThemedText>{zone.name}</ThemedText>
                  {zone.member_count !== undefined && (
                    <ThemedText style={styles.memberCount}>{zone.member_count} members</ThemedText>
                  )}
                </ThemedView>
              ))}
            </ThemedView>
          ) : (
            <ThemedView style={styles.warningContainer}>
              <Ionicons name="warning-outline" size={20} color={themeColor.warning} />
              <ThemedText style={styles.warningText}>
                This division has no zones. All divisions must have at least one zone.
              </ThemedText>
            </ThemedView>
          )}

          {/* Zone Add Button/Form */}
          {addingZone ? (
            <ThemedView style={styles.addZoneForm}>
              <ThemedText style={styles.subsectionTitle}>Add a Zone</ThemedText>

              <ThemedView style={styles.optionContainer}>
                <TouchableOpacity
                  style={[styles.optionButton, createNewZone && styles.selectedOption]}
                  onPress={toggleCreateNew}
                >
                  <ThemedText style={[styles.optionText, createNewZone && { color: Colors.dark.buttonText }]}>
                    Create New Zone
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.optionButton, assignExistingZone && styles.selectedOption]}
                  onPress={toggleAssignExisting}
                  disabled={allZones.length === 0}
                >
                  <ThemedText
                    style={[
                      styles.optionText,
                      allZones.length === 0 && { opacity: 0.5 },
                      assignExistingZone && { color: Colors.dark.buttonText },
                    ]}
                  >
                    Assign Existing Zone
                  </ThemedText>
                </TouchableOpacity>
              </ThemedView>

              {allZones.length === 0 && assignExistingZone && (
                <ThemedView style={styles.noteContainer}>
                  <ThemedText style={styles.noteText}>
                    No eligible zones available for assignment. A zone can only be assigned if its current division has
                    multiple zones.
                  </ThemedText>
                </ThemedView>
              )}

              {/* Create New Zone Form */}
              {createNewZone && (
                <ThemedView style={styles.formGroup}>
                  <ThemedText style={styles.label}>Zone Name</ThemedText>
                  <Input
                    placeholder="Enter zone name"
                    value={zoneName}
                    onChangeText={setZoneName}
                    style={styles.input}
                  />
                </ThemedView>
              )}

              {/* Assign Existing Zone Form */}
              {assignExistingZone && (
                <ThemedView style={styles.formGroup}>
                  <ThemedText style={styles.label}>Select Zone to Assign</ThemedText>
                  <Select
                    value={existingZoneId}
                    onValueChange={(value) => setExistingZoneId(value as number | null)}
                    options={zoneOptions}
                    placeholder="Select a zone"
                    style={styles.select}
                    disabled={isSubmitting || allZones.length === 0}
                  />

                  {existingZoneId && (
                    <ThemedView style={styles.infoContainer}>
                      <ThemedText style={styles.infoText}>
                        This zone will be moved from {sourceZoneInfo.divisionName} division to this division.
                      </ThemedText>
                    </ThemedView>
                  )}
                </ThemedView>
              )}

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.cancelButton, { borderColor: themeColor.border }]}
                  onPress={toggleAddZone}
                  disabled={isSubmitting}
                >
                  <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    { backgroundColor: isSubmitting ? themeColor.tabIconDefault : themeColor.tint },
                  ]}
                  onPress={handleAddZone}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color={Colors.dark.text} />
                  ) : (
                    <ThemedText style={styles.submitButtonText}>Add Zone</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            </ThemedView>
          ) : (
            <TouchableOpacity style={[styles.addZoneButton, { borderColor: themeColor.tint }]} onPress={toggleAddZone}>
              <Ionicons name="add-circle-outline" size={20} color={themeColor.tint} />
              <ThemedText style={[styles.addZoneButtonText, { color: themeColor.tint }]}>Add Zone</ThemedText>
            </TouchableOpacity>
          )}
        </ThemedView>
      )}

      <View style={styles.bottomButtonContainer}>
        <TouchableOpacity
          style={[styles.cancelButton, { borderColor: themeColor.border, marginRight: 0 }]}
          onPress={onComplete}
          disabled={isSubmitting}
        >
          <ThemedText style={styles.cancelButtonText}>Close</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );

  // Use conditional rendering based on platform
  if (Platform.OS === "ios" || Platform.OS === "android") {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(24, insets.bottom + 16) }]}
          showsVerticalScrollIndicator={true}
          alwaysBounceVertical={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {renderContent()}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Web-specific rendering with better scrolling behavior
  return (
    <ThemedView style={[styles.webContainer, { maxHeight: windowHeight - 100 }]}>
      <ScrollView
        style={styles.webScrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {renderContent()}
      </ScrollView>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  webContainer: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
  webScrollContainer: {
    width: "100%",
    height: "100%",
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  container: {
    padding: 20,
    maxWidth: 600,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    marginBottom: 24,
    opacity: 0.7,
  },
  sectionContainer: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    backgroundColor: Colors.dark.card,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    backgroundColor: Colors.dark.card,
  },
  formGroup: {
    marginBottom: 20,
    backgroundColor: Colors.dark.card,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    backgroundColor: Colors.dark.card,
  },
  input: {
    height: 48,
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
  },
  select: {
    height: 48,
    backgroundColor: Colors.dark.card,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  bottomButtonContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
  },
  submitButton: {
    height: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
    marginLeft: 10,
  },
  submitButtonText: {
    color: Colors.dark.buttonText,
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    height: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    flex: 1,
    marginRight: 10,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: Colors.dark.error,
    borderRadius: 8,
    marginBottom: 20,
  },
  errorText: {
    marginLeft: 8,
    flex: 1,
  },
  successContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: Colors.dark.success,
    borderRadius: 8,
    marginBottom: 20,
  },
  successText: {
    marginLeft: 8,
    flex: 1,
  },
  currentZonesContainer: {
    marginBottom: 20,
    backgroundColor: Colors.dark.card,
  },
  zoneItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 6,
    marginBottom: 8,
    backgroundColor: Colors.dark.card,
  },
  memberCount: {
    opacity: 0.7,
    fontSize: 14,
  },
  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "rgba(255, 193, 7, 0.1)",
    borderRadius: 8,
    marginBottom: 16,
  },
  warningText: {
    marginLeft: 8,
    color: Colors.dark.warning,
  },
  addZoneButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: "dashed",
  },
  addZoneButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "500",
  },
  addZoneForm: {
    marginTop: 16,
    backgroundColor: Colors.dark.card,
  },
  optionContainer: {
    flexDirection: "row",
    marginBottom: 16,
    backgroundColor: Colors.dark.card,
  },
  optionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
    marginRight: 8,
    alignItems: "center",
  },
  selectedOption: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
    borderWidth: 1,
    color: Colors.dark.buttonText,
  },
  optionText: {
    fontWeight: "500",
  },
  noteContainer: {
    padding: 8,
    backgroundColor: Colors.dark.card,
    borderRadius: 6,
    marginBottom: 16,
  },
  noteText: {
    fontSize: 14,
    opacity: 0.8,
  },
  infoContainer: {
    padding: 8,
    backgroundColor: Colors.dark.card,
    borderRadius: 6,
    marginTop: 8,
  },
  infoText: {
    fontSize: 14,
  },
});

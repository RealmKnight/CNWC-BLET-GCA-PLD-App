import React, { useState, useEffect } from "react";
import { StyleSheet, TouchableOpacity, ActivityIndicator, View, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useDivisionManagementStore } from "@/store/divisionManagementStore";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Input } from "@/components/ui/Input";
import { Select, SelectOption } from "@/components/ui/Select";

export const CreateDivisionForm = () => {
  const colorScheme = useColorScheme() ?? "light";
  const themeColor = Colors[colorScheme as keyof typeof Colors];

  const { createDivision, createZone, error, clearError, divisions, zones, fetchDivisions, fetchZonesForDivision } =
    useDivisionManagementStore();

  // Division fields
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");

  // Zone handling options
  const [createNewZone, setCreateNewZone] = useState(true);
  const [assignExistingZone, setAssignExistingZone] = useState(false);

  // Zone fields
  const [zoneName, setZoneName] = useState("");
  const [existingZoneId, setExistingZoneId] = useState<number | null>(null);
  const [sourceZoneInfo, setSourceZoneInfo] = useState<{ divisionId: number | null; divisionName: string }>({
    divisionId: null,
    divisionName: "",
  });

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // List of all zones across divisions
  const [allZones, setAllZones] = useState<
    Array<{ id: number; name: string; division_id: number; divisionName: string }>
  >([]);

  // Fetch divisions and all zones when component mounts
  useEffect(() => {
    fetchDivisions();
  }, [fetchDivisions]);

  // When divisions change, fetch zones for each division
  useEffect(() => {
    if (divisions.length > 0) {
      Promise.all(divisions.map((division) => fetchZonesForDivision(division.id))).catch((err) =>
        console.error("Error fetching zones for divisions:", err)
      );
    }
  }, [divisions, fetchZonesForDivision]);

  // Update the allZones list when zones change
  useEffect(() => {
    const zonesArray: Array<{ id: number; name: string; division_id: number; divisionName: string }> = [];

    // For each division
    divisions.forEach((division) => {
      // Get zones for this division
      const divisionZones = zones[division.id] || [];

      // Skip the "Unassigned" division or divisions with only one zone
      if (division.name === "Unassigned" || divisionZones.length <= 1) {
        return;
      }

      // Add each zone to our array with division info
      divisionZones.forEach((zone) => {
        zonesArray.push({
          id: zone.id,
          name: zone.name,
          division_id: zone.division_id,
          divisionName: division.name,
        });
      });
    });

    setAllZones(zonesArray);
  }, [divisions, zones]);

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

  const validateForm = () => {
    if (!name.trim()) {
      setFormError("Division name is required");
      return false;
    }

    if (!location.trim()) {
      setFormError("Location is required");
      return false;
    }

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
      // Create division first
      const division = await createDivision({
        name: name.trim(),
        location: location.trim(),
      });

      // Skip zone creation for "Unassigned" division
      if (name.trim().toLowerCase() !== "unassigned") {
        // Handle zone creation/assignment based on selected option
        if (createNewZone) {
          // Create a new zone for this division
          await createZone({
            name: zoneName.trim(),
            division_id: division.id,
          });

          setSuccessMessage(`Division "${division.name}" created with new zone "${zoneName}"!`);
        } else if (assignExistingZone && existingZoneId !== null) {
          // Assign existing zone to this division
          const selectedZone = allZones.find((zone) => zone.id === existingZoneId);
          if (selectedZone) {
            // The updateZone function should be called here, but it needs to be retrieved from useDivisionManagementStore
            await useDivisionManagementStore.getState().updateZone(existingZoneId, {
              division_id: division.id,
            });

            setSuccessMessage(`Division "${division.name}" created and zone "${selectedZone.name}" assigned!`);
          }
        }
      } else {
        setSuccessMessage(`Division "${division.name}" created successfully!`);
      }

      // Reset form
      setName("");
      setLocation("");
      setZoneName("");
      setExistingZoneId(null);
      setCreateNewZone(true);
      setAssignExistingZone(false);

      // Refresh divisions and zones
      fetchDivisions();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "An error occurred while creating the division");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Convert zones to select options
  const zoneOptions: SelectOption[] = allZones.map((zone) => ({
    label: `${zone.name} (${zone.divisionName} Division)`,
    value: zone.id,
  }));

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Create New Division</ThemedText>

      <ThemedText style={styles.description}>
        Create a new division with at least one zone. All divisions (except "Unassigned") must have at least one zone.
      </ThemedText>

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
      </ThemedView>

      {/* Zone Section - Hide for Unassigned division */}
      {name.trim().toLowerCase() !== "unassigned" && (
        <ThemedView style={styles.sectionContainer}>
          <ThemedText style={styles.sectionTitle}>Zone Assignment</ThemedText>
          <ThemedText style={styles.sectionDescription}>
            All divisions must have at least one zone. Choose one of the following options:
          </ThemedText>

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
              <Input placeholder="Enter zone name" value={zoneName} onChangeText={setZoneName} style={styles.input} />
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
                    This zone will be moved from {sourceZoneInfo.divisionName} division to this new division.
                  </ThemedText>
                </ThemedView>
              )}
            </ThemedView>
          )}
        </ThemedView>
      )}

      <TouchableOpacity
        style={[styles.submitButton, { backgroundColor: isSubmitting ? themeColor.tabIconDefault : themeColor.tint }]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator size="small" color={Colors.dark.text} />
        ) : (
          <ThemedText style={styles.submitButtonText}>Create Division</ThemedText>
        )}
      </TouchableOpacity>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
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
    marginBottom: 12,
    backgroundColor: Colors.dark.card,
  },
  sectionDescription: {
    fontSize: 14,
    marginBottom: 16,
    opacity: 0.7,
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
  submitButton: {
    height: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  submitButtonText: {
    color: Colors.dark.buttonText,
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
});

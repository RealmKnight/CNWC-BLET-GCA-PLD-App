import React, { useState, useEffect } from "react";
import { StyleSheet, TouchableOpacity, ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useDivisionManagementStore, Zone } from "@/store/divisionManagementStore";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Input } from "@/components/ui/Input";
import { Select, SelectOption } from "@/components/ui/Select";

interface EditZoneFormProps {
  zone: Zone;
  onComplete?: () => void;
}

export const EditZoneForm = ({ zone, onComplete }: EditZoneFormProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const themeColor = Colors[colorScheme as keyof typeof Colors];

  const { divisions, updateZone, error, clearError } = useDivisionManagementStore();

  const [name, setName] = useState(zone.name);
  const [divisionId, setDivisionId] = useState<number>(zone.division_id);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Reset form when zone changes
  useEffect(() => {
    setName(zone.name);
    setDivisionId(zone.division_id);
    setFormError(null);
    setSuccessMessage(null);
  }, [zone]);

  // Convert divisions to select options
  const divisionOptions: SelectOption[] = divisions.map((div) => ({
    label: div.name,
    value: div.id,
  }));

  const validateForm = () => {
    if (!name.trim()) {
      setFormError("Zone name is required");
      return false;
    }

    if (divisionId === null) {
      setFormError("Please select a division");
      return false;
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
      await updateZone(zone.id, {
        name: name.trim(),
        division_id: divisionId,
      });

      setSuccessMessage(`Zone updated successfully!`);

      // Call onComplete callback if provided
      if (onComplete) {
        onComplete();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "An error occurred while updating the zone");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Edit Zone</ThemedText>

      <ThemedText style={styles.description}>Update the zone information.</ThemedText>

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

      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.label}>Zone Name</ThemedText>
        <Input placeholder="Enter zone name" value={name} onChangeText={setName} style={styles.input} />
      </ThemedView>

      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.label}>Division</ThemedText>
        <Select
          value={divisionId}
          onValueChange={(value) => setDivisionId(value as number)}
          options={divisionOptions}
          placeholder="Select a division"
          style={styles.select}
          disabled={isSubmitting}
        />
      </ThemedView>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.cancelButton, { borderColor: themeColor.border }]}
          onPress={onComplete}
          disabled={isSubmitting}
        >
          <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: isSubmitting ? themeColor.tabIconDefault : themeColor.tint }]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <ThemedText style={styles.submitButtonText}>Save Changes</ThemedText>
          )}
        </TouchableOpacity>
      </View>
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
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  input: {
    height: 48,
  },
  select: {
    height: 48,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
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
    color: "#FFFFFF",
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
    backgroundColor: "rgba(231, 76, 60, 0.1)",
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
    backgroundColor: "rgba(46, 204, 113, 0.1)",
    borderRadius: 8,
    marginBottom: 20,
  },
  successText: {
    marginLeft: 8,
    flex: 1,
  },
});

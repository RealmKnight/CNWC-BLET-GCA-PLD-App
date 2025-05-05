import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useDivisionManagementStore } from "@/store/divisionManagementStore";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Input } from "@/components/ui/Input";
import { Select, SelectOption } from "@/components/ui/Select";

export const CreateZoneForm = () => {
  const colorScheme = useColorScheme() ?? "light";
  const themeColor = Colors[colorScheme as keyof typeof Colors];

  const { divisions, createZone, error, clearError } = useDivisionManagementStore();

  const [name, setName] = useState("");
  const [divisionId, setDivisionId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
      if (divisionId === null) {
        throw new Error("Division is required");
      }

      const zone = await createZone({
        name: name.trim(),
        division_id: divisionId,
      });

      setSuccessMessage(`Zone "${zone.name}" created successfully!`);

      // Reset form
      setName("");
      setDivisionId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "An error occurred while creating the zone");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Create New Zone</ThemedText>

      <ThemedText style={styles.description}>Create a new zone within an existing division.</ThemedText>

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
        <ThemedText style={styles.label}>Division</ThemedText>
        <Select
          value={divisionId}
          onValueChange={(value) => setDivisionId(value as number | null)}
          options={divisionOptions}
          placeholder="Select a division"
          style={styles.select}
          disabled={isSubmitting}
        />
      </ThemedView>

      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.label}>Zone Name</ThemedText>
        <Input placeholder="Enter zone name" value={name} onChangeText={setName} style={styles.input} />
      </ThemedView>

      <TouchableOpacity
        style={[styles.submitButton, { backgroundColor: isSubmitting ? themeColor.tabIconDefault : themeColor.tint }]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator size="small" color={Colors.dark.text} />
        ) : (
          <ThemedText style={styles.submitButtonText}>Create Zone</ThemedText>
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
  formGroup: {
    marginBottom: 20,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    padding: 16,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
  },
  select: {
    height: 48,
    borderWidth: 1,
    borderColor: Colors.dark.border,
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

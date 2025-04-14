// components/admin/division/CalendarCrudAdmin.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Button,
  Switch,
  FlatList,
  TouchableOpacity,
  Alert,
  ViewStyle,
  Platform,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useAdminCalendarManagementStore } from "@/store/adminCalendarManagementStore";
import { useUserStore } from "@/store/userStore";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { Calendar } from "@/types/calendar"; // Import Calendar type
import { supabase } from "@/utils/supabase";

interface CalendarCrudAdminProps {
  // Props needed? Perhaps the selected division ID/name if not easily accessible from stores?
  selectedDivisionName: string; // Need the name to get calendars from store
  style?: ViewStyle; // Add style prop
}

export function CalendarCrudAdmin({ selectedDivisionName, style }: CalendarCrudAdminProps) {
  const {
    calendars: divisionCalendarsMap, // Map of divisionName -> Calendar[]
    createCalendar,
    updateCalendar,
    fetchDivisionSettings, // To refresh list after changes
    isLoading,
    error,
    setError,
    setIsLoading,
  } = useAdminCalendarManagementStore();
  const { member } = useUserStore(); // For permission checks and division ID mapping

  // Add state for selected division ID
  const [selectedDivisionId, setSelectedDivisionId] = useState<number | null>(null);

  // Add useEffect to fetch division ID when division name changes
  useEffect(() => {
    const fetchDivisionId = async () => {
      if (!selectedDivisionName) return;

      try {
        const { data, error } = await supabase.from("divisions").select("id").eq("name", selectedDivisionName).single();

        if (error) throw error;
        if (data) {
          console.log(`[CalendarCrudAdmin] Found division ID ${data.id} for division ${selectedDivisionName}`);
          setSelectedDivisionId(data.id);
        }
      } catch (err) {
        console.error("[CalendarCrudAdmin] Error fetching division ID:", err);
        setError("Failed to fetch division information");
      }
    };

    fetchDivisionId();
  }, [selectedDivisionName]);

  // Add useEffect to refresh calendar list when division changes
  useEffect(() => {
    if (selectedDivisionName) {
      console.log("[CalendarCrudAdmin] Selected division changed, refreshing calendars:", selectedDivisionName);
      fetchDivisionSettings(selectedDivisionName);
    }
  }, [selectedDivisionName]);

  const [isAdding, setIsAdding] = useState(false);
  const [newCalendarName, setNewCalendarName] = useState("");
  const [newCalendarDescription, setNewCalendarDescription] = useState("");
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;
  // Define a fallback color for 'grey' that works in both themes
  const greyColor = Colors[colorScheme].border || "#cccccc";

  const calendars = divisionCalendarsMap[selectedDivisionName] || [];

  // Use selectedDivisionId for admin operations, fallback to member's division_id for non-admin
  const effectiveDivisionId =
    member?.role === "application_admin" || member?.role === "union_admin" ? selectedDivisionId : member?.division_id;

  const canManage =
    member?.role === "application_admin" || member?.role === "union_admin" || member?.role === "division_admin";

  const handleAddCalendar = async () => {
    if (!canManage || !effectiveDivisionId || !newCalendarName.trim()) {
      Alert.alert("Error", "Missing division info or calendar name.");
      return;
    }

    try {
      setError(null);
      setIsLoading(true);

      console.log("[CalendarCrudAdmin] Creating new calendar:", {
        divisionId: effectiveDivisionId,
        name: newCalendarName.trim(),
        description: newCalendarDescription.trim(),
        selectedDivision: selectedDivisionName,
      });

      const newCal = await createCalendar(
        effectiveDivisionId,
        newCalendarName.trim(),
        newCalendarDescription.trim() || undefined
      );

      if (newCal) {
        setIsAdding(false);
        setNewCalendarName("");
        setNewCalendarDescription("");

        // Force refresh the division settings
        console.log("[CalendarCrudAdmin] Calendar created, refreshing division settings:", selectedDivisionName);
        await fetchDivisionSettings(selectedDivisionName);

        // Show success message
        Alert.alert("Success", "Calendar created successfully.");
      } else {
        Alert.alert("Error", "Failed to create calendar. " + (error || ""));
      }
    } catch (err) {
      console.error("[CalendarCrudAdmin] Error creating calendar:", err);
      Alert.alert("Error", "Failed to create calendar. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartEdit = (calendar: Calendar) => {
    setEditingCalendar(calendar);
    setEditName(calendar.name);
    setEditDesc(calendar.description || "");
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingCalendar(null);
    setEditName("");
    setEditDesc("");
  };

  const handleUpdateCalendar = async () => {
    if (!canManage || !editingCalendar || !editName.trim()) {
      Alert.alert("Error", "Missing calendar info or name.");
      return;
    }
    setError(null);
    const success = await updateCalendar(editingCalendar.id, {
      name: editName.trim(),
      description: editDesc.trim() || undefined,
    });
    if (success) {
      setEditingCalendar(null);
      await fetchDivisionSettings(selectedDivisionName); // Refresh list
    } else {
      Alert.alert("Error", "Failed to update calendar. " + (error || ""));
    }
  };

  const handleToggleActive = async (calendar: Calendar) => {
    if (!canManage) return;
    if (calendars.filter((c) => c.is_active).length <= 1 && calendar.is_active) {
      Alert.alert("Action Denied", "Cannot deactivate the last active calendar.");
      return;
    }
    setError(null);
    const success = await updateCalendar(calendar.id, { is_active: !calendar.is_active });
    if (success) {
      await fetchDivisionSettings(selectedDivisionName); // Refresh list
    } else {
      Alert.alert("Error", "Failed to toggle calendar status. " + (error || ""));
    }
  };

  const renderCalendarItem = ({ item }: { item: Calendar }) => (
    <ThemedView style={styles.itemContainer}>
      {editingCalendar?.id === item.id ? (
        // Edit Form
        <View style={styles.editForm}>
          <TextInput
            style={styles.input}
            value={editName}
            onChangeText={setEditName}
            placeholder="Calendar Name"
            editable={!isLoading}
          />
          <TextInput
            style={[styles.input, styles.descInput]}
            value={editDesc}
            onChangeText={setEditDesc}
            placeholder="Description (Optional)"
            multiline
            editable={!isLoading}
          />
          <View style={styles.editButtons}>
            <Button
              title="Cancel"
              onPress={handleCancelEdit}
              disabled={isLoading}
              color={Colors[colorScheme].secondary}
            />
            <Button
              title="Save"
              onPress={handleUpdateCalendar}
              disabled={isLoading || !editName.trim()}
              color={tintColor}
            />
          </View>
        </View>
      ) : (
        // Display Row
        <View style={styles.displayRow}>
          <View style={styles.infoColumn}>
            <ThemedText style={styles.itemName}>{item.name}</ThemedText>
            {item.description && <ThemedText style={styles.itemDesc}>{item.description}</ThemedText>}
          </View>
          <View style={styles.actionsColumn}>
            <ThemedText style={styles.statusText}>Active:</ThemedText>
            <Switch
              value={item.is_active}
              onValueChange={() => handleToggleActive(item)}
              disabled={isLoading || !canManage}
              thumbColor={item.is_active ? tintColor : greyColor}
              trackColor={{ false: greyColor, true: tintColor + "50" }}
            />
            <TouchableOpacity onPress={() => handleStartEdit(item)} disabled={isLoading || !canManage}>
              <Ionicons name="pencil" size={20} color={canManage ? tintColor : greyColor} />
            </TouchableOpacity>
            {/* Optional: Delete button (requires more logic/confirmation) */}
          </View>
        </View>
      )}
    </ThemedView>
  );

  if (!canManage) {
    return (
      <ThemedView>
        <ThemedText>Permission denied.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, style]}>
      <ThemedText type="subtitle" style={styles.sectionTitle}>
        Manage Calendars
      </ThemedText>

      {/* Add New Calendar Section */}
      {isAdding ? (
        <ThemedView style={styles.addForm}>
          <TextInput
            style={styles.input}
            value={newCalendarName}
            onChangeText={setNewCalendarName}
            placeholder="New Calendar Name"
            editable={!isLoading}
          />
          <TextInput
            style={[styles.input, styles.descInput]}
            value={newCalendarDescription}
            onChangeText={setNewCalendarDescription}
            placeholder="Description (Optional)"
            multiline
            editable={!isLoading}
          />
          <View style={styles.addButtons}>
            <Button
              title="Cancel"
              onPress={() => setIsAdding(false)}
              disabled={isLoading}
              color={Colors[colorScheme].secondary}
            />
            <Button
              title="Add Calendar"
              onPress={handleAddCalendar}
              disabled={isLoading || !newCalendarName.trim()}
              color={tintColor}
            />
          </View>
        </ThemedView>
      ) : (
        <Button
          title="Add New Calendar"
          onPress={() => {
            setIsAdding(true);
            setError(null);
          }}
          disabled={isLoading}
          color={tintColor}
        />
      )}

      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

      {/* List of Calendars */}
      <FlatList
        data={calendars}
        renderItem={renderCalendarItem}
        keyExtractor={(item) => item.id}
        style={styles.list}
        nestedScrollEnabled={true}
        scrollEnabled={Platform.OS !== "web"}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: Platform.OS === "web" ? 1 : undefined,
    minHeight: 0,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  list: {
    flex: Platform.OS === "web" ? 1 : undefined,
    minHeight: 0,
    marginBottom: 16,
  },
  itemContainer: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border, // Use theme colors
    backgroundColor: Colors.dark.card, // Use theme colors
  },
  displayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoColumn: {
    flex: 1,
    marginRight: 10,
  },
  actionsColumn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  itemName: {
    fontWeight: "bold",
    fontSize: 16,
  },
  itemDesc: {
    fontSize: 14,
    color: Colors.light.textDim, // Use theme colors
    marginTop: 4,
  },
  statusText: {
    fontSize: 14,
    color: Colors.light.textDim,
  },
  addForm: {
    padding: 10,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    gap: 10,
  },
  addButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  editForm: {
    gap: 10,
  },
  editButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 4,
    padding: 8,
    fontSize: 16,
    backgroundColor: Colors.light.background,
    color: Colors.light.text,
  },
  descInput: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  errorText: {
    color: Colors.light.error,
    marginTop: 8,
    textAlign: "center",
  },
});

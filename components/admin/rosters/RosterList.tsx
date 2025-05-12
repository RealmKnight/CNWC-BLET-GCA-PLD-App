import React, { useState, useEffect } from "react";
import { StyleSheet, View, FlatList, Switch, Platform, useWindowDimensions } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useThemeColor } from "@/hooks/useThemeColor";
import { supabase } from "@/utils/supabase";
import { Roster, RosterTypeRecord } from "@/types/rosters";

interface RosterListProps {
  onSelectRoster: (roster: Roster) => void;
}

interface RosterWithType extends Roster {
  roster_type_name: string;
}

export function RosterList({ onSelectRoster }: RosterListProps) {
  const { width } = useWindowDimensions();
  const isMobileView = width < 768;
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const themeTintColor = useThemeColor({}, "tint");

  const [rosters, setRosters] = useState<RosterWithType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Available years for the dropdown
  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: 8 }, (_, i) => currentYear - i);

  useEffect(() => {
    fetchRosters();
  }, [selectedYear]);

  const fetchRosters = async () => {
    setIsLoading(true);
    try {
      // Fetch rosters for the selected year
      const { data: rostersData, error: rostersError } = await supabase
        .from("rosters")
        .select("*")
        .eq("year", selectedYear)
        .order("created_at", { ascending: false });

      if (rostersError) throw rostersError;

      // Fetch roster types for names
      const { data: rosterTypes, error: typesError } = await supabase.from("roster_types").select("*");

      if (typesError) throw typesError;

      // Create a map of roster type IDs to names
      const rosterTypeMap = new Map((rosterTypes as RosterTypeRecord[]).map((type) => [type.id, type.name]));

      // Combine the data
      const rostersWithTypes = (rostersData as Roster[]).map((roster) => ({
        ...roster,
        roster_type_name: rosterTypeMap.get(roster.roster_type_id) || "Unknown",
      }));

      setRosters(rostersWithTypes);
    } catch (error) {
      console.error("Error fetching rosters:", error);
      setError(error instanceof Error ? error.message : "Failed to fetch rosters");
    } finally {
      setIsLoading(false);
    }
  };

  const renderRosterItem = ({ item }: { item: RosterWithType }) => {
    // Format the effective date for display
    const effectiveDate = item.effective_date ? new Date(item.effective_date).toLocaleDateString() : "N/A";

    return (
      <TouchableOpacityComponent style={styles.rosterItem} onPress={() => onSelectRoster(item)} activeOpacity={0.7}>
        <View style={styles.rosterInfo}>
          <ThemedText style={styles.rosterName}>{item.name}</ThemedText>
          <View style={styles.rosterDetails}>
            <ThemedText style={styles.rosterType}>Type: {item.roster_type_name}</ThemedText>
            <ThemedText style={styles.rosterDate}>Effective: {effectiveDate}</ThemedText>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={24} color={Colors[colorScheme].text} />
      </TouchableOpacityComponent>
    );
  };

  const renderYearPicker = () => {
    if (Platform.OS === "web") {
      return (
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          style={{
            height: 40,
            padding: 8,
            backgroundColor: Colors[colorScheme].background,
            color: Colors[colorScheme].text,
            borderColor: Colors[colorScheme].border,
            borderWidth: 1,
            borderRadius: 8,
            minWidth: 120,
          }}
        >
          {availableYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      );
    } else {
      // For native platforms, we'd use a different picker
      // This is simplified for brevity
      return (
        <View style={styles.pickerContainer}>
          {availableYears.map((year) => (
            <TouchableOpacityComponent
              key={year}
              style={[styles.yearButton, selectedYear === year && { backgroundColor: themeTintColor }]}
              onPress={() => setSelectedYear(year)}
            >
              <ThemedText style={selectedYear === year ? styles.selectedYearText : styles.yearText}>{year}</ThemedText>
            </TouchableOpacityComponent>
          ))}
        </View>
      );
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Yearly Rosters</ThemedText>
        <View style={styles.yearSelector}>
          <ThemedText style={styles.yearLabel}>Select Year:</ThemedText>
          {renderYearPicker()}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerContent}>
          <ThemedText>Loading rosters...</ThemedText>
        </View>
      ) : error ? (
        <View style={styles.centerContent}>
          <ThemedText>Error: {error}</ThemedText>
        </View>
      ) : rosters.length === 0 ? (
        <View style={styles.centerContent}>
          <ThemedText>No rosters found for {selectedYear}</ThemedText>
        </View>
      ) : (
        <FlatList
          data={rosters}
          renderItem={renderRosterItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  yearSelector: {
    flexDirection: "row",
    alignItems: "center",
  },
  yearLabel: {
    marginRight: 8,
  },
  pickerContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  yearButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  yearText: {
    fontSize: 14,
  },
  selectedYearText: {
    fontSize: 14,
    color: Colors.dark.buttonText,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: 16,
  },
  rosterItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
  },
  rosterInfo: {
    flex: 1,
  },
  rosterName: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  rosterDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  rosterType: {
    fontSize: 14,
    opacity: 0.8,
    marginRight: 12,
  },
  rosterDate: {
    fontSize: 14,
    opacity: 0.8,
  },
});

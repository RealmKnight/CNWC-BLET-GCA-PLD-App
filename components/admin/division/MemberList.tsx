import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  Platform,
  Pressable,
  VirtualizedList,
  useWindowDimensions,
  ViewStyle,
  TextStyle,
  AppState,
  Alert,
  Switch,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/utils/supabase";
import { Picker } from "@react-native-picker/picker";
import Toast from "react-native-toast-message";
import { useAdminMemberManagementStore } from "@/store/adminMemberManagementStore";

interface Member {
  pin_number: string | number;
  first_name: string;
  last_name: string;
  division_id: number;
  sdv_entitlement: number | null;
  sdv_election: number | null;
  calendar_id: string | null;
  calendar_name: string | null;
  status: string;
}

interface Calendar {
  id: string;
  name: string;
}

interface MemberWithCalendar extends Omit<Member, "calendar_name"> {
  calendar: Calendar | null;
}

interface MemberListProps {
  onEditMember: (member: Member) => void;
}

const WebButton = ({ onPress, children }: { onPress: () => void; children: React.ReactNode }) => (
  <button
    onClick={onPress}
    style={{
      background: "none",
      border: "none",
      padding: "8px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {children}
  </button>
);

const MemberItem = React.memo(
  ({
    item,
    onPress,
    onUpdate,
    onCalendarEdit,
    isCalendarEditing,
    availableCalendars,
    onCalendarChange,
  }: {
    item: Member;
    onPress: () => void;
    onUpdate: () => void;
    onCalendarEdit: (pin: string) => void;
    isCalendarEditing: boolean;
    availableCalendars: Calendar[];
    onCalendarChange: (pin: string | number, calendarId: string | null) => void;
  }) => {
    const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [entitlement, setEntitlement] = useState(String(item.sdv_entitlement || ""));
    const [election, setElection] = useState(String(item.sdv_election || ""));
    const [hasChanges, setHasChanges] = useState(false);
    const { width } = useWindowDimensions();
    const isMobileView = width < 768;
    const isWeb = Platform.OS === "web";

    const handleSave = async () => {
      try {
        const entitlementNum = parseInt(entitlement);
        const electionNum = parseInt(election);

        if (
          isNaN(entitlementNum) ||
          isNaN(electionNum) ||
          entitlementNum < 0 ||
          entitlementNum > 12 ||
          electionNum < 0 ||
          electionNum > 12
        ) {
          Alert.alert("Invalid Input", "SDV values must be between 0 and 12");
          return;
        }

        const { error } = await supabase
          .from("members")
          .update({
            sdv_entitlement: entitlementNum,
            sdv_election: electionNum,
          })
          .eq("pin_number", typeof item.pin_number === "string" ? parseInt(item.pin_number) : item.pin_number);

        if (error) throw error;

        // Update the item's values locally
        item.sdv_entitlement = entitlementNum;
        item.sdv_election = electionNum;

        setIsEditing(false);
        setHasChanges(false);
        onUpdate(); // Trigger parent refresh
      } catch (error) {
        console.error("Error updating SDV values:", error);
        Alert.alert("Error", "Failed to update SDV values");
      }
    };

    const handleTextInput = (text: string, setter: (value: string) => void) => {
      // Only allow numbers 0-9
      const numericText = text.replace(/[^0-9]/g, "");
      if (numericText === "" || parseInt(numericText) <= 12) {
        setter(numericText);
        setHasChanges(true);
      }
    };

    const renderSDVContent = () => {
      if (isWeb && !isMobileView) {
        return (
          <View style={styles.sdvContainer}>
            <View style={styles.sdvSection}>
              <ThemedText style={styles.sdvLabel}>SDV Entitlement</ThemedText>
              {isEditing ? (
                <TextInput
                  style={[styles.sdvInput, { color: Colors[colorScheme].text }]}
                  value={entitlement}
                  onChangeText={(text) => handleTextInput(text, setEntitlement)}
                  keyboardType="numeric"
                  maxLength={2}
                />
              ) : (
                <ThemedText style={styles.sdvValue}>{item.sdv_entitlement || 0}</ThemedText>
              )}
            </View>
            <View style={styles.sdvSection}>
              <ThemedText style={styles.sdvLabel}>SDV Election</ThemedText>
              {isEditing ? (
                <TextInput
                  style={[styles.sdvInput, { color: Colors[colorScheme].text }]}
                  value={election}
                  onChangeText={(text) => handleTextInput(text, setElection)}
                  keyboardType="numeric"
                  maxLength={2}
                />
              ) : (
                <ThemedText style={styles.sdvValue}>{item.sdv_election || 0}</ThemedText>
              )}
            </View>

            <TouchableOpacityComponent
              style={styles.editButton}
              onPress={() => {
                if (isEditing && hasChanges) {
                  handleSave();
                } else {
                  setIsEditing(!isEditing);
                }
              }}
            >
              <Ionicons
                name={isEditing ? (hasChanges ? "save" : "close") : "create"}
                size={20}
                color={Colors[colorScheme].text}
              />
            </TouchableOpacityComponent>
          </View>
        );
      }

      // Mobile and mobile web view accordion content
      return (
        <View style={styles.mobileSDVWrapper}>
          <TouchableOpacityComponent
            style={[styles.mobileSDVButton, isExpanded && styles.mobileSDVButtonExpanded]}
            onPress={() => setIsExpanded(!isExpanded)}
          >
            <View style={styles.mobileSDVButtonContent}>
              <ThemedText style={styles.mobileSDVButtonText}>SDV Values {isExpanded ? "▼" : "▶"}</ThemedText>
            </View>
          </TouchableOpacityComponent>

          {isExpanded && (
            <View style={styles.mobileSDVContent}>
              <View style={styles.mobileSDVRow}>
                <ThemedText style={styles.mobileSDVLabel}>SDV Entitlement:</ThemedText>
                {isEditing ? (
                  <TextInput
                    style={[styles.mobileSDVInput, { color: Colors[colorScheme].text }]}
                    value={entitlement}
                    onChangeText={(text) => handleTextInput(text, setEntitlement)}
                    keyboardType="numeric"
                    maxLength={2}
                  />
                ) : (
                  <ThemedText style={styles.mobileSDVValue}>{item.sdv_entitlement || 0}</ThemedText>
                )}
              </View>
              <View style={styles.mobileSDVRow}>
                <ThemedText style={styles.mobileSDVLabel}>SDV Election:</ThemedText>
                {isEditing ? (
                  <TextInput
                    style={[styles.mobileSDVInput, { color: Colors[colorScheme].text }]}
                    value={election}
                    onChangeText={(text) => handleTextInput(text, setElection)}
                    keyboardType="numeric"
                    maxLength={2}
                  />
                ) : (
                  <ThemedText style={styles.mobileSDVValue}>{item.sdv_election || 0}</ThemedText>
                )}
              </View>
              <TouchableOpacityComponent
                style={styles.mobileEditButton}
                onPress={() => {
                  if (isEditing && hasChanges) {
                    handleSave();
                  } else {
                    setIsEditing(!isEditing);
                  }
                }}
              >
                <Ionicons
                  name={isEditing ? (hasChanges ? "save" : "close") : "create"}
                  size={20}
                  color={Colors[colorScheme].text}
                />
              </TouchableOpacityComponent>
            </View>
          )}
        </View>
      );
    };

    return (
      <TouchableOpacityComponent
        style={[
          styles.memberItem,
          (!isWeb || isMobileView) && isExpanded && styles.memberItemExpanded,
          isMobileView && styles.mobileWebMemberItem,
          item.status !== "ACTIVE" && styles.inactiveMemberItem,
        ]}
        onPress={isWeb && !isMobileView && !isCalendarEditing ? onPress : undefined}
        activeOpacity={0.7}
      >
        <View style={styles.memberInfo}>
          <ThemedText style={styles.memberName}>
            {item.last_name}, {item.first_name}
            {item.status !== "ACTIVE" && <ThemedText style={styles.inactiveText}> (Inactive)</ThemedText>}
          </ThemedText>
          <View style={styles.subInfoContainer}>
            <ThemedText style={styles.memberPin}>PIN: {item.pin_number}</ThemedText>
            <TouchableOpacityComponent
              onPress={(e) => {
                e.stopPropagation();
                onCalendarEdit(String(item.pin_number));
              }}
              style={styles.calendarContainer}
            >
              {isCalendarEditing ? (
                <Picker
                  selectedValue={item.calendar_id || ""}
                  onValueChange={(value) => onCalendarChange(item.pin_number, value)}
                  style={styles.calendarPicker}
                >
                  <Picker.Item label="No Calendar Assigned" value="" />
                  {availableCalendars.map((calendar) => (
                    <Picker.Item key={calendar.id} label={calendar.name} value={calendar.id} />
                  ))}
                </Picker>
              ) : (
                <ThemedText style={styles.memberCalendar} numberOfLines={1} ellipsizeMode="tail">
                  Calendar: {item.calendar_name || "No Calendar Assigned"}
                </ThemedText>
              )}
            </TouchableOpacityComponent>
          </View>
        </View>
        {renderSDVContent()}
      </TouchableOpacityComponent>
    );
  }
);

export function MemberList({ onEditMember }: MemberListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [isEditingCalendar, setIsEditingCalendar] = useState<string | null>(null);
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const themeTintColor = useThemeColor({}, "tint");

  // Use the store
  const { members, isLoading, error, updateMember, availableCalendars } = useAdminMemberManagementStore();

  const filteredMembers = members
    .filter((member) => showInactive || member.status === "ACTIVE")
    .filter(
      (member) =>
        searchQuery === "" ||
        `${member.first_name} ${member.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.pin_number.toString().includes(searchQuery)
    );

  const getItem = (data: Member[], index: number) => data[index];
  const getItemCount = (data: Member[]) => data.length;
  const keyExtractor = (item: Member) => item.pin_number.toString();

  const handleMemberUpdate = useCallback(() => {
    updateMember();
  }, [updateMember]);

  const handleCalendarChange = async (memberId: string | number, calendarId: string | null) => {
    try {
      const pinNumber = typeof memberId === "string" ? parseInt(memberId, 10) : memberId;
      const { error } = await supabase.from("members").update({ calendar_id: calendarId }).eq("pin_number", pinNumber);

      if (error) throw error;

      Toast.show({
        type: "success",
        text1: "Success",
        text2: "Calendar updated successfully",
      });

      updateMember(); // Refresh the list using the store's update function
    } catch (error) {
      console.error("Error updating calendar:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: error instanceof Error ? error.message : "Failed to update calendar",
      });
    } finally {
      setIsEditingCalendar(null);
    }
  };

  const renderItem = ({ item }: { item: Member }) => (
    <MemberItem
      item={item}
      onPress={() => onEditMember(item)}
      onUpdate={handleMemberUpdate}
      onCalendarEdit={setIsEditingCalendar}
      isCalendarEditing={isEditingCalendar === String(item.pin_number)}
      availableCalendars={availableCalendars}
      onCalendarChange={handleCalendarChange}
    />
  );

  return (
    <ThemedView style={styles.container}>
      <View style={styles.controls}>
        <View style={styles.searchInputWrapper}>
          <TextInput
            style={[styles.searchInput, { color: Colors[colorScheme].text }]}
            placeholder="Search members..."
            placeholderTextColor={Colors[colorScheme].text}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery !== "" && (
            <TouchableOpacityComponent
              style={styles.clearButton}
              onPress={() => setSearchQuery("")}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle" size={20} color={Colors[colorScheme].text} />
            </TouchableOpacityComponent>
          )}
        </View>
        <View style={styles.toggleWrapper}>
          <ThemedText style={styles.toggleLabel}>Show In-Active</ThemedText>
          <Switch
            trackColor={{ false: Colors[colorScheme].border, true: themeTintColor }}
            thumbColor={showInactive ? Colors[colorScheme].background : Colors[colorScheme].icon}
            ios_backgroundColor={Colors[colorScheme].border}
            onValueChange={setShowInactive}
            value={showInactive}
          />
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerContent}>
          <ThemedText>Loading members...</ThemedText>
        </View>
      ) : filteredMembers.length === 0 ? (
        <View style={styles.centerContent}>
          <ThemedText>No members found</ThemedText>
        </View>
      ) : (
        <VirtualizedList
          data={filteredMembers}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemCount={getItemCount}
          getItem={getItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={true}
          scrollEnabled={true}
          removeClippedSubviews={Platform.OS !== "web"}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  controls: {
    padding: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  searchInputWrapper: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingRight: 40,
    ...(Platform.OS === "web" && {
      outlineColor: Colors.light.tint,
      outlineWidth: 0,
    }),
  },
  clearButton: {
    position: "absolute",
    right: 8,
    top: 10,
    padding: 4,
    zIndex: 1,
    ...(Platform.OS === "web" && {
      cursor: "pointer",
      minWidth: 30,
      minHeight: 30,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }),
  },
  toggleWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingRight: 8,
  },
  toggleLabel: {
    marginRight: 10,
    fontSize: 14,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: Colors.light.background,
  },
  inactiveMemberItem: {
    opacity: 0.6,
    backgroundColor: Colors.light.border,
  },
  inactiveText: {
    fontSize: 12,
    fontStyle: "italic",
    marginLeft: 4,
    opacity: 0.8,
  },
  memberInfo: {
    flex: 1,
    marginRight: 8,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "500",
  },
  subInfoContainer: {
    marginTop: 4,
    opacity: 0.8,
    flexDirection: "column",
    alignItems: "flex-start",
  },
  memberPin: {
    fontSize: 14,
    marginBottom: 2,
  },
  memberCalendar: {
    fontSize: 14,
    fontStyle: "italic",
  },
  calendarContainer: {
    marginTop: 4,
    maxWidth: "100%",
  },
  calendarPicker: {
    minWidth: 200,
    maxWidth: "100%",
    height: Platform.OS === "web" ? 32 : undefined,
  },
  sdvContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  sdvSection: {
    alignItems: "center",
    minWidth: 80,
  },
  sdvLabel: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 4,
  },
  sdvValue: {
    fontSize: 16,
    fontWeight: "500",
  },
  sdvInput: {
    width: 50,
    height: 32,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    textAlign: "center",
    fontSize: 16,
  },
  editButton: {
    padding: 8,
  },
  memberItemExpanded: {},
  mobileSDVWrapper: {
    width: "100%",
    maxWidth: "100%",
    marginTop: 8,
  },
  mobileSDVButton: {
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.light.background,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  mobileSDVButtonExpanded: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  mobileSDVButtonContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mobileSDVButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  mobileSDVContent: {
    padding: 16,
    paddingBottom: 20,
    backgroundColor: Colors.light.background + "f0",
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderTopWidth: 0,
  },
  mobileSDVRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  mobileSDVField: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 4,
  },
  mobileSDVLabel: {
    fontSize: 12,
    opacity: 0.7,
    marginRight: 8,
  },
  mobileSDVValue: {
    fontSize: 16,
    fontWeight: "500",
  },
  mobileSDVInput: {
    width: 60,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 4,
    textAlign: "center",
    fontSize: 16,
    paddingVertical: 8,
    ...(Platform.OS === "web" && {
      outlineColor: Colors.light.tint,
      outlineWidth: 0,
    }),
  },
  mobileEditButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.light.background,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.light.tint,
    gap: 8,
    marginTop: 12,
  },
  mobileEditButtonActive: {
    backgroundColor: Colors.light.tint,
  },
  mobileEditButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.light.tint,
  },
  mobileEditButtonTextActive: {
    color: "#fff",
  },
  mobileEditButtonDisabled: {
    opacity: 0.5,
    backgroundColor: Colors.light.background,
  },
  mobileWebMemberItem: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    flexDirection: "column",
    alignItems: "stretch",
  },
});

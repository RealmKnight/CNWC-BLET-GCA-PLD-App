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
import { useAdminMemberManagementStore, MemberData } from "@/store/adminMemberManagementStore";

// Re-add Calendar interface definition
interface Calendar {
  id: string;
  name: string;
}

interface MemberListProps {
  onEditMember: (member: MemberData) => void;
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
    onCalendarEdit,
    isCalendarEditing,
    availableCalendars,
    onCalendarChange,
  }: {
    item: MemberData;
    onPress: () => void;
    onCalendarEdit: (pin: string) => void;
    isCalendarEditing: boolean;
    availableCalendars: Calendar[];
    onCalendarChange: (pin: string | number, calendarId: string | null) => void;
  }) => {
    const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
    const { width } = useWindowDimensions();
    const isMobileView = width < 768;
    const isWeb = Platform.OS === "web";

    return (
      <TouchableOpacityComponent
        style={[
          styles.memberItem,
          isMobileView && styles.mobileWebMemberItem,
          item.status !== "ACTIVE" && styles.inactiveMemberItem,
        ]}
        onPress={!isCalendarEditing ? onPress : undefined}
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
      </TouchableOpacityComponent>
    );
  }
);

export function MemberList({ onEditMember }: MemberListProps) {
  const { width } = useWindowDimensions();
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const themeTintColor = useThemeColor({}, "tint");
  const listRef = useRef<VirtualizedList<MemberData>>(null);
  const scrollPositionRef = useRef<number>(0);
  const firstRenderRef = useRef<boolean>(true);

  // Use the store for data and UI state
  const { members, isLoading, error, updateMember, availableCalendars, memberListUIState, updateMemberListUIState } =
    useAdminMemberManagementStore();

  // Use local state that's initialized from the store
  const [searchQuery, setSearchQuery] = useState(memberListUIState.searchQuery);
  const [showInactive, setShowInactive] = useState(memberListUIState.showInactive);
  const [isEditingCalendar, setIsEditingCalendar] = useState<string | null>(null);

  // Initialize the scroll position ref from the store
  useEffect(() => {
    scrollPositionRef.current = memberListUIState.scrollPosition;
  }, []);

  // Filter members based on current search and toggle state
  const filteredMembers = members
    .filter((member) => showInactive || member.status === "ACTIVE")
    .filter(
      (member) =>
        searchQuery === "" ||
        `${member.first_name} ${member.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.pin_number.toString().includes(searchQuery)
    );

  // Update store when local state changes
  const updateSearchQuery = useCallback(
    (query: string) => {
      setSearchQuery(query);
      updateMemberListUIState({ searchQuery: query });
    },
    [updateMemberListUIState]
  );

  const updateShowInactive = useCallback(
    (value: boolean) => {
      setShowInactive(value);
      updateMemberListUIState({ showInactive: value });
    },
    [updateMemberListUIState]
  );

  // Restore scroll position or find last edited member
  useEffect(() => {
    if (!firstRenderRef.current) return;
    firstRenderRef.current = false;

    // Sync UI state from store first
    setSearchQuery(memberListUIState.searchQuery);
    setShowInactive(memberListUIState.showInactive);

    // Restore scroll position after component is fully mounted
    const restoreScrollTimer = setTimeout(() => {
      // Only restore if we have a list ref
      if (listRef.current) {
        // First try to find the last edited member if we have one
        if (memberListUIState.lastEditedMemberPin) {
          const memberIndex = filteredMembers.findIndex(
            (m) => m.pin_number.toString() === memberListUIState.lastEditedMemberPin
          );

          if (memberIndex >= 0) {
            // We found the member, scroll to its position with some offset
            listRef.current.scrollToIndex({
              index: memberIndex,
              animated: false,
              viewOffset: 80, // Show some members above the selected one
            });
            return;
          }
        }

        // Fall back to the stored scroll position if we can't find the member
        if (memberListUIState.scrollPosition > 0) {
          listRef.current.scrollToOffset({
            offset: memberListUIState.scrollPosition,
            animated: false,
          });
        }
      }
    }, 100);

    return () => clearTimeout(restoreScrollTimer);
  }, [filteredMembers, memberListUIState]);

  // Save scroll position when component unmounts
  useEffect(() => {
    return () => {
      // Save the latest scroll position when unmounting
      updateMemberListUIState({ scrollPosition: scrollPositionRef.current });
    };
  }, [updateMemberListUIState]);

  // Save scroll position to ref and store
  const handleScroll = useCallback(
    (event: any) => {
      const position = event.nativeEvent.contentOffset.y;
      scrollPositionRef.current = position;

      // Debounce updates to the store to avoid excessive state updates
      if (Platform.OS === "web") {
        // For web, use a more aggressive throttling - less frequent updates
        if (Math.abs(position - memberListUIState.scrollPosition) > 100) {
          updateMemberListUIState({ scrollPosition: position });
        }
      } else {
        // For mobile, use less aggressive throttling
        updateMemberListUIState({ scrollPosition: position });
      }
    },
    [updateMemberListUIState, memberListUIState.scrollPosition]
  );

  // When selecting a member to edit, make sure we save the current scroll position
  const handleMemberEdit = useCallback(
    (member: MemberData) => {
      // Immediately save the current scroll position
      updateMemberListUIState({ scrollPosition: scrollPositionRef.current });

      // Store the selected member's pin for better position recovery
      updateMemberListUIState({
        lastEditedMemberPin: member.pin_number.toString(),
      });

      // Call the provided edit callback
      onEditMember(member);
    },
    [onEditMember, updateMemberListUIState]
  );

  const getItem = (data: MemberData[], index: number) => data[index];
  const getItemCount = (data: MemberData[]) => data.length;
  const keyExtractor = (item: MemberData) => item.pin_number.toString();

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

  const renderItem = ({ item }: { item: MemberData }) => (
    <MemberItem
      item={item}
      onPress={() => handleMemberEdit(item)}
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
            onChangeText={updateSearchQuery}
          />
          {searchQuery !== "" && (
            <TouchableOpacityComponent
              style={styles.clearButton}
              onPress={() => updateSearchQuery("")}
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
            onValueChange={updateShowInactive}
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
          ref={listRef}
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
          onScroll={handleScroll}
          scrollEventThrottle={16}
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
            autoscrollToTopThreshold: 10,
          }}
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
    flex: 1,
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
    borderColor: Colors.dark.border,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: Colors.dark.card,
  },
  inactiveMemberItem: {
    opacity: 0.6,
    backgroundColor: Colors.dark.border,
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

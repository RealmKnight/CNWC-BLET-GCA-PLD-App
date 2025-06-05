import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  Platform,
  VirtualizedList,
  useWindowDimensions,
  ActivityIndicator,
  Switch,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAdminMemberManagementStore, MemberData } from "@/store/adminMemberManagementStore";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { supabase } from "@/utils/supabase";

interface Division {
  id: number;
  name: string;
}

interface UnionMemberListProps {
  onEditMember: (member: MemberData) => void;
  onAddMember: () => void;
}

const MemberItem = React.memo(
  ({ item, onPress, divisions }: { item: MemberData; onPress: () => void; divisions: Division[] }) => {
    const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
    const { width } = useWindowDimensions();
    const isMobileView = width < 768;

    // Find division name from division ID
    const divisionName = React.useMemo(() => {
      if (!item.division_id) return "Not Assigned";
      const division = divisions.find((d) => d.id === item.division_id);
      return division ? division.name : `ID: ${item.division_id}`;
    }, [item.division_id, divisions]);

    return (
      <TouchableOpacityComponent
        style={[
          styles.memberItem,
          isMobileView && styles.mobileWebMemberItem,
          item.status !== "ACTIVE" && styles.inactiveMemberItem,
        ]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.memberInfo}>
          <ThemedText style={styles.memberName}>
            {item.last_name}, {item.first_name}
            {item.status !== "ACTIVE" && <ThemedText style={styles.inactiveText}> (Inactive)</ThemedText>}
          </ThemedText>
          <View style={styles.subInfoContainer}>
            <ThemedText style={styles.memberPin}>PIN: {item.pin_number}</ThemedText>
            <View style={styles.divisionBadge}>
              <ThemedText style={styles.memberDivision} numberOfLines={1} ellipsizeMode="tail">
                {divisionName}
              </ThemedText>
            </View>
          </View>
        </View>
      </TouchableOpacityComponent>
    );
  }
);

export function UnionMemberList({ onEditMember, onAddMember }: UnionMemberListProps) {
  const { width } = useWindowDimensions();
  const isMobileView = width < 768;
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const themeTintColor = useThemeColor({}, "tint");
  const listRef = useRef<VirtualizedList<MemberData>>(null);
  const scrollPositionRef = useRef<number>(0);
  const firstRenderRef = useRef<boolean>(true);
  const [divisions, setDivisions] = useState<Division[]>([]);

  // Use the store for data and UI state
  const { members, isLoading, error, fetchAllMembers, memberListUIState, updateMemberListUIState } =
    useAdminMemberManagementStore();

  // Use local state that's initialized from the store
  const [searchQuery, setSearchQuery] = useState(memberListUIState.searchQuery);
  const [showInactive, setShowInactive] = useState(memberListUIState.showInactive);

  // Load all members on component mount
  useEffect(() => {
    fetchAllMembers();
    // Fetch divisions
    const fetchDivisions = async () => {
      try {
        const { data, error } = await supabase.from("divisions").select("id, name").order("name");

        if (error) {
          console.error("Error fetching divisions:", error);
          return;
        }

        setDivisions(data || []);
      } catch (error) {
        console.error("Exception fetching divisions:", error);
      }
    };

    fetchDivisions();
  }, [fetchAllMembers]);

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

  const renderItem = ({ item }: { item: MemberData }) => (
    <MemberItem item={item} onPress={() => handleMemberEdit(item)} divisions={divisions} />
  );

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, isMobileView && styles.mobileHeader]}>
        <View style={[styles.controls, isMobileView && styles.mobileControls]}>
          <View style={[styles.searchInputWrapper, isMobileView && styles.mobileSearchInputWrapper]}>
            <TextInput
              style={[styles.searchInput, { color: Colors[colorScheme].text }]}
              placeholder="Search members..."
              placeholderTextColor={Colors[colorScheme].textDim}
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
          <View style={[styles.toggleWrapper, isMobileView && styles.mobileToggleWrapper]}>
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

        <View style={[styles.actionButtons, isMobileView && styles.mobileActionButtons]}>
          <TouchableOpacityComponent
            onPress={onAddMember}
            style={[
              styles.actionButton,
              {
                backgroundColor: Colors[colorScheme].tint,
                borderColor: Colors[colorScheme].tint,
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name="add-circle-outline"
                size={20}
                color={Colors[colorScheme].buttonText}
                style={{ marginRight: 8 }}
              />
              <ThemedText style={{ color: Colors[colorScheme].buttonText }}>Add Member</ThemedText>
            </View>
          </TouchableOpacityComponent>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={themeTintColor} />
          <ThemedText style={styles.loadingText}>Loading members...</ThemedText>
        </View>
      ) : error ? (
        <View style={styles.centerContent}>
          <ThemedText style={styles.errorText}>Failed to load members: {error?.message || "Unknown error"}</ThemedText>
          <TouchableOpacityComponent
            onPress={fetchAllMembers}
            style={[
              styles.actionButton,
              {
                backgroundColor: Colors[colorScheme].tint,
                borderColor: Colors[colorScheme].tint,
                marginTop: 16,
              },
            ]}
          >
            <ThemedText style={{ color: Colors[colorScheme].buttonText }}>Retry</ThemedText>
          </TouchableOpacityComponent>
        </View>
      ) : filteredMembers.length === 0 ? (
        <View style={styles.centerContent}>
          <ThemedText>No members found</ThemedText>
          {searchQuery !== "" && (
            <TouchableOpacityComponent
              onPress={() => updateSearchQuery("")}
              style={[
                styles.actionButton,
                {
                  backgroundColor: "transparent",
                  borderColor: Colors[colorScheme].tint,
                  marginTop: 16,
                },
              ]}
            >
              <ThemedText style={{ color: Colors[colorScheme].tint }}>Clear Search</ThemedText>
            </TouchableOpacityComponent>
          )}
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
          initialNumToRender={15}
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
  header: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  mobileHeader: {
    flexDirection: "column",
  },
  controls: {
    padding: 16,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  mobileControls: {
    flexDirection: "column",
    alignItems: "stretch",
    paddingTop: 12,
    gap: 8,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  mobileSearchInputWrapper: {
    flex: 0,
    paddingTop: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingRight: 40,
    ...(Platform.OS === "web" && {
      outlineColor: Colors.dark.border,
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
  mobileToggleWrapper: {
    flex: 0,
    justifyContent: "space-between",
    paddingRight: 0,
  },
  toggleLabel: {
    marginRight: 10,
    fontSize: 14,
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 16,
    paddingTop: 0,
  },
  mobileActionButtons: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 16,
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
    padding: 16,
  },
  loadingText: {
    marginTop: 16,
  },
  errorText: {
    color: Colors.dark.error,
    marginBottom: 16,
    textAlign: "center",
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
  memberDivision: {
    fontSize: 13,
    fontStyle: "italic",
    color: Colors.dark.tint,
  },
  mobileWebMemberItem: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
    flexDirection: "column",
    alignItems: "stretch",
  },
  actionButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    // Additional styling for secondary button
  },
  divisionBadge: {
    backgroundColor: "rgba(170, 140, 44, 0.1)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
    alignSelf: "flex-start",
  },
});

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

interface Member {
  pin_number: string | number;
  first_name: string;
  last_name: string;
  division_id: number;
  sdv_entitlement: number | null;
  sdv_election: number | null;
  calendar_id: string | null;
  calendar_name: string | null;
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
  refreshTrigger: number;
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
  ({ item, onPress, onUpdate }: { item: Member; onPress: () => void; onUpdate: () => void }) => {
    const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
    const [isEditing, setIsEditing] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [entitlement, setEntitlement] = useState<string>(item.sdv_entitlement?.toString() ?? "0");
    const [election, setElection] = useState<string>(item.sdv_election?.toString() ?? "0");
    const [hasChanges, setHasChanges] = useState(false);
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
      if (isWeb) {
        return (
          <View style={styles.sdvContainer}>
            <View style={styles.sdvSection}>
              <ThemedText style={styles.sdvLabel}>Current SDV</ThemedText>
              {isEditing ? (
                <TextInput
                  style={[styles.sdvInput, { color: Colors[colorScheme].text }]}
                  value={entitlement}
                  onChangeText={(text) => handleTextInput(text, setEntitlement)}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="0"
                />
              ) : (
                <ThemedText style={styles.sdvValue}>{item.sdv_entitlement ?? 0}</ThemedText>
              )}
            </View>

            <View style={styles.sdvSection}>
              <ThemedText style={styles.sdvLabel}>Next Year SDV</ThemedText>
              {isEditing ? (
                <TextInput
                  style={[styles.sdvInput, { color: Colors[colorScheme].text }]}
                  value={election}
                  onChangeText={(text) => handleTextInput(text, setElection)}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="0"
                />
              ) : (
                <ThemedText style={styles.sdvValue}>{item.sdv_election ?? 0}</ThemedText>
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

      // Mobile accordion content
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
                <View style={styles.mobileSDVField}>
                  <ThemedText style={styles.mobileSDVLabel}>Current SDV</ThemedText>
                  {isEditing ? (
                    <TextInput
                      style={[styles.mobileSDVInput, { color: Colors[colorScheme].text }]}
                      value={entitlement}
                      onChangeText={(text) => handleTextInput(text, setEntitlement)}
                      keyboardType="number-pad"
                      maxLength={2}
                      placeholder="0"
                      returnKeyType="done"
                    />
                  ) : (
                    <ThemedText style={styles.mobileSDVValue}>{item.sdv_entitlement ?? 0}</ThemedText>
                  )}
                </View>

                <View style={styles.mobileSDVField}>
                  <ThemedText style={styles.mobileSDVLabel}>Next Year SDV</ThemedText>
                  {isEditing ? (
                    <TextInput
                      style={[styles.mobileSDVInput, { color: Colors[colorScheme].text }]}
                      value={election}
                      onChangeText={(text) => handleTextInput(text, setElection)}
                      keyboardType="number-pad"
                      maxLength={2}
                      placeholder="0"
                      returnKeyType="done"
                    />
                  ) : (
                    <ThemedText style={styles.mobileSDVValue}>{item.sdv_election ?? 0}</ThemedText>
                  )}
                </View>
              </View>

              <TouchableOpacityComponent
                style={[
                  styles.mobileEditButton,
                  isEditing && hasChanges && styles.mobileEditButtonActive,
                  (!entitlement || !election) && styles.mobileEditButtonDisabled,
                ]}
                onPress={() => {
                  if (isEditing && hasChanges && entitlement && election) {
                    handleSave();
                  } else if (!isEditing) {
                    setIsEditing(true);
                  }
                }}
                disabled={isEditing && (!entitlement || !election)}
              >
                <Ionicons
                  name={isEditing ? (hasChanges ? "save" : "close") : "create"}
                  size={20}
                  color={isEditing && hasChanges ? "#fff" : Colors[colorScheme].tint}
                />
                <ThemedText
                  style={[
                    styles.mobileEditButtonText,
                    isEditing && hasChanges && styles.mobileEditButtonTextActive,
                    (!entitlement || !election) && styles.mobileEditButtonTextDisabled,
                  ]}
                >
                  {isEditing ? (hasChanges ? "Save Changes" : "Cancel") : "Edit SDV Values"}
                </ThemedText>
              </TouchableOpacityComponent>
            </View>
          )}
        </View>
      );
    };

    return (
      <TouchableOpacityComponent
        style={[styles.memberItem, !isWeb && isExpanded && styles.memberItemExpanded]}
        onPress={isWeb ? onPress : undefined}
        activeOpacity={0.7}
      >
        <View style={styles.memberInfo}>
          <ThemedText style={styles.memberName}>
            {item.last_name}, {item.first_name}
          </ThemedText>
          <View style={styles.subInfoContainer}>
            <ThemedText style={styles.memberPin}>PIN: {item.pin_number}</ThemedText>
            <ThemedText style={styles.memberCalendar} numberOfLines={1} ellipsizeMode="tail">
              Calendar: {item.calendar_name ? item.calendar_name : "No Calendar Assigned"}
            </ThemedText>
          </View>
        </View>
        {renderSDVContent()}
      </TouchableOpacityComponent>
    );
  }
);

export function MemberList({ onEditMember, refreshTrigger }: MemberListProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const themeTintColor = useThemeColor({}, "tint");
  const { user } = useAuth();
  const isFetchInProgressRef = useRef(false);
  const initialLoadCompleteRef = useRef(false);
  const lastFetchTimeRef = useRef<number>(0);
  const FETCH_COOLDOWN = 2000;

  const fetchMembers = useCallback(async () => {
    const currentUserId = user?.id;
    if (!currentUserId) {
      console.log("[MemberList] Skipping fetchMembers - no user ID at execution time.");
      return;
    }

    if (isFetchInProgressRef.current) {
      console.log("[MemberList] Skipping fetchMembers - already in progress.");
      return;
    }

    console.log("[MemberList] Starting fetchMembers...");

    try {
      isFetchInProgressRef.current = true;
      lastFetchTimeRef.current = Date.now();
      setIsLoading(true);
      const { data: adminData, error: adminError } = await supabase
        .from("members")
        .select("division_id")
        .eq("id", currentUserId)
        .single();

      if (adminError) throw adminError;

      const adminDivisionId = adminData?.division_id;
      if (adminDivisionId === null || adminDivisionId === undefined) {
        throw new Error("No division ID found for admin");
      }

      const { data: membersData, error: membersError } = await supabase
        .from("members")
        .select(
          `
          first_name,
          last_name,
          pin_number,
          division_id,
          sdv_entitlement,
          sdv_election,
          calendar_id
        `
        )
        .eq("division_id", adminDivisionId)
        .order("last_name", { ascending: true });

      if (membersError) throw membersError;

      // Get all calendars in a separate query
      const { data: calendarsData, error: calendarsError } = await supabase.from("calendars").select("id, name");

      if (calendarsError) throw calendarsError;

      // Create a map of calendar IDs to names
      const calendarMap = new Map(calendarsData?.map((cal) => [cal.id, cal.name]) || []);

      const formattedMembers = (membersData || []).map((member) => ({
        ...member,
        calendar_name: member.calendar_id ? calendarMap.get(member.calendar_id) || null : null,
        first_name: member.first_name || "",
        last_name: member.last_name || "",
      })) as Member[];

      setMembers(formattedMembers);
    } catch (error) {
      console.error("[MemberList] Error in fetchMembers:", error);
      setMembers([]);
    } finally {
      setIsLoading(false);
      isFetchInProgressRef.current = false;
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id && !initialLoadCompleteRef.current) {
      console.log("[MemberList] Initial load trigger.");
      initialLoadCompleteRef.current = true;
      fetchMembers();
    }
    return () => {
      console.log("[MemberList] Cleaning up component on unmount/user change.");
      initialLoadCompleteRef.current = false;
      isFetchInProgressRef.current = false;
      setMembers([]);
      setIsLoading(true);
    };
  }, [user?.id, fetchMembers]);

  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (user?.id) {
      console.log("[MemberList] Refresh trigger changed, fetching members.");
      fetchMembers();
    }
  }, [refreshTrigger, user?.id, fetchMembers]);

  const filteredMembers = members.filter(
    (member) =>
      searchQuery === "" ||
      `${member.first_name} ${member.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.pin_number.toString().includes(searchQuery)
  );

  const getItem = (data: Member[], index: number) => data[index];
  const getItemCount = (data: Member[]) => data.length;
  const keyExtractor = (item: Member) => item.pin_number.toString();

  const handleMemberUpdate = useCallback(() => {
    // Force a re-render of the list
    setMembers([...members]);
  }, [members]);

  const renderItem = ({ item }: { item: Member }) => (
    <MemberItem item={item} onPress={() => onEditMember(item)} onUpdate={handleMemberUpdate} />
  );

  return (
    <ThemedView style={styles.container}>
      <View style={styles.controls}>
        <View style={styles.searchContainer}>
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  clearButton: {
    position: "absolute",
    right: 12,
    padding: 4,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    padding: 16,
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
  },
  memberPin: {
    fontSize: 14,
  },
  memberCalendar: {
    fontSize: 14,
    fontStyle: "italic",
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
  memberItemExpanded: {
    marginBottom: 8,
  },
  mobileSDVWrapper: {
    flex: 1,
    maxWidth: "100%",
  },
  mobileSDVButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: Colors.light.background,
    borderRadius: 4,
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
    backgroundColor: Colors.light.background,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  mobileSDVRow: {
    flexDirection: "row",
    justifyContent: "space-between",
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
    marginBottom: 4,
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
  },
  mobileEditButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.light.background,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.light.tint,
    gap: 8,
    marginTop: 4,
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
  mobileEditButtonTextDisabled: {
    color: Colors.light.text,
    opacity: 0.5,
  },
});

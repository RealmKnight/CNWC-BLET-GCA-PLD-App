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
  division: string;
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

const MemberItem = React.memo(({ item, onPress }: { item: Member; onPress: () => void }) => {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  return (
    <TouchableOpacityComponent style={styles.memberItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.memberInfo}>
        <ThemedText style={styles.memberName}>
          {item.last_name}, {item.first_name}
        </ThemedText>
        <ThemedText style={styles.memberPin}>PIN: {item.pin_number}</ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors[colorScheme].text} />
    </TouchableOpacityComponent>
  );
});

export function MemberList({ onEditMember }: MemberListProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const themeTintColor = useThemeColor({}, "tint");
  const { user } = useAuth();
  const isMounted = useRef(true);

  const fetchMembers = useCallback(async () => {
    console.log("[MemberList] Starting fetchMembers...");
    if (!user?.id) return;

    try {
      setIsLoading(true);
      const { data: adminData, error: adminError } = await supabase
        .from("members")
        .select("division")
        .eq("id", user.id)
        .single();

      if (adminError) throw adminError;

      const adminDivision = adminData?.division;
      if (!adminDivision) throw new Error("No division found for admin");

      const { data: membersData, error: membersError } = await supabase
        .from("members")
        .select("first_name, last_name, pin_number, division")
        .eq("division", adminDivision)
        .order("last_name", { ascending: true });

      if (membersError) throw membersError;

      if (isMounted.current) {
        setMembers(membersData || []);
      }
    } catch (error) {
      console.error("[MemberList] Error in fetchMembers:", error);
      if (isMounted.current) setMembers([]);
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    isMounted.current = true;
    fetchMembers();

    const subscription = supabase
      .channel("members_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "members" }, fetchMembers)
      .subscribe();

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, [fetchMembers]);

  const filteredMembers = members.filter(
    (member) =>
      searchQuery === "" ||
      `${member.first_name} ${member.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.pin_number.toString().includes(searchQuery)
  );

  const getItem = (data: Member[], index: number) => data[index];
  const getItemCount = (data: Member[]) => data.length;
  const keyExtractor = (item: Member) => item.pin_number.toString();
  const renderItem = ({ item }: { item: Member }) => <MemberItem item={item} onPress={() => onEditMember(item)} />;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={[styles.searchInput, { color: Colors[colorScheme].text }]}
          placeholder="Search members..."
          placeholderTextColor={Colors[colorScheme].text}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery !== "" && (
          <TouchableOpacityComponent style={styles.clearButton} onPress={() => setSearchQuery("")} activeOpacity={0.7}>
            <Ionicons name="close-circle" size={20} color={Colors[colorScheme].text} />
          </TouchableOpacityComponent>
        )}
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
          style={styles.memberList}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== "web"}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
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
  memberList: {
    flex: 1,
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
  },
  memberName: {
    fontSize: 16,
    fontWeight: "500",
  },
  memberPin: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 4,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});

import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  Platform,
  useWindowDimensions,
  ScrollView,
  ViewStyle,
  TouchableOpacity,
  KeyboardAvoidingView,
} from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { Colors } from "../../constants/Colors";
import { useColorScheme } from "../../hooks/useColorScheme";
import { TabBar, Tab } from "../../components/admin/TabBar";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "../../components/ThemedText";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Import all section components
import { PldSdvSection } from "../../components/admin/pld-sdv/PldSdvSection";
import { VacationSection } from "../../components/admin/vacation/VacationSection";
import { AdminMessageSection } from "../../components/admin/message/AdminMessageSection";
import { AdminReviewSection } from "../../components/admin/review/AdminReviewSection";

// Re-add supabase import as it's needed by handleLogout
import { supabase } from "../../utils/supabase";

// Define tabs
const TABS: Tab[] = [
  {
    key: "pld_sdv",
    title: "PLD/SDV",
    icon: "calendar",
    outlineIcon: "calendar-outline",
  },
  {
    key: "vacation",
    title: "Vacation",
    icon: "airplane",
    outlineIcon: "airplane-outline",
  },
  {
    key: "message",
    title: "Messages",
    icon: "chatbubbles",
    outlineIcon: "chatbubbles-outline",
  },
  {
    key: "review",
    title: "Reviews",
    icon: "checkmark-circle",
    outlineIcon: "checkmark-circle-outline",
  },
];

// Storage key for persisting the active tab
const ACTIVE_TAB_STORAGE_KEY = "company_admin_active_tab";

// Use SafeAreaView on native platforms, regular View on web
const Container = Platform.OS === "web" ? View : SafeAreaView;

// Platform-specific style helper
const getPlatformStyles = (): {
  container: ViewStyle;
  contentContainer: ViewStyle;
  scrollContent: ViewStyle;
} => {
  if (Platform.OS === "web") {
    return {
      container: {
        flex: 1,
        height: "100%",
        padding: 16,
      },
      contentContainer: {
        flex: 1,
        overflow: "scroll",
      },
      scrollContent: {
        flexGrow: 1,
        paddingBottom: 24,
      },
    };
  } else {
    // iOS/Android styles
    return {
      container: {
        flex: 1,
      },
      contentContainer: {
        flex: 1,
      },
      scrollContent: {
        flexGrow: 1,
        paddingBottom: 24,
      },
    };
  }
};

// Custom ScrollView component based on platform
interface AdaptiveScrollViewProps {
  children: React.ReactNode;
  style?: any;
}

const AdaptiveScrollView: React.FC<AdaptiveScrollViewProps> = ({ children, style }) => {
  // On iOS/Android use KeyboardAvoidingView to handle keyboard avoiding
  if (Platform.OS !== "web") {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          style={style}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // On web, use standard ScrollView
  return (
    <ScrollView style={style} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={true}>
      {children}
    </ScrollView>
  );
};

export default function CompanyAdminScreen() {
  const { user, authStatus, signOut } = useAuth();
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const colors = Colors[colorScheme];
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const platformStyles = getPlatformStyles();

  // Determine if we're on a mobile device (either native or mobile web)
  const isMobile = Platform.OS !== "web" || width < 768;

  // State for active tab
  const [activeTab, setActiveTab] = useState<string>("pld_sdv");

  // Load saved tab from storage on mount
  useEffect(() => {
    const loadSavedTab = async () => {
      try {
        const savedTab = await AsyncStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
        if (savedTab) {
          setActiveTab(savedTab);
        }
      } catch (error) {
        console.error("Error loading saved tab:", error);
      }
    };

    loadSavedTab();
  }, []);

  // Save tab preference when it changes
  useEffect(() => {
    const saveTabPreference = async () => {
      try {
        await AsyncStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
      } catch (error) {
        console.error("Error saving tab preference:", error);
      }
    };

    saveTabPreference();
  }, [activeTab]);

  // Handle tab change
  const handleTabChange = (tabKey: string) => {
    setActiveTab(tabKey);
  };

  // Handle logout
  const handleLogout = async () => {
    console.log("Logout initiated");

    // First clear local preferences
    try {
      await AsyncStorage.removeItem(ACTIVE_TAB_STORAGE_KEY);
    } catch (error) {
      console.warn("Failed to clear tab preferences:", error);
      // Continue anyway
    }

    // For web platforms, aggressively clear auth data from browser
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        // 1. Remove any cookies that might be related to auth
        document.cookie.split(";").forEach(function (c) {
          document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        console.log("Cleared cookies");

        // 2. Clear sessionStorage
        sessionStorage.clear();
        console.log("Cleared sessionStorage");

        // 3. Force Supabase to forget its internal session state by
        // temporarily breaking its access to localStorage
        try {
          // Save current data
          const tempStorage = { ...localStorage };

          // Clear storage
          localStorage.clear();

          // Use the existing supabase client to sign out with global scope
          await supabase.auth.signOut({ scope: "global" });

          // Restore non-auth data
          Object.keys(tempStorage).forEach((key) => {
            if (!key.includes("supabase") && !key.includes("sb-") && !key.includes("auth")) {
              localStorage.setItem(key, tempStorage[key]);
            }
          });
        } catch (e) {
          console.warn("Error during aggressive session clearing:", e);
        }
      } catch (e) {
        console.warn("Error clearing browser storage:", e);
      }
    }

    // Attempt to sign out - but don't wait for it to complete or fail
    try {
      // Call signOut without await, then proceed immediately
      const signOutPromise = signOut();

      // After a brief timeout (to let the signOut start), proceed to sign-in page
      await new Promise((resolve) => setTimeout(resolve, 500));

      // We don't need to wait for this to resolve
      signOutPromise.catch((error) => {
        console.warn("Background signOut attempt failed (this is generally ok):", error);
      });
    } catch (error) {
      console.error("Error during logout process:", error);
    }
  };

  // Adjust the loading check: Use authStatus instead of isLoading
  if (authStatus === "loading") {
    return (
      <Container style={[styles.container, platformStyles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      </Container>
    );
  }

  // Memoize the rendered tab content based on the activeTab
  const memoizedTabContent = useMemo(() => {
    console.log(`[CompanyAdmin] Memoizing/Rendering content for tab: ${activeTab}`);
    switch (activeTab) {
      case "pld_sdv":
        return <PldSdvSection />;
      case "vacation":
        return <VacationSection />;
      case "message":
        return <AdminMessageSection />;
      case "review":
        return <AdminReviewSection />;
      default:
        return <PldSdvSection />;
    }
  }, [activeTab]); // Only re-run when activeTab changes

  // Calculate dynamic padding based on platform and insets
  const contentPadding = {
    paddingBottom: Platform.OS === "web" ? 24 : Math.max(insets.bottom, 24),
    paddingHorizontal: isMobile ? 8 : 16,
    paddingTop: 8,
  };

  // Determine if the current tab uses FlatList (PldSdvSection and VacationSection)
  // to avoid nesting issues with VirtualizedLists
  const currentTabUsesFlatlist = activeTab === "pld_sdv" || activeTab === "vacation";

  return (
    <Container
      style={[platformStyles.container, { backgroundColor: colors.background }]}
      edges={["left", "right", "bottom"]}
    >
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={handleTabChange} />
      <View style={[styles.contentContainer, platformStyles.contentContainer]}>
        {currentTabUsesFlatlist ? (
          // Don't wrap FlatList tabs in ScrollView to avoid nesting VirtualizedList error
          <View style={[styles.tabContentContainer, contentPadding]}>{memoizedTabContent}</View>
        ) : (
          // Use ScrollView for tabs without FlatList
          <AdaptiveScrollView>
            <View style={[styles.tabContentContainer, contentPadding]}>{memoizedTabContent}</View>
          </AdaptiveScrollView>
        )}
      </View>

      {/* Sticky Logout Button */}
      <View style={[styles.stickyButtonContainer, { bottom: insets.bottom + 16, right: 16 }]}>
        <TouchableOpacity
          onPress={handleLogout}
          style={[styles.logoutButton, { backgroundColor: colors.tint }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="log-out-outline" size={28} color={colors.background} />
        </TouchableOpacity>
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  contentContainer: {
    flex: 1,
  },
  tabContentContainer: {
    flex: 1,
    minHeight: "100%",
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  // Styles for the sticky logout button
  stickyButtonContainer: {
    position: "absolute",
    zIndex: 10, // Ensure it's above other content
  },
  logoutButton: {
    width: 56,
    height: 56,
    borderRadius: 28, // Make it circular
    justifyContent: "center",
    alignItems: "center",
    // Add shadow for elevation effect (optional)
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});

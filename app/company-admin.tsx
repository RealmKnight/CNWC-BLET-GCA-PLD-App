import React, { useEffect, useState } from "react";
import { View, StyleSheet, Platform, useWindowDimensions, ScrollView, ViewStyle } from "react-native";
import { useAuth } from "../hooks/useAuth";
import { Colors } from "../constants/Colors";
import { useColorScheme } from "../hooks/useColorScheme";
import { TabBar, Tab } from "../components/admin/TabBar";
import { TouchableOpacityComponent } from "../components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { router, useNavigation } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "../components/ThemedText";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { supabase } from "../utils/supabase";

// Import all section components
import { PldSdvSection } from "../components/admin/pld-sdv/PldSdvSection";
import { VacationSection } from "../components/admin/vacation/VacationSection";
import { AdminMessageSection } from "../components/admin/message/AdminMessageSection";
import { AdminReviewSection } from "../components/admin/review/AdminReviewSection";

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
  // On iOS/Android use KeyboardAwareScrollView to handle keyboard avoiding
  if (Platform.OS !== "web") {
    return (
      <KeyboardAwareScrollView
        style={style}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        enableOnAndroid={true}
        enableResetScrollToCoords={false}
        extraScrollHeight={100}
        keyboardOpeningTime={0}
      >
        {children}
      </KeyboardAwareScrollView>
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
  const { user, isLoading, signOut } = useAuth();
  const navigation = useNavigation();
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const colors = Colors[colorScheme];
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const platformStyles = getPlatformStyles();
  const [isValidatingSession, setIsValidatingSession] = useState(true);

  // Determine if we're on a mobile device (either native or mobile web)
  const isMobile = Platform.OS !== "web" || width < 768;

  // State for active tab
  const [activeTab, setActiveTab] = useState<string>("pld_sdv");

  // Validate session on mount
  useEffect(() => {
    const validateSession = async () => {
      try {
        setIsValidatingSession(true);
        // Try to get the current session from Supabase
        const { data, error } = await supabase.auth.getSession();

        if (error || !data.session) {
          console.log("Session validation failed:", error || "No session");
          // If validation fails, redirect to sign-in
          await handleLogout();
          return;
        }

        // Verify session is valid by making a simple authenticated request
        const { error: authError } = await supabase.from("members").select("count").limit(1);
        if (authError) {
          console.log("Auth validation failed:", authError);
          // If validation fails, redirect to sign-in
          await handleLogout();
          return;
        }

        console.log("Session validated successfully");
      } catch (error) {
        console.error("Error validating session:", error);
        // If there's an error, redirect to sign-in
        await handleLogout();
      } finally {
        setIsValidatingSession(false);
      }
    };

    validateSession();
  }, []);

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

      // Always navigate to sign-in
      router.replace("/(auth)/sign-in");

      // We don't need to wait for this to resolve
      signOutPromise.catch((error) => {
        console.warn("Background signOut attempt failed (this is generally ok):", error);
      });
    } catch (error) {
      console.error("Error during logout process:", error);

      // Always navigate to sign-in, even if there was an error
      router.replace("/(auth)/sign-in");
    }
  };

  // Set up header right button for logout
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacityComponent
          onPress={handleLogout}
          style={{ marginRight: 16 }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="log-out-outline" size={24} color={colors.text} />
        </TouchableOpacityComponent>
      ),
    });
  }, [navigation, handleLogout, colors.text]);

  // If still loading or validating session or no user/not admin, show loading state
  if (isLoading || isValidatingSession || !user || user.user_metadata?.role !== "company_admin") {
    return (
      <Container style={[styles.container, platformStyles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      </Container>
    );
  }

  // Render active tab content
  const renderTabContent = () => {
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
  };

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
          <View style={[styles.tabContentContainer, contentPadding]}>{renderTabContent()}</View>
        ) : (
          // Use ScrollView for tabs without FlatList
          <AdaptiveScrollView>
            <View style={[styles.tabContentContainer, contentPadding]}>{renderTabContent()}</View>
          </AdaptiveScrollView>
        )}
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
});

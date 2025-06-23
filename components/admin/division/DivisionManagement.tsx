import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { StyleSheet, Platform, Pressable, useWindowDimensions, View, TouchableOpacity, ScrollView } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { DivisionOfficers } from "./DivisionOfficers";
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutLeft, runOnJS } from "react-native-reanimated";
import { DivisionMeetings } from "./DivisionMeetings";
import { useDivisionManagementStore, DivisionView } from "@/store/divisionManagementStore";
import { DivisionDocumentsAdmin } from "./DivisionDocumentsAdmin";
import { DivisionEmailManagement } from "./DivisionEmailManagement";
import { DivisionAnnouncementsAdmin } from "./DivisionAnnouncementsAdmin";

const AnimatedThemedView = Animated.createAnimatedComponent(ThemedView);

// Error Boundary for child components
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: string | null;
}

class DivisionContentErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (error: Error) => void; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: error.stack || "No stack trace available" };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[DivisionManagement] Child component error caught:", error, errorInfo);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <ThemedView style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
            <Ionicons name="warning-outline" size={48} color={Colors.light.error} />
            <ThemedText style={{ fontSize: 18, fontWeight: "600", marginTop: 16, textAlign: "center" }}>
              Content Loading Error
            </ThemedText>
            <ThemedText style={{ fontSize: 14, marginTop: 8, textAlign: "center", color: Colors.light.textDim }}>
              There was an issue loading this section. Please try switching to another tab and back.
            </ThemedText>
            <TouchableOpacity
              style={{
                marginTop: 16,
                padding: 12,
                backgroundColor: Colors.light.tint,
                borderRadius: 8,
              }}
              onPress={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            >
              <ThemedText style={{ color: Colors.light.background, fontWeight: "600" }}>Try Again</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        )
      );
    }

    return this.props.children;
  }
}

interface DivisionManagementProps {
  division: string;
}

export function DivisionManagement({ division }: DivisionManagementProps) {
  // Use specific selectors instead of returning an object
  const currentView = useDivisionManagementStore((state) => state.currentView[division] || "announcements");
  const setCurrentView = useDivisionManagementStore((state) => state.setCurrentView);

  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== "web" || width < 768;

  // Add refs to track component state and prevent race conditions
  const isMountedRef = useRef(true);
  const previousDivisionRef = useRef(division);
  const [isAnimating, setIsAnimating] = useState(false);
  const [divisionKey, setDivisionKey] = useState(division);

  // Add timeout ref to prevent stuck animation state
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_ANIMATION_DURATION = 1000; // Maximum time to wait for animation completion

  // Add recovery state to handle component errors
  const [hasRecoveryError, setHasRecoveryError] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  // Enhanced animation state management with fallback
  const setAnimatingWithTimeout = useCallback((animating: boolean) => {
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }

    setIsAnimating(animating);

    if (animating) {
      // Set a fallback timeout to ensure buttons don't stay disabled forever
      animationTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          console.warn("[DivisionManagement] Animation timeout reached, forcing animation state to false");
          setIsAnimating(false);
        }
      }, MAX_ANIMATION_DURATION);
    }
  }, []);

  // Recovery function to reset component state
  const performRecovery = useCallback(() => {
    console.log("[DivisionManagement] Performing component recovery");
    setIsRecovering(true);
    setHasRecoveryError(false);

    // Reset all animation states
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }
    setIsAnimating(false);

    // Force a brief delay to allow cleanup
    setTimeout(() => {
      if (isMountedRef.current) {
        setIsRecovering(false);
        console.log("[DivisionManagement] Component recovery completed");
      }
    }, 300);
  }, []);

  // Handle child component errors
  const handleChildError = useCallback(
    (error: Error) => {
      console.error("[DivisionManagement] Child component error detected:", error);
      setHasRecoveryError(true);
      setAnimatingWithTimeout(false); // Ensure buttons aren't stuck disabled
    },
    [setAnimatingWithTimeout]
  );

  // Track when division changes to handle cleanup and prevent stale state
  useEffect(() => {
    if (previousDivisionRef.current !== division) {
      console.log(`[DivisionManagement] Division changed from ${previousDivisionRef.current} to ${division}`);

      // Clear any existing animation timeout
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }

      // Update refs first
      previousDivisionRef.current = division;

      // Create new key to force component re-mount
      setDivisionKey(division);

      // Reset error states
      setHasRecoveryError(false);
      setIsRecovering(false);

      // Set animating state with timeout fallback
      setAnimatingWithTimeout(true);

      // Reset animation state after a delay to allow for proper cleanup
      const timer = setTimeout(() => {
        if (isMountedRef.current) {
          setAnimatingWithTimeout(false);
        }
      }, 500); // Increased timeout for better stability

      return () => {
        clearTimeout(timer);
        if (animationTimeoutRef.current) {
          clearTimeout(animationTimeoutRef.current);
          animationTimeoutRef.current = null;
        }
      };
    }
  }, [division, setAnimatingWithTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }
    };
  }, []);

  // Memoize the content key to ensure proper component unmounting/mounting
  const contentKey = useMemo(() => `${divisionKey}-${currentView}`, [divisionKey, currentView]);

  // Enhanced Action Button Rendering with better error handling
  const renderActionButton = useCallback(
    (view: DivisionView, icon: string, label: string) => {
      const isActive = currentView === view;
      const iconColor = isActive ? Colors[colorScheme].background : tintColor;
      const buttonSize = isMobile ? 40 : "auto";
      const iconSize = isMobile ? 20 : 24;
      const ButtonComponent = Platform.OS === "web" ? Pressable : TouchableOpacity;

      const handlePress = () => {
        try {
          if (!isAnimating) {
            console.log(`[DivisionManagement] Switching to view: ${view} for division: ${division}`);
            setCurrentView(division, view);
          } else {
            console.log(`[DivisionManagement] Button press ignored - animation in progress`);
          }
        } catch (error) {
          console.error(`[DivisionManagement] Error handling button press for view ${view}:`, error);
          // Force reset animation state on error to prevent permanent disability
          setAnimatingWithTimeout(false);
        }
      };

      return (
        <ButtonComponent
          key={view}
          style={[
            styles.actionButton,
            isActive && styles.activeButton,
            isMobile && styles.mobileActionButton,
            isAnimating && styles.disabledButton, // Add visual feedback for disabled state
            { minWidth: buttonSize, height: buttonSize },
          ]}
          onPress={handlePress}
          disabled={isAnimating}
        >
          <Ionicons name={icon as any} size={iconSize} color={iconColor} />
          {!isMobile && <ThemedText style={[styles.buttonText, isActive && styles.activeText]}>{label}</ThemedText>}
        </ButtonComponent>
      );
    },
    [currentView, isMobile, tintColor, colorScheme, division, setCurrentView, isAnimating, setAnimatingWithTimeout]
  );

  // Content Rendering based on selected view with proper key management
  const renderContent = useCallback(() => {
    const componentProps = { division };

    switch (currentView) {
      case "announcements":
        return (
          <ScrollView
            key={`${contentKey}-scroll`}
            style={[styles.contentScroll, Platform.OS === "android" && styles.androidContentScroll]}
            contentContainerStyle={styles.contentContainer}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
          >
            <DivisionAnnouncementsAdmin key={contentKey} {...componentProps} />
          </ScrollView>
        );
      case "documents":
        return (
          <ScrollView
            key={`${contentKey}-scroll`}
            style={[styles.contentScroll, Platform.OS === "android" && styles.androidContentScroll]}
            contentContainerStyle={styles.contentContainer}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
          >
            <DivisionDocumentsAdmin key={contentKey} {...componentProps} />
          </ScrollView>
        );
      case "officers":
        return (
          <ScrollView
            key={`${contentKey}-scroll`}
            style={[styles.contentScroll, Platform.OS === "android" && styles.androidContentScroll]}
            contentContainerStyle={styles.contentContainer}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
          >
            <DivisionOfficers key={contentKey} {...componentProps} />
          </ScrollView>
        );
      case "meetings":
        return (
          <ScrollView
            key={`${contentKey}-scroll`}
            style={[styles.contentScroll, Platform.OS === "android" && styles.androidContentScroll]}
            contentContainerStyle={styles.contentContainer}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
          >
            <DivisionMeetings key={contentKey} {...componentProps} isAdmin={true} />
          </ScrollView>
        );
      case "emails":
        return (
          <ScrollView
            key={`${contentKey}-scroll`}
            style={[styles.contentScroll, Platform.OS === "android" && styles.androidContentScroll]}
            contentContainerStyle={styles.contentContainer}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
          >
            <DivisionEmailManagement key={contentKey} {...componentProps} />
          </ScrollView>
        );
      default:
        return null;
    }
  }, [currentView, division, contentKey]);

  // Animation callbacks for better lifecycle management
  const handleAnimationStart = useCallback(() => {
    if (isMountedRef.current) {
      setAnimatingWithTimeout(true);
    }
  }, [setAnimatingWithTimeout]);

  const handleAnimationEnd = useCallback(() => {
    if (isMountedRef.current) {
      setAnimatingWithTimeout(false);
    }
  }, [setAnimatingWithTimeout]);

  return (
    <ThemedView style={styles.container} key={divisionKey}>
      {/* Show recovery UI if component is in error state */}
      {hasRecoveryError && (
        <ThemedView style={styles.recoveryContainer}>
          <Ionicons name="refresh-circle-outline" size={24} color={Colors[colorScheme].tint} />
          <ThemedText style={styles.recoveryText}>Component recovery available - click to reset</ThemedText>
          <TouchableOpacity style={styles.recoveryButton} onPress={performRecovery} disabled={isRecovering}>
            <ThemedText style={styles.recoveryButtonText}>
              {isRecovering ? "Recovering..." : "Reset Component"}
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>
      )}

      {/* Only render if division matches divisionKey to prevent stale data */}
      {division === divisionKey ? (
        <>
          <ThemedView style={styles.header}>
            <View style={styles.titleRow}>
              <View style={styles.actionButtons}>
                {renderActionButton("announcements", "megaphone-outline", "Announcements")}
                {renderActionButton("meetings", "people-circle-outline", "Meetings")}
                {renderActionButton("documents", "document-text-outline", "Documents")}
                {renderActionButton("officers", "ribbon-outline", "Officers")}
                {renderActionButton("emails", "mail-outline", "Emails")}
              </View>
            </View>
            <View style={styles.divisionContainer}>
              <View style={styles.divisionRow}>
                <ThemedText style={styles.divisionLabel}>Division: </ThemedText>
                <ThemedText style={styles.divisionText}>{division}</ThemedText>
              </View>
            </View>
          </ThemedView>

          <View style={styles.contentArea}>
            <AnimatedThemedView
              key={contentKey}
              entering={
                isMobile
                  ? SlideInRight.withCallback((finished) => {
                      "worklet";
                      if (finished) {
                        runOnJS(handleAnimationEnd)();
                      }
                    })
                  : FadeIn.withCallback((finished) => {
                      "worklet";
                      if (finished) {
                        runOnJS(handleAnimationEnd)();
                      }
                    })
              }
              exiting={
                isMobile
                  ? SlideOutLeft.withCallback((finished) => {
                      "worklet";
                      if (finished) {
                        runOnJS(handleAnimationStart)();
                      }
                    })
                  : FadeOut.withCallback((finished) => {
                      "worklet";
                      if (finished) {
                        runOnJS(handleAnimationStart)();
                      }
                    })
              }
              style={styles.content}
            >
              <DivisionContentErrorBoundary onError={handleChildError}>{renderContent()}</DivisionContentErrorBoundary>
            </AnimatedThemedView>
          </View>
        </>
      ) : (
        <ThemedView style={styles.loadingContainer}>
          <ThemedText>Switching to {division}...</ThemedText>
        </ThemedView>
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    flexShrink: 0,
  },
  activeButton: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
  },
  disabledButton: {
    opacity: 0.6,
    backgroundColor: Colors.dark.disabled || "#f0f0f0",
    borderColor: Colors.dark.disabled || "#d0d0d0",
  },
  mobileActionButton: {
    padding: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 4,
  },
  activeText: {
    color: Colors.dark.background,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  contentContainer: {
    padding: 16,
    ...(Platform.OS === "android" && {
      flexGrow: 1,
      paddingBottom: 50,
    }),
  },
  divisionContainer: {
    ...Platform.select({
      web: { flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap", gap: 16 },
      default: { flexDirection: "column", width: "100%", gap: 8 },
    }),
  },
  divisionRow: {
    flexDirection: "row",
    alignItems: "center",
    ...Platform.select({
      web: { flexBasis: "auto", marginRight: 16 },
      default: { width: "100%", paddingRight: 0 },
    }),
  },
  divisionLabel: {
    fontSize: 16,
    marginRight: 8,
    fontWeight: "500",
    minWidth: 80,
  },
  divisionText: {
    fontSize: 16,
    fontWeight: "500",
    flexShrink: 1,
  },
  contentScroll: {
    flex: 1,
  },
  contentArea: {
    flex: 1,
  },
  androidContentScroll: {
    flex: 1,
    height: "auto",
    maxHeight: "100%",
  },
  placeholderContainer: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 18,
    textAlign: "center",
    color: Colors.light.textDim,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  recoveryContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    margin: 8,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 8,
  },
  recoveryText: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.text,
  },
  recoveryButton: {
    padding: 8,
    backgroundColor: Colors.dark.tint,
    borderRadius: 6,
  },
  recoveryButtonText: {
    color: Colors.dark.background,
    fontSize: 14,
    fontWeight: "600",
  },
});

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  NativeScrollEvent,
  NativeSyntheticEvent,
  LayoutChangeEvent,
  Linking,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { format, parseISO } from "date-fns";
import type { Announcement } from "@/types/announcements";

type ColorScheme = keyof typeof Colors;

interface AnnouncementModalProps {
  announcement: Announcement | null;
  visible: boolean;
  onClose: () => void;
  onAcknowledge: (announcement: Announcement) => Promise<void>;
  onMarkAsRead: (announcementId: string) => Promise<void>;
}

export function AnnouncementModal({
  announcement,
  visible,
  onClose,
  onAcknowledge,
  onMarkAsRead,
}: AnnouncementModalProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const [hasReadFully, setHasReadFully] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [updateCounter, setUpdateCounter] = useState(0);

  // Force remeasure if needed
  const forceUpdate = useCallback(() => {
    setUpdateCounter((prev) => prev + 1);
  }, []);

  // Reset states when a new announcement is displayed
  useEffect(() => {
    if (visible && announcement) {
      console.log(`[AnnouncementModal] New announcement opened: ${announcement.id}, resetting states`);
      setHasReadFully(false);
      setContentHeight(0);
      setContainerHeight(0);

      // Force update after a short delay to ensure measurements are triggered
      const updateTimer = setTimeout(() => {
        forceUpdate();
      }, 100);

      // Safety timeout for short announcements - if after 500ms we still haven't
      // detected scrollability, assume the announcement is short enough to read
      const timer = setTimeout(() => {
        if (contentHeight === 0 || containerHeight === 0) {
          console.log(
            `[AnnouncementModal] Timeout reached, auto-enabling acknowledge for announcement: ${announcement.id}`
          );
          setHasReadFully(true);
        }
      }, 500);

      return () => {
        clearTimeout(timer);
        clearTimeout(updateTimer);
      };
    }
  }, [visible, announcement?.id, forceUpdate]);

  // Check if content is shorter than container and doesn't need scrolling
  useEffect(() => {
    if (contentHeight > 0 && containerHeight > 0 && announcement) {
      console.log(
        `[AnnouncementModal] Heights measured - Content: ${contentHeight}, Container: ${containerHeight}, AnnouncementID: ${announcement.id}`
      );
      if (contentHeight <= containerHeight) {
        console.log(
          `[AnnouncementModal] Content fits without scrolling, enabling acknowledge for announcement: ${announcement.id}`
        );
        setHasReadFully(true);
        // Mark as read when content fits without scrolling
        onMarkAsRead(announcement.id);
      }
    }
  }, [contentHeight, containerHeight, announcement?.id]);

  // Add a forced check when the component updates
  useEffect(() => {
    if (visible && announcement && contentHeight > 0 && containerHeight > 0) {
      const needsScrolling = contentHeight > containerHeight;
      console.log(
        `[AnnouncementModal] Forced check - Needs scrolling: ${needsScrolling}, AnnouncementID: ${announcement.id}`
      );
      if (!needsScrolling && !hasReadFully) {
        setHasReadFully(true);
        // Mark as read when content doesn't need scrolling
        onMarkAsRead(announcement.id);
      }
    }
  }, [visible, announcement, contentHeight, containerHeight, hasReadFully]);

  if (!announcement) return null;

  const handleAcknowledge = async () => {
    if (!hasReadFully) return;
    await onAcknowledge(announcement);
    onClose();
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 20;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    console.log(
      `[AnnouncementModal] Scroll event - Close to bottom: ${isCloseToBottom}, AnnouncementID: ${announcement.id}`
    );

    if (isCloseToBottom && !hasReadFully) {
      console.log(`[AnnouncementModal] Scrolled to bottom, enabling acknowledge for announcement: ${announcement.id}`);
      setHasReadFully(true);
      // Mark as read when user scrolls to bottom
      onMarkAsRead(announcement.id);
    }
  };

  const handleContentLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    console.log(`[AnnouncementModal] Content layout event - Height: ${height}, AnnouncementID: ${announcement.id}`);
    setContentHeight(height);
  };

  const handleContainerLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    console.log(`[AnnouncementModal] Container layout event - Height: ${height}, AnnouncementID: ${announcement.id}`);
    setContainerHeight(height);
  };

  // Render links if any
  const renderLinks = () => {
    if (!announcement.links || announcement.links.length === 0) return null;

    return (
      <ThemedView style={styles.linksSection}>
        <ThemedText style={styles.sectionTitle}>Links</ThemedText>
        {announcement.links.map((link, index) => (
          <TouchableOpacity key={index} style={styles.linkItem} onPress={() => Linking.openURL(link.url)}>
            <Ionicons name="link" size={16} color={Colors[theme].announcementBadgeDivision} />
            <ThemedText style={[styles.linkText, { color: Colors[theme].announcementBadgeDivision }]}>
              {link.label || link.url}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ThemedView>
    );
  };

  // Render document attachments if any (placeholder for now)
  const renderDocuments = () => {
    if (!announcement.document_ids || announcement.document_ids.length === 0) return null;

    return (
      <ThemedView style={styles.documentsSection}>
        <ThemedText style={styles.sectionTitle}>Attachments</ThemedText>
        {announcement.document_ids.map((docId, index) => (
          <TouchableOpacity
            key={index}
            style={styles.documentItem}
            onPress={() => {
              // TODO: Implement document viewer integration
              console.log(`Opening document: ${docId}`);
            }}
          >
            <Ionicons name="document-text" size={16} color={Colors[theme].text} />
            <ThemedText style={styles.documentText}>Document {index + 1}</ThemedText>
          </TouchableOpacity>
        ))}
      </ThemedView>
    );
  };

  const isAcknowledged = announcement.has_been_acknowledged;
  const showAcknowledgeButton = announcement.require_acknowledgment && !isAcknowledged;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.modalContent, { backgroundColor: Colors[theme].card }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <ThemedView style={styles.header}>
            <ThemedView style={styles.headerLeft}>
              <ThemedView
                style={[styles.iconWrapper, announcement.require_acknowledgment && styles.mustAcknowledgeIconWrapper]}
              >
                <Ionicons
                  name="megaphone"
                  size={24}
                  color={announcement.require_acknowledgment ? Colors[theme].primary : Colors[theme].text}
                />
              </ThemedView>
              <ThemedView>
                <ThemedView style={styles.typeContainer}>
                  <ThemedText style={styles.announcementType}>
                    {announcement.target_type === "GCA" ? "GCA Announcement" : "Division Announcement"}
                  </ThemedText>
                  {announcement.require_acknowledgment && !isAcknowledged && (
                    <ThemedView style={[styles.acknowledgmentBadge, { backgroundColor: Colors[theme].primary }]}>
                      <ThemedText style={styles.acknowledgmentBadgeText}>Requires Acknowledgment</ThemedText>
                    </ThemedView>
                  )}
                </ThemedView>
                <ThemedText style={styles.timestamp}>
                  {format(parseISO(announcement.created_at), "MMM d, yyyy h:mm a")}
                </ThemedText>
                {announcement.author_name && (
                  <ThemedText style={styles.author}>By {announcement.author_name}</ThemedText>
                )}
              </ThemedView>
            </ThemedView>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors[theme].text} />
            </TouchableOpacity>
          </ThemedView>

          {/* Title */}
          <ThemedText style={styles.title}>{announcement.title}</ThemedText>

          {/* Content */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.contentScroll}
            contentContainerStyle={styles.contentContainer}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onLayout={handleContainerLayout}
          >
            <ThemedView onLayout={handleContentLayout}>
              <ThemedText style={styles.content}>{announcement.message}</ThemedText>
              {renderLinks()}
              {renderDocuments()}
            </ThemedView>
          </ScrollView>

          {/* Footer */}
          <ThemedView style={styles.footer}>
            {showAcknowledgeButton && (
              <TouchableOpacity
                style={[
                  styles.acknowledgeButton,
                  { backgroundColor: hasReadFully ? Colors[theme].primary : Colors[theme].disabled },
                ]}
                onPress={handleAcknowledge}
                disabled={!hasReadFully}
              >
                <Ionicons name="checkmark" size={16} color="#fff" />
                <ThemedText style={styles.acknowledgeButtonText}>
                  {hasReadFully
                    ? "Acknowledge Announcement"
                    : contentHeight <= containerHeight
                    ? "Loading..."
                    : "Scroll to End to Acknowledge"}
                </ThemedText>
              </TouchableOpacity>
            )}
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Styles following MessageModal patterns with announcement-specific adjustments
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    maxWidth: 500,
    maxHeight: "80%",
    borderRadius: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.background,
    alignItems: "center",
    justifyContent: "center",
  },
  mustAcknowledgeIconWrapper: {
    backgroundColor: Colors.light.primary + "20",
  },
  typeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  announcementType: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  acknowledgmentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  acknowledgmentBadgeText: {
    color: Colors.dark.buttonText,
    fontSize: 12,
    fontWeight: "500",
  },
  timestamp: {
    fontSize: 12,
    opacity: 0.6,
  },
  author: {
    fontSize: 12,
    opacity: 0.8,
    fontStyle: "italic",
  },
  closeButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    padding: 16,
    paddingTop: 8,
  },
  contentScroll: {
    maxHeight: "60%",
  },
  contentContainer: {
    padding: 16,
    paddingTop: 0,
  },
  content: {
    fontSize: 16,
    lineHeight: 24,
  },
  linksSection: {
    marginTop: 16,
  },
  documentsSection: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  linkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  linkText: {
    fontSize: 14,
    textDecorationLine: "underline",
  },
  documentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  documentText: {
    fontSize: 14,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  acknowledgeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  acknowledgeButtonText: {
    color: Colors.dark.buttonText,
    fontSize: 14,
    fontWeight: "600",
  },
});

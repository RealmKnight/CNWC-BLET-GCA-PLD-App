import React, { useState } from "react";
import { StyleSheet, Modal, TouchableOpacity, View, Platform } from "react-native";
import { ThemedView } from "./ThemedView";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/constants/Colors";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  const handlePress = (event: any) => {
    if (Platform.OS === "web") {
      // For web, use the event coordinates
      setPosition({
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      });
    } else {
      // For mobile, measure the element position
      event.target.measure((_x: number, _y: number, width: number, height: number, pageX: number, pageY: number) => {
        setPosition({
          x: pageX + width / 2,
          y: pageY + height,
        });
      });
    }
    setIsVisible(true);
  };

  return (
    <>
      <TouchableOpacity onPress={handlePress}>{children}</TouchableOpacity>
      <Modal visible={isVisible} transparent onRequestClose={() => setIsVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setIsVisible(false)} activeOpacity={1}>
          <ThemedView
            style={[
              styles.tooltip,
              {
                left: position.x,
                top: position.y,
                backgroundColor: Colors[colorScheme].background,
              },
            ]}
          >
            {content}
          </ThemedView>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  tooltip: {
    position: "absolute",
    padding: 8,
    borderRadius: 8,
    boxShadow: "0 0 10px 0 rgba(0, 0, 0, 0.1)",
    elevation: 5,
    transform: [{ translateX: -100 }, { translateY: 10 }],
  },
});

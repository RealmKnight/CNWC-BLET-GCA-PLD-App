import React, { ReactNode, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface AccordionProps {
  title: string;
  children: ReactNode;
  onExpand?: () => void;
  initiallyExpanded?: boolean;
}

export function Accordion({ title, children, onExpand, initiallyExpanded = false }: AccordionProps) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  const toggleExpand = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    if (newState && onExpand) {
      onExpand();
    }
  };

  return (
    <ThemedView style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={toggleExpand} activeOpacity={0.7}>
        <ThemedText style={styles.title}>{title}</ThemedText>
        <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={Colors[colorScheme].text} />
      </TouchableOpacity>

      {isExpanded && <ThemedView style={styles.content}>{children}</ThemedView>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: Colors.light.background,
  },
  title: {
    fontSize: 16,
    fontWeight: "500",
  },
  content: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
});

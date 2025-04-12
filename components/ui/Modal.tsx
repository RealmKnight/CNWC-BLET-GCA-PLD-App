import React from "react";
import { Modal as RNModal, View, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Text } from "./Text";
import { Ionicons } from "@expo/vector-icons";

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
  content?: string;
  buttons?: Array<{
    text: string;
    onPress: () => void;
    style?: any;
    textStyle?: any;
  }>;
}

export function Modal({ visible, onClose, title, children, content, buttons }: ModalProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const colors = Colors[colorScheme];

  return (
    <RNModal visible={visible} onRequestClose={onClose} transparent animationType="fade">
      <View style={styles.overlay}>
        <View
          style={[
            styles.content,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.body}>
            {content && <Text style={styles.contentText}>{content}</Text>}
            {children}
            {buttons && (
              <View style={styles.buttonContainer}>
                {buttons.map((button, index) => (
                  <TouchableOpacity key={index} onPress={button.onPress} style={[styles.button, button.style]}>
                    <Text style={[styles.buttonText, button.textStyle]}>{button.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  content: {
    width: "100%",
    maxWidth: Platform.OS === "web" ? 500 : "100%",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    padding: 4,
  },
  body: {
    padding: 16,
  },
  contentText: {
    fontSize: 16,
    marginBottom: 16,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
  },
  button: {
    padding: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "500",
  },
});

import React from "react";
import Toast, { BaseToast, BaseToastProps } from "react-native-toast-message";
import { Colors } from "@/constants/Colors";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import { Platform } from "react-native";
import { useColorScheme } from "@/hooks/useColorScheme";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { ThemedText } from "./ThemedText";

type ColorScheme = keyof typeof Colors;

interface ActionToastProps extends BaseToastProps {
  props?: {
    onAction?: (action: string) => void;
    actionType?: "delete" | "confirm";
    confirmText?: string;
  };
}

const ActionToast = (props: ActionToastProps) => {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const { text1, text2, props: customProps } = props;

  const handleAction = (action: string) => {
    console.log(`[ThemedToast] ${action} button clicked`);
    if (customProps?.onAction) {
      console.log(`[ThemedToast] Calling onAction with '${action}'`);
      customProps.onAction(action);
    } else {
      console.log("[ThemedToast] No onAction handler found");
    }
  };

  const renderActionButtons = () => {
    if (customProps?.actionType === "confirm") {
      return (
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: Colors[theme].tint + "20" }]}
            onPress={() => handleAction("confirm")}
          >
            <ThemedText style={[styles.buttonText, { color: Colors[theme].tint }]}>
              {customProps.confirmText || "Update"}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: Colors[theme].background }]}
            onPress={() => Toast.hide()}
          >
            <ThemedText style={styles.buttonText}>Cancel</ThemedText>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: Colors[theme].error + "20" }]}
          onPress={() => handleAction("delete")}
        >
          <ThemedText style={[styles.buttonText, { color: Colors[theme].error }]}>Delete</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: Colors[theme].background }]}
          onPress={() => Toast.hide()}
        >
          <ThemedText style={styles.buttonText}>Cancel</ThemedText>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.actionToast, { backgroundColor: Colors[theme].card }]}>
      <View style={[styles.textContainer, !customProps?.onAction && styles.noActionTextContainer]}>
        <ThemedText style={styles.title}>{text1}</ThemedText>
        {text2 && <ThemedText style={styles.message}>{text2}</ThemedText>}
      </View>
      {customProps?.onAction && renderActionButtons()}
    </View>
  );
};

export const toastConfig = {
  success: (props: BaseToastProps) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: Colors.light.success }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{
        fontSize: 15,
        fontWeight: "600",
      }}
      text2Style={{
        fontSize: 13,
      }}
    />
  ),
  error: (props: BaseToastProps) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: Colors.light.error }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{
        fontSize: 15,
        fontWeight: "600",
      }}
      text2Style={{
        fontSize: 13,
      }}
    />
  ),
  info: (props: ActionToastProps) => <ActionToast {...props} />,
};

const styles = StyleSheet.create({
  actionToast: {
    height: "auto",
    width: "90%",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: "5%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  textContainer: {
    marginBottom: 12,
  },
  noActionTextContainer: {
    marginBottom: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    opacity: 0.7,
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});

export function ThemedToast() {
  // Only render Toast on client-side
  if (Platform.OS === "web" && typeof window === "undefined") {
    return null;
  }

  return <Toast config={toastConfig} />;
}

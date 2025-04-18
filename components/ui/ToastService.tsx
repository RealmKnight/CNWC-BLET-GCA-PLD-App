import { Platform } from "react-native";
import Toast from "react-native-root-toast";
import { Colors } from "../../constants/Colors";

interface ToastOptions {
  title: string;
  message: string;
  type: "confirm" | "info" | "success" | "error";
  onConfirm?: () => void;
  onCancel?: () => void;
  duration?: number;
}

class ToastService {
  private getToastConfig(type: ToastOptions["type"]) {
    const colorScheme = "light"; // We'll keep it light for consistency
    const colors = Colors[colorScheme];

    switch (type) {
      case "confirm":
        return {
          backgroundColor: colors.card,
          textColor: colors.text,
          shadowColor: colors.border,
        };
      case "success":
        return {
          backgroundColor: colors.success + "20",
          textColor: colors.success,
          shadowColor: colors.success,
        };
      case "error":
        return {
          backgroundColor: colors.error + "20",
          textColor: colors.error,
          shadowColor: colors.error,
        };
      case "info":
      default:
        return {
          backgroundColor: colors.primary + "20",
          textColor: colors.primary,
          shadowColor: colors.primary,
        };
    }
  }

  show({ title, message, type = "info", onConfirm, onCancel, duration = 3000 }: ToastOptions) {
    if (Platform.OS === "web") {
      // For web, use the native confirm dialog
      if (type === "confirm" && onConfirm) {
        if (window.confirm(`${title}\n\n${message}`)) {
          onConfirm();
        } else if (onCancel) {
          onCancel();
        }
      } else {
        // For non-confirmation toasts on web, use alert
        alert(`${title}\n\n${message}`);
      }
      return;
    }

    const config = this.getToastConfig(type);

    // For mobile, use react-native-root-toast
    Toast.show(`${title}\n${message}`, {
      duration,
      position: Toast.positions.CENTER,
      shadow: true,
      animation: true,
      hideOnPress: true,
      delay: 0,
      backgroundColor: config.backgroundColor,
      textColor: config.textColor,
      shadowColor: config.shadowColor,
      onHidden: () => {
        if (type === "confirm") {
          if (onConfirm) onConfirm();
        }
      },
    });
  }
}

export const toastService = new ToastService();

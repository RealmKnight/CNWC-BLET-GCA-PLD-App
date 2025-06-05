/**
 * Toast Helpers - Centralized toast notification utilities
 *
 * Uses ThemedToast component configuration to eliminate React Native Web deprecation warnings.
 * These helpers work directly with the custom toast types defined in ThemedToast.
 *
 * ThemedToast component (rendered in _layout.tsx) provides the toastConfig that eliminates
 * textShadow/boxShadow deprecation warnings by using modern shadow syntax.
 */

import { Platform } from "react-native";
import Toast from "react-native-toast-message";

/**
 * Interface for toast action handlers
 */
export interface ToastActionHandler {
    (action: string): void;
}

/**
 * Toast configuration options
 */
export interface ToastOptions {
    position?: "top" | "bottom";
    visibilityTime?: number;
    autoHide?: boolean;
}

/**
 * Show a success toast notification using ThemedToast styling
 *
 * @param title - Main toast title
 * @param message - Optional secondary message
 * @param options - Optional configuration overrides
 */
export const showSuccessToast = (
    title: string,
    message?: string,
    options?: ToastOptions,
) => {
    Toast.show({
        type: "success", // Uses ThemedToast success configuration
        text1: title,
        text2: message,
        position: options?.position ??
            (Platform.OS === "web" ? "bottom" : "top"),
        visibilityTime: options?.visibilityTime ?? 4000,
        autoHide: options?.autoHide ?? true,
    });
};

/**
 * Show an error toast notification using ThemedToast styling
 *
 * @param title - Main toast title
 * @param message - Optional secondary message
 * @param options - Optional configuration overrides
 */
export const showErrorToast = (
    title: string,
    message?: string,
    options?: ToastOptions,
) => {
    Toast.show({
        type: "error", // Uses ThemedToast error configuration
        text1: title,
        text2: message,
        position: options?.position ??
            (Platform.OS === "web" ? "bottom" : "top"),
        visibilityTime: options?.visibilityTime ?? 4000,
        autoHide: options?.autoHide ?? true,
    });
};

/**
 * Show an info toast notification using ThemedToast styling
 *
 * @param title - Main toast title
 * @param message - Optional secondary message
 * @param options - Optional configuration overrides
 */
export const showInfoToast = (
    title: string,
    message?: string,
    options?: ToastOptions,
) => {
    Toast.show({
        type: "info", // Uses ThemedToast ActionToast configuration
        text1: title,
        text2: message,
        position: options?.position ??
            (Platform.OS === "web" ? "bottom" : "top"),
        visibilityTime: options?.visibilityTime ?? 4000,
        autoHide: options?.autoHide ?? true,
    });
};

/**
 * Show a warning toast notification using ThemedToast styling
 *
 * @param title - Main toast title
 * @param message - Optional secondary message
 * @param options - Optional configuration overrides
 */
export const showWarningToast = (
    title: string,
    message?: string,
    options?: ToastOptions,
) => {
    Toast.show({
        type: "info", // Uses ThemedToast ActionToast configuration (no separate warning type)
        text1: title,
        text2: message,
        position: options?.position ??
            (Platform.OS === "web" ? "bottom" : "top"),
        visibilityTime: options?.visibilityTime ?? 5000,
        autoHide: options?.autoHide ?? true,
    });
};

/**
 * Show a confirmation toast with action buttons using ThemedToast ActionToast component
 *
 * @param title - Main toast title
 * @param message - Confirmation message
 * @param onAction - Callback function that receives the action string
 * @param confirmText - Text for the confirm button (default: "Update")
 * @param options - Optional configuration overrides
 */
export const showConfirmToast = (
    title: string,
    message: string,
    onAction: ToastActionHandler,
    confirmText: string = "Update",
    options?: ToastOptions,
) => {
    Toast.show({
        type: "info", // Uses ThemedToast ActionToast configuration
        text1: title,
        text2: message,
        props: {
            onAction,
            actionType: "confirm",
            confirmText,
        },
        position: options?.position ??
            (Platform.OS === "web" ? "bottom" : "top"),
        visibilityTime: options?.visibilityTime ?? 6000,
        autoHide: options?.autoHide ?? true,
    });
};

/**
 * Show a delete confirmation toast with action buttons using ThemedToast ActionToast component
 *
 * @param title - Main toast title
 * @param message - Delete confirmation message
 * @param onAction - Callback function that receives the action string
 * @param options - Optional configuration overrides
 */
export const showDeleteToast = (
    title: string,
    message: string,
    onAction: ToastActionHandler,
    options?: ToastOptions,
) => {
    Toast.show({
        type: "info", // Uses ThemedToast ActionToast configuration
        text1: title,
        text2: message,
        props: {
            onAction,
            actionType: "delete",
        },
        position: options?.position ??
            (Platform.OS === "web" ? "bottom" : "top"),
        visibilityTime: options?.visibilityTime ?? 6000,
        autoHide: options?.autoHide ?? true,
    });
};

/**
 * Show a loading toast using ThemedToast styling
 *
 * @param title - Main toast title
 * @param message - Optional loading message
 * @param options - Optional configuration overrides
 */
export const showLoadingToast = (
    title: string,
    message?: string,
    options?: ToastOptions,
) => {
    Toast.show({
        type: "info", // Uses ThemedToast ActionToast configuration
        text1: title,
        text2: message,
        position: options?.position ??
            (Platform.OS === "web" ? "bottom" : "top"),
        visibilityTime: options?.visibilityTime ?? 0, // Don't auto-hide loading toasts
        autoHide: options?.autoHide ?? false,
    });
};

/**
 * Hide any currently visible toast
 */
export const hideToast = () => {
    Toast.hide();
};

// Legacy exports for backward compatibility with existing imports
export {
    showConfirmToast as showConfirm,
    showDeleteToast as showDelete,
    showErrorToast as showError,
    showInfoToast as showInfo,
    showSuccessToast as showSuccess,
    showWarningToast as showWarning,
};

/**
 * Toast helper constants for consistency
 */
export const TOAST_DURATIONS = {
    SHORT: 2000,
    MEDIUM: 4000,
    LONG: 6000,
    PERSISTENT: 0, // Don't auto-hide
} as const;

export const TOAST_POSITIONS = {
    TOP: "top" as const,
    BOTTOM: "bottom" as const,
    // Platform-specific default
    DEFAULT: Platform.OS === "web" ? "bottom" as const : "top" as const,
} as const;

/**
 * Utility to get platform-appropriate toast position
 */
export const getDefaultToastPosition = () => TOAST_POSITIONS.DEFAULT;

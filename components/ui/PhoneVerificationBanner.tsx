import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";

interface PhoneVerificationBannerProps {
  phoneNumber: string;
  isVerified: boolean;
  isLockedOut: boolean;
  lockoutUntil?: string | null;
  contactPreference?: string;
  onVerifyPhone?: () => void;
  onContactAdmin?: () => void;
}

export function PhoneVerificationBanner({
  phoneNumber,
  isVerified,
  isLockedOut,
  lockoutUntil,
  contactPreference,
  onVerifyPhone,
  onContactAdmin,
}: PhoneVerificationBannerProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const colors = Colors[colorScheme];

  // Don't show banner if phone is verified or if contact preference is not text
  if (isVerified || contactPreference !== "text" || !phoneNumber) {
    return null;
  }

  // Format lockout time if applicable
  const formatLockoutTime = (lockoutTime: string) => {
    try {
      const lockoutDate = new Date(lockoutTime);
      const now = new Date();

      if (lockoutDate <= now) {
        return null; // Lockout has expired
      }

      const diffInHours = Math.ceil((lockoutDate.getTime() - now.getTime()) / (1000 * 60 * 60));

      if (diffInHours < 24) {
        return `${diffInHours} hour${diffInHours === 1 ? "" : "s"}`;
      } else {
        const diffInDays = Math.ceil(diffInHours / 24);
        return `${diffInDays} day${diffInDays === 1 ? "" : "s"}`;
      }
    } catch {
      return null;
    }
  };

  // Check if lockout is still active
  const isActiveLockout = isLockedOut && lockoutUntil && new Date(lockoutUntil) > new Date();
  const lockoutTimeRemaining = isActiveLockout ? formatLockoutTime(lockoutUntil!) : null;

  if (isActiveLockout && lockoutTimeRemaining) {
    // Show lockout banner
    return (
      <ThemedView style={[styles.banner, styles.errorBanner, { backgroundColor: colors.error + "15" }]}>
        <ThemedView style={styles.bannerContent}>
          <Ionicons name="lock-closed" size={20} color={colors.error} />
          <ThemedView style={styles.textContainer}>
            <ThemedText style={[styles.bannerTitle, { color: colors.error }]}>SMS Verification Locked</ThemedText>
            <ThemedText style={[styles.bannerText, { color: colors.error }]}>
              Too many failed verification attempts. SMS features are temporarily disabled for {lockoutTimeRemaining}.
            </ThemedText>
          </ThemedView>
        </ThemedView>
        {onContactAdmin && (
          <TouchableOpacity onPress={onContactAdmin} style={styles.actionButton}>
            <ThemedText style={[styles.actionButtonText, { color: colors.error }]}>Contact Admin</ThemedText>
          </TouchableOpacity>
        )}
      </ThemedView>
    );
  }

  // Show unverified phone banner
  return (
    <ThemedView style={[styles.banner, styles.warningBanner, { backgroundColor: colors.warning + "15" }]}>
      <ThemedView style={styles.bannerContent}>
        <Ionicons name="warning" size={20} color={colors.warning} />
        <ThemedView style={styles.textContainer}>
          <ThemedText style={[styles.bannerTitle, { color: colors.warning }]}>Phone Number Not Verified</ThemedText>
          <ThemedText style={[styles.bannerText, { color: colors.warning }]}>
            You won't receive text message notifications until your phone number is verified.
          </ThemedText>
        </ThemedView>
      </ThemedView>
      {onVerifyPhone && (
        <TouchableOpacity onPress={onVerifyPhone} style={styles.actionButton}>
          <ThemedText style={[styles.actionButtonText, { color: colors.warning }]}>Verify Now</ThemedText>
        </TouchableOpacity>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
    borderWidth: 1,
  },
  warningBanner: {
    borderColor: Colors.dark.warning + "30",
  },
  errorBanner: {
    borderColor: Colors.dark.error + "30",
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  textContainer: {
    flex: 1,
    marginLeft: 12,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  bannerText: {
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.9,
  },
  actionButton: {
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "currentColor",
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
});

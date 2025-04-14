import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/hooks/useAuth";
import { useUserStore } from "@/store/userStore";

export default function DivisionIndex() {
  const router = useRouter();
  const { member, session } = useAuth();
  const division = useUserStore((state) => state.division);

  useEffect(() => {
    async function redirectToUserDivision() {
      // Check if user is authenticated
      if (!session) {
        console.log("[DivisionIndex] No active session, redirecting to login");
        router.replace("/(auth)/login");
        return;
      }

      // If we have a division name, redirect to it
      if (division) {
        console.log("[DivisionIndex] Redirecting to division:", division);
        router.replace(`/division/${division}`);
      } else {
        console.log("[DivisionIndex] No division found, redirecting to home");
        router.replace("/(tabs)");
      }
    }

    redirectToUserDivision();
  }, [division, router, session]);

  return (
    <ThemedView style={styles.container}>
      <ThemedText>Loading division information...</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
});

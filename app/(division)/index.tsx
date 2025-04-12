import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/hooks/useAuth";

export default function DivisionIndex() {
  const router = useRouter();
  const { member } = useAuth();

  useEffect(() => {
    async function redirectToUserDivision() {
      if (member?.division) {
        router.replace(`/(division)/${member.division}`);
      } else {
        router.replace("/(tabs)");
      }
    }

    redirectToUserDivision();
  }, [member, router]);

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

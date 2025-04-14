import { Stack } from "expo-router";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ThemedText } from "@/components/ThemedText";

type ColorSchemeName = keyof typeof Colors;

export default function DivisionLayout() {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors[colorScheme].background,
        },
        headerTintColor: Colors[colorScheme].text,
        headerTitleStyle: {
          fontFamily: "Inter",
        },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "My Division",
        }}
      />
      <Stack.Screen
        name="[divisionName]"
        options={{
          title: "Division Details",
          headerTitle: ({ children }) => {
            // Remove "Division" prefix if it exists
            const title = String(children).replace("Division ", "");
            return <ThemedText style={{ fontSize: 17, fontWeight: "600" }}>Division {title}</ThemedText>;
          },
        }}
      />
    </Stack>
  );
}

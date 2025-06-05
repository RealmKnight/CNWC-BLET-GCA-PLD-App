import { Stack } from "expo-router";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { LayoutWithAppHeader } from "@/components/LayoutWithAppHeader";

type ColorSchemeName = keyof typeof Colors;

export default function ClaimsLayout() {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;

  return (
    <LayoutWithAppHeader>
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
            title: "Claims",
          }}
        />
      </Stack>
    </LayoutWithAppHeader>
  );
}

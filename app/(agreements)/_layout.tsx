import { Stack } from "expo-router";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { LayoutWithAppHeader } from "@/components/LayoutWithAppHeader";

type ColorSchemeName = keyof typeof Colors;

export default function AgreementsLayout() {
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
            title: "Agreements",
          }}
        />
        <Stack.Screen
          name="current"
          options={{
            title: "Current Agreement",
          }}
        />
        <Stack.Screen
          name="local"
          options={{
            title: "Local Agreements",
          }}
        />
        <Stack.Screen
          name="side-letters"
          options={{
            title: "Side Letters",
          }}
        />
        <Stack.Screen
          name="historical"
          options={{
            title: "Historical Agreements",
          }}
        />
        <Stack.Screen
          name="updates"
          options={{
            title: "Agreement Updates",
          }}
        />
      </Stack>
    </LayoutWithAppHeader>
  );
}

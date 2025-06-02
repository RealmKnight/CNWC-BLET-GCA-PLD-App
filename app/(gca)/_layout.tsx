import { Stack } from "expo-router";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { LayoutWithAppHeader } from "@/components/LayoutWithAppHeader";

type ColorSchemeName = keyof typeof Colors;

export default function GCALayout() {
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
            title: "GCA Resources",
          }}
        />
        <Stack.Screen
          name="announcements"
          options={{
            title: "GCA Announcements",
          }}
        />
        <Stack.Screen
          name="gca-officers"
          options={{
            title: "GCA Officers and Members",
          }}
        />
        <Stack.Screen
          name="documents"
          options={{
            title: "GCA Documents",
          }}
        />
        <Stack.Screen
          name="bylaws"
          options={{
            title: "GCA Bylaws",
          }}
        />
      </Stack>
    </LayoutWithAppHeader>
  );
}

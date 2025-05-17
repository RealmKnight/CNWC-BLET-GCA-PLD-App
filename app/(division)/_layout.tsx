import { Stack } from "expo-router";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ThemedText } from "@/components/ThemedText";
import { LayoutWithAppHeader } from "@/components/LayoutWithAppHeader";

type ColorSchemeName = keyof typeof Colors;

export default function DivisionLayout() {
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
            title: "My Division",
          }}
        />
        <Stack.Screen
          name="[divisionName]/index"
          options={{
            title: "Division Details",
            headerTitle: ({ children }) => {
              // Remove "Division" prefix if it exists
              const title = String(children).replace("Division ", "");
              return <ThemedText style={{ fontSize: 17, fontWeight: "600" }}>Division {title}</ThemedText>;
            },
          }}
        />
        <Stack.Screen
          name="[divisionName]/meetings"
          options={{
            title: "Division Meetings",
            headerTitle: ({ children }) => {
              return <ThemedText style={{ fontSize: 17, fontWeight: "600" }}>Meetings</ThemedText>;
            },
          }}
        />
        <Stack.Screen
          name="[divisionName]/members"
          options={{
            title: "Division Members",
            headerTitle: ({ children }) => {
              // Display only the relevant part (usually just "Members")
              return <ThemedText style={{ fontSize: 17, fontWeight: "600" }}>Members</ThemedText>;
            },
          }}
        />
        <Stack.Screen
          name="[divisionName]/officers"
          options={{
            title: "Division Officers",
            headerTitle: ({ children }) => {
              return <ThemedText style={{ fontSize: 17, fontWeight: "600" }}>Officers</ThemedText>;
            },
          }}
        />
        <Stack.Screen
          name="[divisionName]/documents"
          options={{
            title: "Division Documents",
            headerTitle: ({ children }) => {
              return <ThemedText style={{ fontSize: 17, fontWeight: "600" }}>Documents</ThemedText>;
            },
          }}
        />
      </Stack>
    </LayoutWithAppHeader>
  );
}

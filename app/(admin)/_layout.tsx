import React from "react";
import { Stack } from "expo-router";
import { AppHeader } from "@/components/AppHeader";

export default function AdminLayout() {
  return (
    <>
      <AppHeader />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </>
  );
}

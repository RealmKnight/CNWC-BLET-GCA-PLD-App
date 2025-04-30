import React, { useState } from "react";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import { ActivityIndicator, View } from "react-native";

interface ClientOnlyProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * A component that only renders its children on the client side.
 * During SSR and before hydration completes, it renders the fallback.
 * This helps avoid hydration mismatches for components that depend on
 * client-side only data or behavior.
 */
export function ClientOnlyComponent({ children, fallback = null }: ClientOnlyProps) {
  const [isMounted, setIsMounted] = useState(false);

  // Using useIsomorphicLayoutEffect to run as early as possible on client
  useIsomorphicLayoutEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * A default fallback loading component that can be used with ClientOnlyComponent
 */
export function DefaultLoadingFallback() {
  return (
    <View style={{ padding: 20, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator size="small" />
    </View>
  );
}

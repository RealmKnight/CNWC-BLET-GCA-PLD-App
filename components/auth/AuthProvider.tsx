import React, { useEffect } from "react";
import { useAuthStore } from "@/lib/store/auth";
import { supabase } from "@/lib/supabase/client";
import { useRouter, useSegments } from "expo-router";

interface Props {
  children: React.ReactNode;
}

export function AuthProvider({ children }: Props) {
  const segments = useSegments();
  const router = useRouter();

  const { isAuthenticated, isLoading, refreshSession } = useAuthStore();

  useEffect(() => {
    // Set up Supabase auth state listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        // @ts-ignore - TODO: Fix route type
        router.replace("/(auth)/login");
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        refreshSession();
      }
    });

    // Initial session check
    refreshSession();

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshSession]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    // @ts-ignore - TODO: Fix segment type
    const inAuthGroup = segments[0] === "(auth)";

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to login if not authenticated and not in auth group
      // @ts-ignore - TODO: Fix route type
      router.replace("/(auth)/login");
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to home if authenticated and in auth group
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isLoading, segments]);

  if (isLoading) {
    // You might want to show a loading screen here
    return null;
  }

  return <>{children}</>;
}

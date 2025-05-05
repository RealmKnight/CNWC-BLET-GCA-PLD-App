import React, { useState, useEffect } from "react";
import { StyleSheet, Image, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/utils/supabase";
import { useUserStore } from "@/store/userStore";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Advertisement, useAdvertisementStore } from "@/store/advertisementStore";

interface AdvertisementBannerProps {
  location: string;
  style?: any;
  maxHeight?: number;
  fixedAd?: Advertisement; // For testing/preview purposes
}

export function AdvertisementBanner({ location, style, maxHeight = 100, fixedAd }: AdvertisementBannerProps) {
  const [advertisement, setAdvertisement] = useState<Advertisement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { member } = useUserStore();
  const { fetchAdvertisements, logAdvertisementEvent } = useAdvertisementStore();
  const router = useRouter();
  const deviceType = Platform.OS === "web" ? "web" : "mobile";
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  useEffect(() => {
    if (fixedAd) {
      setAdvertisement(fixedAd);
      setIsLoading(false);
      return;
    }

    fetchAndSetAdvertisement();
  }, [location, fixedAd]);

  const fetchAndSetAdvertisement = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .rpc("get_active_advertisements", {
          location_filter: location,
          device_filter: deviceType,
        })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        setAdvertisement(data[0]);
        // Log impression
        logAdvertisementEvent(data[0].id, "impression", location);
      } else {
        setAdvertisement(null);
      }
    } catch (error) {
      console.error("Error fetching advertisement:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePress = async () => {
    if (!advertisement) return;

    // Log click
    logAdvertisementEvent(advertisement.id, "click", location);

    // Open URL
    if (advertisement.destination_url) {
      if (Platform.OS === "web") {
        window.open(advertisement.destination_url, "_blank");
      } else {
        await WebBrowser.openBrowserAsync(advertisement.destination_url);
      }
    }
  };

  if (isLoading || !advertisement) return null;

  return (
    <ThemedTouchableOpacity
      onPress={handlePress}
      style={[
        styles.container,
        {
          maxHeight,
        },
        style,
      ]}
    >
      <ThemedView style={styles.imageContainer}>
        <Image source={{ uri: advertisement.image_url }} style={styles.image} resizeMode="contain" />
      </ThemedView>
    </ThemedTouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 8,
    marginVertical: 8,
  },
  imageContainer: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: Colors.dark.card,
  },
  image: {
    width: "100%",
    height: "100%",
    minHeight: 60,
  },
});

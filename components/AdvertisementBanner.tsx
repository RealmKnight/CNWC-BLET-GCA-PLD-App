import React, { useState, useEffect } from "react";
import { StyleSheet, Image, Platform, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/utils/supabase";
import { useUserStore } from "@/store/userStore";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Advertisement, useAdvertisementStore } from "@/store/advertisementStore";
import Toast from "react-native-toast-message";

interface AdvertisementBannerProps {
  location: string;
  style?: any;
  maxHeight?: number;
  fixedAd?: Advertisement; // For testing/preview purposes
}

export function AdvertisementBanner({ location, style, maxHeight = 100, fixedAd }: AdvertisementBannerProps) {
  const [advertisement, setAdvertisement] = useState<Advertisement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [imageRatio, setImageRatio] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const { member } = useUserStore();
  const { fetchAdvertisements, logAdvertisementEvent } = useAdvertisementStore();
  const router = useRouter();
  const deviceType = Platform.OS === "web" ? "web" : "mobile";
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { width: windowWidth } = useWindowDimensions();

  // Determine if this is a sidebar ad based on the location
  const isSidebarAd = location.includes("sidebar");
  // Determine if we're in a narrow layout (mobile)
  const isNarrowLayout = windowWidth < 768;

  useEffect(() => {
    if (fixedAd) {
      setAdvertisement(fixedAd);
      setIsLoading(false);
      return;
    }

    fetchAndSetAdvertisement();
  }, [location, fixedAd]);

  useEffect(() => {
    // If we have an advertisement, get its image dimensions to calculate aspect ratio
    if (advertisement?.image_url) {
      Image.getSize(
        advertisement.image_url,
        (width, height) => {
          setImageRatio(width / height);
        },
        (error) => {
          console.error("Error getting image size:", error);
          setImageRatio(1);
        }
      );
    }
  }, [advertisement]);

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

    // Show confirmation dialog before opening URL
    if (advertisement.destination_url) {
      Toast.show({
        type: "info",
        text1: "Open External Link",
        text2: "This will open a web page outside the app. Do you want to continue?",
        position: "bottom",
        visibilityTime: 4000,
        autoHide: false,
        onPress: () => {
          Toast.hide();
          // Log cancellation if user dismisses by tapping elsewhere
          logAdvertisementEvent(advertisement.id, "cancel", location);
        },
        props: {
          onAction: async (action: string) => {
            if (action === "confirm") {
              Toast.hide();
              // Open URL based on platform
              if (Platform.OS === "web") {
                window.open(advertisement.destination_url, "_blank");
              } else {
                await WebBrowser.openBrowserAsync(advertisement.destination_url);
              }
            } else {
              // Log cancellation if user hits the cancel button
              logAdvertisementEvent(advertisement.id, "cancel", location);
            }
          },
          actionType: "confirm",
          confirmText: "Open Link",
        },
      });
    }
  };

  const onLayout = (event: any) => {
    const { width } = event.nativeEvent.layout;
    setContainerWidth(width);
  };

  if (isLoading || !advertisement) return null;

  // Calculate the height based on the width and aspect ratio for sidebar ads
  // For narrow layouts (mobile), treat sidebar ads as normal banner ads
  const shouldUseAdaptiveHeight = isSidebarAd && !isNarrowLayout;
  const calculatedHeight = shouldUseAdaptiveHeight && containerWidth > 0 ? containerWidth / imageRatio : undefined;

  return (
    <ThemedTouchableOpacity
      onPress={handlePress}
      onLayout={onLayout}
      style={[
        styles.container,
        // For sidebar ads on desktop, use calculated height based on aspect ratio
        shouldUseAdaptiveHeight ? { height: calculatedHeight } : { maxHeight },
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
    backgroundColor: "transparent",
    padding: 1,
  },
  image: {
    width: "100%",
    height: "100%",
    minHeight: 60,
  },
});

import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, View, FlatList, Dimensions, ViewToken } from "react-native";
import { Advertisement, useAdvertisementStore } from "@/store/advertisementStore";
import { AdvertisementBanner } from "./AdvertisementBanner";
import { ThemedView } from "@/components/ThemedView";

interface AdvertisementCarouselProps {
  location: string;
  maxHeight?: number;
  autoRotate?: boolean;
  rotationInterval?: number;
}

export function AdvertisementCarousel({
  location,
  maxHeight = 100,
  autoRotate = true,
  rotationInterval = 5000,
}: AdvertisementCarouselProps) {
  const { rotatingAds, fetchAdvertisementsForRotation, isLoading } = useAdvertisementStore();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const width = Dimensions.get("window").width;

  // Fetch ads on mount and location change
  useEffect(() => {
    fetchAdvertisementsForRotation(location);

    // Cleanup
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [location]);

  // Set up auto-rotation
  useEffect(() => {
    if (autoRotate && rotatingAds[location]?.length > 1) {
      startAutoRotation();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [rotatingAds, location, autoRotate, activeIndex]);

  const startAutoRotation = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      if (!rotatingAds[location] || rotatingAds[location].length === 0) return;

      const nextIndex = (activeIndex + 1) % rotatingAds[location].length;
      flatListRef.current?.scrollToIndex({
        index: nextIndex,
        animated: true,
      });
      setActiveIndex(nextIndex);
    }, rotationInterval);
  };

  const handleViewableItemsChanged = ({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setActiveIndex(viewableItems[0].index);
    }
  };

  // If no ads or loading, return null
  if (isLoading || !rotatingAds[location] || rotatingAds[location].length === 0) {
    return null;
  }

  // If only one ad, just show it without carousel
  if (rotatingAds[location]?.length === 1) {
    return <AdvertisementBanner location={location} maxHeight={maxHeight} fixedAd={rotatingAds[location][0]} />;
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={rotatingAds[location]}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <AdvertisementBanner location={location} maxHeight={maxHeight} fixedAd={item} />
          </View>
        )}
        keyExtractor={(item) => item.id}
      />

      {/* Pagination dots */}
      <View style={styles.pagination}>
        {rotatingAds[location].map((_, index) => (
          <View key={index} style={[styles.paginationDot, index === activeIndex && styles.activePaginationDot]} />
        ))}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  slide: {
    alignItems: "center",
    justifyContent: "center",
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  activePaginationDot: {
    backgroundColor: "#D4AF37", // Gold color from your theme
  },
});

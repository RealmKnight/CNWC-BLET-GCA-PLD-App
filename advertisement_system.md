# BLET Mobile App Advertisement System

## Overview

This document outlines the implementation plan for a custom advertising system within the BLET mobile application. The system will enable union administrators to manage and display advertisements across the application, with analytics tracking to measure ad performance.

## Table of Contents

1. [System Components](#system-components)
2. [Database Schema](#database-schema)
3. [Backend Implementation](#backend-implementation)
4. [Frontend Components](#frontend-components)
5. [Admin Interface](#admin-interface)
6. [Analytics System](#analytics-system)
7. [Required Packages](#required-packages)
8. [Implementation Phases](#implementation-phases)

## System Components

The advertisement system will consist of the following core components:

1. **Advertisement Banner Component**: Reusable component for displaying ads in different locations
2. **Admin Interface**: Panel for uploading and managing advertisements
3. **Backend Storage**: Supabase tables and storage for ad assets and metadata
4. **Analytics System**: For tracking impressions, views, and clicks
5. **Ad Rotation Logic**: To manage which ads are shown when and where

## Database Schema

### Tables

#### 1. `advertisements` Table

```sql
CREATE TABLE public.advertisements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(100) NOT NULL,
  description TEXT,
  image_url TEXT,
  destination_url TEXT,
  file_type VARCHAR(10) NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- Valid values: 'draft', 'active', 'inactive'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES public.members(id),
  weight INTEGER DEFAULT 1,
  placement_locations TEXT[] DEFAULT '{"home", "notifications"}',
  target_devices TEXT[] DEFAULT '{"mobile", "web"}',
  target_member_statuses TEXT[] DEFAULT '{"active", "inactive"}',
  target_member_ranks TEXT[] DEFAULT '{}',
  target_divisions INTEGER[] DEFAULT '{}',
  is_deleted BOOLEAN DEFAULT false
);

COMMENT ON TABLE public.advertisements IS 'Stores advertisement metadata including image references and display rules';
```

#### 2. `advertisement_analytics` Table

```sql
CREATE TABLE public.advertisement_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  advertisement_id UUID REFERENCES public.advertisements(id) NOT NULL,
  event_type VARCHAR(20) NOT NULL,
  member_id UUID REFERENCES public.members(id),
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  device_type VARCHAR(20),
  platform VARCHAR(20),
  location VARCHAR(50) NOT NULL,
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX advertisement_analytics_ad_id_idx ON public.advertisement_analytics(advertisement_id);
CREATE INDEX advertisement_analytics_event_type_idx ON public.advertisement_analytics(event_type);
CREATE INDEX advertisement_analytics_occurred_at_idx ON public.advertisement_analytics(occurred_at);

COMMENT ON TABLE public.advertisement_analytics IS 'Tracks advertisement impressions, views, and clicks';
```

### Functions and Triggers

#### 1. Advertisement Update Trigger

```sql
CREATE OR REPLACE FUNCTION update_advertisement_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER advertisement_updated_at
BEFORE UPDATE ON public.advertisements
FOR EACH ROW
EXECUTE FUNCTION update_advertisement_updated_at();
```

#### 2. Custom Admin Role Check Function

```sql
-- Custom function to check if a user has admin privileges
CREATE OR REPLACE FUNCTION has_admin_role(role_to_check TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if the authenticated user has the specified role in the members table
  RETURN EXISTS (
    SELECT 1
    FROM public.members
    WHERE
      id = auth.uid() AND
      role = role_to_check AND
      role IN ('union_admin', 'application_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### 3. Log Advertisement Event Function

```sql
CREATE OR REPLACE FUNCTION log_advertisement_event(
  ad_id UUID,
  event VARCHAR,
  member UUID,
  loc VARCHAR,
  device VARCHAR DEFAULT NULL,
  platform VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  event_id UUID;
BEGIN
  INSERT INTO public.advertisement_analytics (
    advertisement_id,
    event_type,
    member_id,
    location,
    device_type,
    platform
  )
  VALUES (
    ad_id,
    event,
    member,
    loc,
    device,
    platform
  )
  RETURNING id INTO event_id;

  RETURN event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### 4. Get Active Advertisements Function

```sql
CREATE OR REPLACE FUNCTION get_active_advertisements(
  location_filter VARCHAR DEFAULT NULL,
  device_filter VARCHAR DEFAULT NULL
)
RETURNS SETOF advertisements AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.advertisements
  WHERE
    status = 'active' AND
    is_deleted = false AND
    start_date <= NOW() AND
    end_date >= NOW() AND
    (location_filter IS NULL OR location_filter = ANY(placement_locations)) AND
    (device_filter IS NULL OR device_filter = ANY(target_devices))
  ORDER BY weight DESC, created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;
```

#### 5. Get Advertisements for Rotation Function

```sql
CREATE OR REPLACE FUNCTION get_advertisements_for_rotation(
  location_filter VARCHAR,
  device_filter VARCHAR,
  limit_count INTEGER DEFAULT 3
)
RETURNS SETOF advertisements AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.advertisements
  WHERE
    status = 'active' AND
    is_deleted = false AND
    start_date <= NOW() AND
    end_date >= NOW() AND
    location_filter = ANY(placement_locations) AND
    device_filter = ANY(target_devices)
  ORDER BY
    -- Balance between weight-based priority and varied rotation
    weight DESC,
    -- Adding some randomness for rotation while still respecting weight
    random() * weight DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;
```

## Backend Implementation

### Storage Implementation

1. Create a dedicated storage bucket for advertisement assets:

```sql
-- Create a policy to allow authenticated users with admin roles to upload files
CREATE POLICY "Allow admin uploads"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'advertisements' AND
    ('union_admin' = ANY(get_my_effective_roles()) OR
     'application_admin' = ANY(get_my_effective_roles()))
  );

-- Create a policy to allow public viewing of advertisement files
CREATE POLICY "Allow public viewing of advertisement files"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'advertisements');
```

### RLS Policies

1. Advertisements table policies:

```sql
-- Enable RLS on advertisements table
ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;

-- Policy for union_admin and application_admin to manage all advertisements
CREATE POLICY "Admins can manage all advertisements"
  ON public.advertisements
  USING (
    'union_admin' = ANY(get_my_effective_roles()) OR
    'application_admin' = ANY(get_my_effective_roles())
  );

-- Policy for all users to view active advertisements
CREATE POLICY "All users can view active advertisements"
  ON public.advertisements
  FOR SELECT
  USING (
    status = 'active' AND
    is_deleted = false AND
    start_date <= NOW() AND
    end_date >= NOW()
  );
```

2. Advertisement analytics policies:

```sql
-- Enable RLS on advertisement_analytics table
ALTER TABLE public.advertisement_analytics ENABLE ROW LEVEL SECURITY;

-- Policy for creating analytics entries
CREATE POLICY "Anyone can create analytics entries"
  ON public.advertisement_analytics
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy for viewing analytics (admin only)
CREATE POLICY "Only admins can view analytics"
  ON public.advertisement_analytics
  FOR SELECT
  USING (
    'union_admin' = ANY(get_my_effective_roles()) OR
    'application_admin' = ANY(get_my_effective_roles())
  );
```

## Frontend Components

### 1. Advertisement Banner Component

```tsx
// components/AdvertisementBanner.tsx
import React, { useState, useEffect } from "react";
import { StyleSheet, TouchableOpacity, Image, View, Platform, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/utils/supabase";
import { useUserStore } from "@/store/userStore";
import { ThemedView } from "@/components/ThemedView";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface Advertisement {
  id: string;
  title: string;
  image_url: string;
  destination_url: string;
}

interface AdvertisementBannerProps {
  location: string;
  style?: any;
  maxHeight?: number;
}

export function AdvertisementBanner({ location, style, maxHeight = 100 }: AdvertisementBannerProps) {
  const [advertisement, setAdvertisement] = useState<Advertisement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { member } = useUserStore();
  const router = useRouter();
  const deviceType = Platform.OS === "web" ? "web" : "mobile";
  const colorScheme = useColorScheme() ?? "light";

  useEffect(() => {
    fetchAdvertisement();
  }, [location]);

  const fetchAdvertisement = async () => {
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
        await supabase.rpc("log_advertisement_event", {
          ad_id: data[0].id,
          event: "impression",
          member: member?.id || null,
          loc: location,
          device: Platform.OS,
          platform: deviceType,
        });
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
    await supabase.rpc("log_advertisement_event", {
      ad_id: advertisement.id,
      event: "click",
      member: member?.id || null,
      loc: location,
      device: Platform.OS,
      platform: deviceType,
    });

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
    <TouchableOpacity
      onPress={handlePress}
      style={[
        styles.container,
        {
          maxHeight,
          backgroundColor: Colors[colorScheme].card,
        },
        style,
      ]}
    >
      <Image source={{ uri: advertisement.image_url }} style={styles.image} resizeMode="contain" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 8,
    marginVertical: 8,
  },
  image: {
    width: "100%",
    height: "100%",
    minHeight: 60,
  },
});
```

### 2. Ad Rotation Logic (Store)

```tsx
// store/advertisementStore.ts
import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { Platform } from "react-native";

export interface Advertisement {
  id: string;
  title: string;
  description: string;
  image_url: string;
  destination_url: string;
  file_type: string;
  placement_locations: string[];
  status: "draft" | "active" | "inactive";
  weight: number;
}

interface AdvertisementState {
  advertisements: Record<string, Advertisement[]>;
  rotatingAds: Record<string, Advertisement[]>;
  currentRotationIndex: Record<string, number>;
  isLoading: boolean;
  error: Error | null;
  fetchAdvertisements: (location: string) => Promise<void>;
  fetchAdvertisementsForRotation: (location: string, count?: number) => Promise<void>;
  logAdvertisementEvent: (adId: string, eventType: "impression" | "view" | "click", location: string) => Promise<void>;
  getNextRotationAd: (location: string) => Advertisement | null;
}

export const useAdvertisementStore = create<AdvertisementState>((set, get) => ({
  advertisements: {},
  rotatingAds: {},
  currentRotationIndex: {},
  isLoading: false,
  error: null,

  fetchAdvertisements: async (location: string) => {
    const deviceType = Platform.OS === "web" ? "web" : "mobile";

    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase.rpc("get_active_advertisements", {
        location_filter: location,
        device_filter: deviceType,
      });

      if (error) throw error;

      // Update state with fetched ads for this location
      set((state) => ({
        advertisements: {
          ...state.advertisements,
          [location]: data || [],
        },
        isLoading: false,
      }));
    } catch (error) {
      console.error("Error fetching advertisements:", error);
      set({ error: error as Error, isLoading: false });
    }
  },

  fetchAdvertisementsForRotation: async (location: string, count = 3) => {
    const deviceType = Platform.OS === "web" ? "web" : "mobile";

    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase.rpc("get_advertisements_for_rotation", {
        location_filter: location,
        device_filter: deviceType,
        limit_count: count,
      });

      if (error) throw error;

      // Update state with fetched ads for rotation
      set((state) => ({
        rotatingAds: {
          ...state.rotatingAds,
          [location]: data || [],
        },
        // Initialize or reset rotation index
        currentRotationIndex: {
          ...state.currentRotationIndex,
          [location]: 0,
        },
        isLoading: false,
      }));
    } catch (error) {
      console.error("Error fetching advertisements for rotation:", error);
      set({ error: error as Error, isLoading: false });
    }
  },

  getNextRotationAd: (location: string) => {
    const state = get();
    const ads = state.rotatingAds[location] || [];

    if (ads.length === 0) return null;

    const currentIndex = state.currentRotationIndex[location] || 0;
    const ad = ads[currentIndex];

    // Update index for next time
    set((state) => ({
      currentRotationIndex: {
        ...state.currentRotationIndex,
        [location]: (currentIndex + 1) % ads.length,
      },
    }));

    return ad;
  },

  logAdvertisementEvent: async (adId: string, eventType: "impression" | "view" | "click", location: string) => {
    try {
      const { data, error } = await supabase.rpc("log_advertisement_event", {
        ad_id: adId,
        event: eventType,
        member: null, // Will be set in the component
        loc: location,
        device: Platform.OS,
        platform: Platform.OS === "web" ? "web" : "mobile",
      });

      if (error) throw error;

      return data;
    } catch (error) {
      console.error(`Error logging ${eventType} event:`, error);
    }
  },
}));
```

### 3. Advertisement Carousel Component

```tsx
// components/AdvertisementCarousel.tsx
import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, View, FlatList, Dimensions, ViewToken } from "react-native";
import { useAdvertisementStore, Advertisement } from "@/store/advertisementStore";
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
      const nextIndex = (activeIndex + 1) % (rotatingAds[location]?.length || 1);
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
  if (rotatingAds[location].length === 1) {
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
```

## Admin Interface

### Union Admin Dashboard with Advertisement Management

```tsx
// app/(admin)/union_admin/advertisements.tsx
import React, { useState, useEffect } from "react";
import { StyleSheet, FlatList } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/utils/supabase";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CreateAdvertisementModal } from "@/components/admin/advertisements/CreateAdvertisementModal";
import { AdvertisementCard } from "@/components/admin/advertisements/AdvertisementCard";

export default function AdvertisementsAdminScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [advertisements, setAdvertisements] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchAdvertisements();
  }, []);

  const fetchAdvertisements = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("advertisements")
        .select("*")
        .order("created_at", { ascending: false })
        .eq("is_deleted", false);

      if (error) throw error;
      setAdvertisements(data || []);
    } catch (error) {
      console.error("Error fetching advertisements:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAdvertisement = async (newAdData) => {
    try {
      const { data, error } = await supabase.from("advertisements").insert([newAdData]).select().single();

      if (error) throw error;

      // Refresh advertisement list
      fetchAdvertisements();
      setShowCreateModal(false);
    } catch (error) {
      console.error("Error creating advertisement:", error);
    }
  };

  const handleDeleteAdvertisement = async (id) => {
    try {
      const { error } = await supabase.from("advertisements").update({ is_deleted: true }).eq("id", id);

      if (error) throw error;

      // Refresh advertisement list
      fetchAdvertisements();
    } catch (error) {
      console.error("Error deleting advertisement:", error);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Advertisement Management",
        }}
      />

      <ThemedView style={styles.container}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Advertisement Management</ThemedText>
          <Button onPress={() => setShowCreateModal(true)} style={styles.createButton}>
            <Ionicons name="add-circle" size={20} />
            <ThemedText>Create New Advertisement</ThemedText>
          </Button>
        </ThemedView>

        {isLoading ? (
          <ThemedView style={styles.loadingContainer}>
            <ThemedText>Loading advertisements...</ThemedText>
          </ThemedView>
        ) : (
          <FlatList
            data={advertisements}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <AdvertisementCard
                advertisement={item}
                onDelete={handleDeleteAdvertisement}
                onEdit={() => router.push(`/admin/union_admin/advertisements/${item.id}`)}
              />
            )}
            ListEmptyComponent={
              <ThemedView style={styles.emptyContainer}>
                <ThemedText>No advertisements found. Create one to get started!</ThemedText>
              </ThemedView>
            }
          />
        )}
      </ThemedView>

      <CreateAdvertisementModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateAdvertisement}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    padding: 24,
    alignItems: "center",
  },
});
```

### 1. Advertisement Status Component

```tsx
// components/admin/advertisements/AdvertisementStatusToggle.tsx
import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "@/hooks/useColorScheme";

interface AdvertisementStatusToggleProps {
  status: "draft" | "active" | "inactive";
  onStatusChange: (newStatus: "draft" | "active" | "inactive") => void;
  disabled?: boolean;
}

export function AdvertisementStatusToggle({
  status,
  onStatusChange,
  disabled = false,
}: AdvertisementStatusToggleProps) {
  const colorScheme = useColorScheme() ?? "light";

  const getStatusColor = () => {
    switch (status) {
      case "active":
        return Colors[colorScheme].success;
      case "inactive":
        return Colors[colorScheme].warning;
      case "draft":
      default:
        return Colors[colorScheme].disabled;
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "active":
        return "checkmark-circle";
      case "inactive":
        return "pause-circle";
      case "draft":
      default:
        return "document-outline";
    }
  };

  const cycleStatus = () => {
    if (disabled) return;

    switch (status) {
      case "draft":
        onStatusChange("active");
        break;
      case "active":
        onStatusChange("inactive");
        break;
      case "inactive":
        onStatusChange("active");
        break;
    }
  };

  return (
    <TouchableOpacity
      style={[styles.container, { borderColor: getStatusColor() }, disabled && styles.disabled]}
      onPress={cycleStatus}
      disabled={disabled}
    >
      <Ionicons name={getStatusIcon()} size={18} color={getStatusColor()} />
      <ThemedText style={[styles.statusText, { color: getStatusColor() }]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 4,
    textTransform: "capitalize",
  },
  disabled: {
    opacity: 0.5,
  },
});
```

### 2. Updated Advertisement Card Component

```tsx
// components/admin/advertisements/AdvertisementCard.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, Image } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { Ionicons } from "@expo/vector-icons";
import { AdvertisementStatusToggle } from "./AdvertisementStatusToggle";
import { format } from "date-fns";
import { useColorScheme } from "@/hooks/useColorScheme";

interface AdvertisementCardProps {
  advertisement: {
    id: string;
    title: string;
    description: string;
    image_url: string;
    start_date: string;
    end_date: string;
    status: "draft" | "active" | "inactive";
  };
  onEdit: () => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: "draft" | "active" | "inactive") => void;
}

export function AdvertisementCard({ advertisement, onEdit, onDelete, onStatusChange }: AdvertisementCardProps) {
  const colorScheme = useColorScheme() ?? "light";

  const handleStatusChange = (newStatus: "draft" | "active" | "inactive") => {
    onStatusChange(advertisement.id, newStatus);
  };

  const isActive = new Date() >= new Date(advertisement.start_date) && new Date() <= new Date(advertisement.end_date);

  return (
    <ThemedView style={[styles.container, { backgroundColor: Colors[colorScheme].card }]}>
      <ThemedView style={styles.header}>
        <ThemedText style={styles.title}>{advertisement.title}</ThemedText>
        <AdvertisementStatusToggle
          status={advertisement.status}
          onStatusChange={handleStatusChange}
          disabled={!isActive} // Disable toggling if outside date range
        />
      </ThemedView>

      <ThemedView style={styles.content}>
        {advertisement.image_url && (
          <Image source={{ uri: advertisement.image_url }} style={styles.thumbnail} resizeMode="contain" />
        )}

        <ThemedView style={styles.details}>
          <ThemedText style={styles.description} numberOfLines={2}>
            {advertisement.description}
          </ThemedText>

          <ThemedView style={styles.dateContainer}>
            <ThemedView style={styles.dateItem}>
              <Ionicons name="calendar" size={14} color={Colors[colorScheme].text} />
              <ThemedText style={styles.dateText}>
                {format(new Date(advertisement.start_date), "MMM d, yyyy")} -
                {format(new Date(advertisement.end_date), "MMM d, yyyy")}
              </ThemedText>
            </ThemedView>

            <ThemedText
              style={[
                styles.activeStatus,
                { color: isActive ? Colors[colorScheme].success : Colors[colorScheme].error },
              ]}
            >
              {isActive ? "In Date Range" : "Out of Date Range"}
            </ThemedText>
          </ThemedView>
        </ThemedView>
      </ThemedView>

      <ThemedView style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={onEdit}>
          <Ionicons name="create-outline" size={20} color={Colors[colorScheme].text} />
          <ThemedText style={styles.actionText}>Edit</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => onDelete(advertisement.id)}>
          <Ionicons name="trash-outline" size={20} color={Colors[colorScheme].error} />
          <ThemedText style={[styles.actionText, { color: Colors[colorScheme].error }]}>Delete</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    flex: 1,
    marginRight: 12,
  },
  content: {
    flexDirection: "row",
    padding: 16,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 4,
    marginRight: 16,
  },
  details: {
    flex: 1,
    justifyContent: "space-between",
  },
  description: {
    fontSize: 14,
    marginBottom: 8,
  },
  dateContainer: {
    gap: 4,
  },
  dateItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateText: {
    fontSize: 12,
    opacity: 0.7,
  },
  activeStatus: {
    fontSize: 12,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.1)",
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 8,
  },
  actionText: {
    fontSize: 14,
  },
  deleteButton: {
    borderLeftWidth: 1,
    borderLeftColor: "rgba(128, 128, 128, 0.1)",
  },
});
```

### 3. Updated Advertisement Admin Screen with Status Toggle

```tsx
// app/(admin)/union_admin/advertisements.tsx
// ... existing imports ...

export default function AdvertisementsAdminScreen() {
  // ... existing state and functions ...

  const handleStatusChange = async (id: string, newStatus: "draft" | "active" | "inactive") => {
    try {
      setIsLoading(true);
      const { error } = await supabase.from("advertisements").update({ status: newStatus }).eq("id", id);

      if (error) throw error;

      // Refresh advertisement list
      fetchAdvertisements();

      // Show success message
      Toast.show({
        type: "success",
        text1: "Status updated",
        position: "bottom",
        visibilityTime: 2000,
      });
    } catch (error) {
      console.error("Error updating advertisement status:", error);
      Toast.show({
        type: "error",
        text1: "Error updating status",
        position: "bottom",
        visibilityTime: 2000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* ... existing JSX ... */}
      <FlatList
        data={advertisements}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AdvertisementCard
            advertisement={item}
            onDelete={handleDeleteAdvertisement}
            onEdit={() => router.push(`/admin/union_admin/advertisements/${item.id}`)}
            onStatusChange={handleStatusChange}
          />
        )}
        ListEmptyComponent={/* ... */}
      />
      {/* ... rest of component ... */}
    </>
  );
}
```

### 4. Advertisement Edit Form with Status Controls

```tsx
// app/(admin)/union_admin/advertisements/[id].tsx
import React, { useState, useEffect } from "react";
import { StyleSheet, ScrollView, TouchableOpacity, Image } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { AdvertisementStatusToggle } from "@/components/admin/advertisements/AdvertisementStatusToggle";
import { supabase } from "@/utils/supabase";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Colors } from "@/constants/Colors";
import Toast from "react-native-toast-message";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function EditAdvertisementScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";

  const [advertisement, setAdvertisement] = useState({
    title: "",
    description: "",
    image_url: "",
    destination_url: "",
    start_date: new Date(),
    end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default to 30 days from now
    status: "draft" as "draft" | "active" | "inactive",
    placement_locations: ["home", "notifications"],
    target_devices: ["mobile", "web"],
    weight: 1,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageFile, setImageFile] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchAdvertisement(id as string);
    }
  }, [id]);

  const fetchAdvertisement = async (adId: string) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.from("advertisements").select("*").eq("id", adId).single();

      if (error) throw error;

      if (data) {
        setAdvertisement({
          ...data,
          start_date: new Date(data.start_date),
          end_date: new Date(data.end_date),
        });
      }
    } catch (error) {
      console.error("Error fetching advertisement:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to load advertisement",
        position: "bottom",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImageFile(result.assets[0].uri);
    }
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return advertisement.image_url;

    try {
      const fileExt = imageFile.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${id}/${fileName}`;

      // Upload file to Supabase Storage
      const { data, error } = await supabase.storage
        .from("advertisements")
        .upload(filePath, await FileSystem.readAsStringAsync(imageFile, { encoding: FileSystem.EncodingType.Base64 }), {
          contentType: `image/${fileExt}`,
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = supabase.storage.from("advertisements").getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error("Error uploading image:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to upload image",
        position: "bottom",
      });
      return null;
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      // Validate form
      if (!advertisement.title || !advertisement.description) {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Title and description are required",
          position: "bottom",
        });
        return;
      }

      // Upload image if changed
      let imageUrl = advertisement.image_url;
      if (imageFile) {
        imageUrl = await uploadImage();
        if (!imageUrl) return;
      }

      // Update advertisement in database
      const { error } = await supabase
        .from("advertisements")
        .update({
          ...advertisement,
          image_url: imageUrl,
        })
        .eq("id", id);

      if (error) throw error;

      Toast.show({
        type: "success",
        text1: "Success",
        text2: "Advertisement updated successfully",
        position: "bottom",
      });

      router.push("/admin/union_admin/advertisements");
    } catch (error) {
      console.error("Error saving advertisement:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to save advertisement",
        position: "bottom",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = (newStatus: "draft" | "active" | "inactive") => {
    setAdvertisement((prev) => ({ ...prev, status: newStatus }));
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Edit Advertisement",
        }}
      />

      <ScrollView style={styles.container}>
        {isLoading ? (
          <ThemedView style={styles.loadingContainer}>
            <ThemedText>Loading advertisement...</ThemedText>
          </ThemedView>
        ) : (
          <ThemedView style={styles.form}>
            <ThemedView style={styles.statusSection}>
              <ThemedText style={styles.sectionTitle}>Status</ThemedText>
              <AdvertisementStatusToggle status={advertisement.status} onStatusChange={handleStatusChange} />
            </ThemedView>

            <ThemedView style={styles.formGroup}>
              <ThemedText style={styles.label}>Title</ThemedText>
              <TextInput
                value={advertisement.title}
                onChangeText={(text) => setAdvertisement((prev) => ({ ...prev, title: text }))}
                placeholder="Advertisement Title"
                style={styles.input}
              />
            </ThemedView>

            <ThemedView style={styles.formGroup}>
              <ThemedText style={styles.label}>Description</ThemedText>
              <TextInput
                value={advertisement.description}
                onChangeText={(text) => setAdvertisement((prev) => ({ ...prev, description: text }))}
                placeholder="Advertisement Description"
                multiline
                numberOfLines={4}
                style={[styles.input, styles.textArea]}
              />
            </ThemedView>

            <ThemedView style={styles.formGroup}>
              <ThemedText style={styles.label}>Destination URL</ThemedText>
              <TextInput
                value={advertisement.destination_url}
                onChangeText={(text) => setAdvertisement((prev) => ({ ...prev, destination_url: text }))}
                placeholder="https://example.com"
                style={styles.input}
              />
            </ThemedView>

            <ThemedView style={styles.datesContainer}>
              <ThemedView style={[styles.formGroup, styles.dateGroup]}>
                <ThemedText style={styles.label}>Start Date</ThemedText>
                <DateTimePicker
                  value={advertisement.start_date}
                  onChange={(date) => setAdvertisement((prev) => ({ ...prev, start_date: date }))}
                  mode="date"
                />
              </ThemedView>

              <ThemedView style={[styles.formGroup, styles.dateGroup]}>
                <ThemedText style={styles.label}>End Date</ThemedText>
                <DateTimePicker
                  value={advertisement.end_date}
                  onChange={(date) => setAdvertisement((prev) => ({ ...prev, end_date: date }))}
                  mode="date"
                  minimumDate={advertisement.start_date}
                />
              </ThemedView>
            </ThemedView>

            <ThemedView style={styles.formGroup}>
              <ThemedText style={styles.label}>Advertisement Image</ThemedText>

              <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
                {imageFile || advertisement.image_url ? (
                  <Image
                    source={{ uri: imageFile || advertisement.image_url }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                ) : (
                  <ThemedView style={styles.placeholderContainer}>
                    <Ionicons name="image-outline" size={48} color={Colors[colorScheme].text} />
                    <ThemedText>Tap to select an image</ThemedText>
                  </ThemedView>
                )}
              </TouchableOpacity>
            </ThemedView>

            <ThemedView style={styles.buttonContainer}>
              <Button onPress={handleSave} style={styles.saveButton} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Advertisement"}
              </Button>

              <Button onPress={() => router.back()} variant="secondary" style={styles.cancelButton} disabled={isSaving}>
                Cancel
              </Button>
            </ThemedView>
          </ThemedView>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  form: {
    padding: 16,
    gap: 16,
  },
  statusSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.3)",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  datesContainer: {
    flexDirection: "row",
    gap: 16,
  },
  dateGroup: {
    flex: 1,
  },
  imagePicker: {
    width: "100%",
    height: 200,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(128, 128, 128, 0.3)",
    borderRadius: 8,
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  placeholderContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(128, 128, 128, 0.1)",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
  },
  saveButton: {
    flex: 3,
    marginRight: 8,
  },
  cancelButton: {
    flex: 1,
  },
});
```

### 5. Advertisement Preview Component

```tsx
// components/admin/advertisements/PreviewModal.tsx
import React, { useState } from "react";
import { StyleSheet, Modal, ScrollView } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/ui/Button";
import { Ionicons } from "@expo/vector-icons";
import { AdvertisementBanner } from "@/components/AdvertisementBanner";
import { Picker } from "@react-native-picker/picker";
import { useColorScheme } from "@/hooks/useColorScheme";

interface PreviewModalProps {
  visible: boolean;
  onClose: () => void;
  advertisement: {
    id: string;
    title: string;
    description: string;
    image_url: string;
    destination_url: string;
    status: string;
  };
}

export function PreviewModal({ visible, onClose, advertisement }: PreviewModalProps) {
  const [previewLocation, setPreviewLocation] = useState("home");
  const [previewDevice, setPreviewDevice] = useState("mobile");
  const colorScheme = useColorScheme() ?? "light";

  // All possible ad placement locations
  const placementLocations = [
    { label: "Home Banner", value: "home" },
    { label: "Notifications Top", value: "notifications_top" },
    { label: "Notifications Sidebar (Web)", value: "notifications_sidebar" },
    { label: "Notifications Bottom (Mobile)", value: "notifications_bottom" },
  ];

  return (
    <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
      <ThemedView style={styles.modalOverlay}>
        <ThemedView style={styles.modalContainer}>
          <ThemedView style={styles.modalHeader}>
            <ThemedText type="title">Advertisement Preview</ThemedText>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors[colorScheme].text} />
            </TouchableOpacity>
          </ThemedView>

          <ScrollView style={styles.modalContent}>
            <ThemedView style={styles.previewControls}>
              <ThemedView style={styles.controlItem}>
                <ThemedText style={styles.label}>Location:</ThemedText>
                <Picker
                  selectedValue={previewLocation}
                  onValueChange={(value) => setPreviewLocation(value)}
                  style={styles.picker}
                >
                  {placementLocations.map((location) => (
                    <Picker.Item key={location.value} label={location.label} value={location.value} />
                  ))}
                </Picker>
              </ThemedView>

              <ThemedView style={styles.controlItem}>
                <ThemedText style={styles.label}>Device:</ThemedText>
                <Picker
                  selectedValue={previewDevice}
                  onValueChange={(value) => setPreviewDevice(value)}
                  style={styles.picker}
                >
                  <Picker.Item label="Mobile" value="mobile" />
                  <Picker.Item label="Web" value="web" />
                </Picker>
              </ThemedView>
            </ThemedView>

            <ThemedText style={styles.sectionTitle}>Preview:</ThemedText>

            <ThemedView style={styles.previewContainer}>
              <ThemedText style={styles.previewLabel}>
                {placementLocations.find((loc) => loc.value === previewLocation)?.label} - {previewDevice}
              </ThemedText>

              <ThemedView
                style={[styles.previewFrame, previewDevice === "mobile" ? styles.mobileFrame : styles.webFrame]}
              >
                <AdvertisementBanner
                  location={previewLocation}
                  testMode={true}
                  testAd={advertisement}
                  maxHeight={previewLocation.includes("sidebar") ? 600 : 100}
                />
              </ThemedView>
            </ThemedView>

            <ThemedView style={styles.adDetails}>
              <ThemedText style={styles.sectionTitle}>Advertisement Details</ThemedText>
              <ThemedText style={styles.detailItem}>Title: {advertisement.title}</ThemedText>
              <ThemedText style={styles.detailItem}>Description: {advertisement.description}</ThemedText>
              <ThemedText style={styles.detailItem}>Status: {advertisement.status}</ThemedText>
              <ThemedText style={styles.detailItem}>Destination URL: {advertisement.destination_url}</ThemedText>
            </ThemedView>
          </ScrollView>

          <ThemedView style={styles.modalFooter}>
            <Button onPress={onClose} style={styles.closeBtn}>
              Close Preview
            </Button>
          </ThemedView>
        </ThemedView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContainer: {
    width: "90%",
    maxWidth: 800,
    maxHeight: "90%",
    borderRadius: 12,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    padding: 16,
  },
  previewControls: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 24,
  },
  controlItem: {
    flex: 1,
    minWidth: 150,
    marginBottom: 16,
    marginRight: 16,
  },
  label: {
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "500",
  },
  picker: {
    height: 40,
    width: "100%",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  previewContainer: {
    marginBottom: 24,
    alignItems: "center",
  },
  previewLabel: {
    marginBottom: 8,
    textAlign: "center",
    fontWeight: "500",
  },
  previewFrame: {
    borderWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.2)",
    overflow: "hidden",
  },
  mobileFrame: {
    width: 320,
    borderRadius: 16,
  },
  webFrame: {
    width: "100%",
    maxWidth: 768,
    borderRadius: 4,
  },
  adDetails: {
    marginBottom: 16,
  },
  detailItem: {
    marginBottom: 8,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.1)",
  },
  closeBtn: {
    width: "100%",
  },
});
```

### 6. Integration with Advertisement Edit Screen

Update the `EditAdvertisementScreen` to include preview functionality:

```tsx
// app/(admin)/union_admin/advertisements/[id].tsx
// ... existing imports ...
import { PreviewModal } from "@/components/admin/advertisements/PreviewModal";

export default function EditAdvertisementScreen() {
  // ... existing state and functions ...
  const [showPreview, setShowPreview] = useState(false);

  // ... existing code ...

  return (
    <>
      <Stack.Screen
        options={{
          title: "Edit Advertisement",
          // Add a preview button in the header
          headerRight: () => (
            <TouchableOpacity onPress={() => setShowPreview(true)} style={{ marginRight: 16 }}>
              <Ionicons name="eye-outline" size={24} color={Colors[colorScheme].text} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* ... existing JSX ... */}

      {/* Preview Modal */}
      <PreviewModal
        visible={showPreview}
        onClose={() => setShowPreview(false)}
        advertisement={{
          id: id as string,
          title: advertisement.title,
          description: advertisement.description,
          image_url: imageFile || advertisement.image_url,
          destination_url: advertisement.destination_url,
          status: advertisement.status,
        }}
      />
    </>
  );
}
```

## Required Packages

Most of the required packages are already installed in the project. Here's a list of the packages that will be used:

1. **Already Installed Packages**:

   - `@expo/vector-icons` - For icons in the admin interface
   - `@react-native-picker/picker` - For dropdown selection in analytics
   - `@supabase/supabase-js` - For database interactions
   - `expo-web-browser` - For opening ad links in browser
   - `react-native-gesture-handler` - For enhanced touch handling
   - `zustand` - For state management
   - `expo-file-system` - For handling file operations

2. **Additional Packages to Install**:
   - `react-native-chart-kit` - For analytics charts
   - `expo-image-picker` - For selecting images from device
   - `expo-document-picker` - For picking PDF files
   - `react-native-pdf` - For rendering PDF previews

```bash
npx expo install react-native-chart-kit expo-image-picker expo-document-picker react-native-pdf
```

## Implementation Phases

### Phase 1: Database Setup

1. Create the required database tables
   - `advertisements` table with all necessary fields including status field
   - `advertisement_analytics` table for tracking events
2. Set up RLS policies using the existing `get_my_effective_roles()` function
3. Implement functions and triggers for:
   - Advertisement updating
   - Advertisement retrieval with rotation logic
   - Analytics event logging and reporting
4. Create storage bucket for advertisement assets with proper permissions

### Phase 2: Basic Frontend Components

1. Create the Advertisement Banner component
2. Create the Advertisement Carousel component for ad rotation
3. Implement the advertisement store with Zustand
4. Add the banner to the home page (index.tsx) underneath the logo in ParallaxScrollView
5. Add ads to the notifications page (top for all devices, sidebar for web, bottom for mobile)

### Phase 3: Admin Interface

1. Create the advertisement management screen
2. Implement image/PDF upload functionality
3. Build the ad creation/editing forms
4. Add status toggle functionality for ad activation/deactivation
5. Implement preview capabilities to test ads in different placement locations and device types
6. Add validation for required fields and date ranges

### Phase 4: Analytics System

1. Implement event tracking (impressions, views, clicks)
2. Create analytics dashboard with:
   - Summary metrics (impressions, clicks, CTR)
   - Time-series data visualization
   - Device type breakdown
   - Placement location analysis
3. Add filtering by date range
4. Add CSV export functionality
5. Implement real-time updates for active campaign metrics

### Phase 5: Advanced Features

1. Implement targeted advertisements based on:
   - Member status (active, inactive)
   - Member rank
   - Division
2. Create A/B testing functionality
3. Add scheduling capabilities for campaigns
4. Implement intelligent ad rotation based on performance metrics
5. Add notification system for campaign start/end and performance alerts

### Phase 6: Testing and Refinement

1. Test on different devices and platforms
2. Optimize ad loading performance
3. Implement lazy loading for advertisements
4. Refine UI/UX based on feedback
5. Add comprehensive error handling
6. Ensure accessibility compliance

## Integration Points

### 1. Home Page Integration

Modify `app/(tabs)/index.tsx` to include the advertisement banner:

```tsx
<ParallaxScrollView
  headerBackgroundColor={{ light: "#A1CEDC", dark: "#000000FF" }}
  headerImage={
    <>
      <Image source={require("@/assets/images/BLETblackgold.png")} style={styles.reactLogo} />
      <AdvertisementBanner location="home" style={styles.adBanner} maxHeight={80} />
    </>
  }
>
  {/* Existing content */}
</ParallaxScrollView>
```

### 2. Notifications Page Integration

Modify `app/(tabs)/notifications.tsx` to include advertisements in responsive layout:

```tsx
<PlatformScrollView
  style={styles.container}
  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
>
  <AdvertisementBanner location="notifications_top" style={styles.topAdBanner} maxHeight={80} />

  <ThemedView style={styles.controls}>{/* Existing controls */}</ThemedView>

  {/* On web, add side advertisement */}
  {Platform.OS === "web" && (
    <ThemedView style={styles.contentWithSidebar}>
      <ThemedView style={styles.mainContent}>{/* Existing content */}</ThemedView>
      <ThemedView style={styles.sidebar}>
        <AdvertisementBanner location="notifications_sidebar" style={styles.sidebarAd} maxHeight={600} />
      </ThemedView>
    </ThemedView>
  )}

  {/* On mobile, show ads at the bottom */}
  {Platform.OS !== "web" && (
    <>
      {/* Existing content */}
      <AdvertisementBanner location="notifications_bottom" style={styles.bottomAdBanner} maxHeight={80} />
    </>
  )}
</PlatformScrollView>
```

### 3. Union Admin Navigation

Update the admin navigation to include the advertisements management section:

```tsx
// components/admin/AdminDashboard.tsx
{
  role === "union_admin" && (
    <>
      <ThemedText type="subtitle">Union Admin Features:</ThemedText>
      <ThemedView style={styles.adminLinks}>
        <AdminNavigationLink title="Union Announcements" icon="megaphone" href="/admin/union_admin/announcements" />
        <AdminNavigationLink title="Advertisements" icon="pricetag" href="/admin/union_admin/advertisements" />
        <AdminNavigationLink title="Ad Analytics" icon="analytics" href="/admin/union_admin/advertisement_analytics" />
        {/* Other links */}
      </ThemedView>
    </>
  );
}
```

## Conclusion

This implementation plan provides a comprehensive framework for developing the advertisement system for the BLET mobile application. The system has been designed to be flexible, scalable, and integrated with the existing app architecture. Key features include:

1. A flexible database design that supports targeting and performance analytics
2. Proper integration with the existing role-based permissions system
3. A user-friendly admin interface with preview capabilities and status control
4. Advanced ad rotation logic to maximize engagement
5. Comprehensive analytics for performance tracking
6. Responsive layouts that adapt to different devices and screen sizes

By following the outlined phases, we can ensure a systematic and efficient development process that delivers a powerful advertising system while maintaining the integrity and performance of the existing application.

## Analytics System

### 1. Database Functions for Analytics

```sql
-- Get summary statistics for an advertisement
CREATE OR REPLACE FUNCTION get_advertisement_summary(ad_id UUID)
RETURNS TABLE(
  impressions BIGINT,
  views BIGINT,
  clicks BIGINT,
  ctr FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'impression') AS imp_count,
      COUNT(*) FILTER (WHERE event_type = 'view') AS view_count,
      COUNT(*) FILTER (WHERE event_type = 'click') AS click_count
    FROM advertisement_analytics
    WHERE advertisement_id = ad_id
  )
  SELECT
    imp_count AS impressions,
    view_count AS views,
    click_count AS clicks,
    CASE
      WHEN imp_count > 0 THEN click_count::FLOAT / imp_count
      ELSE 0
    END AS ctr
  FROM stats;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get device breakdown for an advertisement
CREATE OR REPLACE FUNCTION get_advertisement_device_breakdown(ad_id UUID)
RETURNS TABLE(
  device_type TEXT,
  impressions BIGINT,
  clicks BIGINT,
  ctr FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      device_type,
      COUNT(*) FILTER (WHERE event_type = 'impression') AS imp_count,
      COUNT(*) FILTER (WHERE event_type = 'click') AS click_count
    FROM advertisement_analytics
    WHERE advertisement_id = ad_id
    GROUP BY device_type
  )
  SELECT
    device_type,
    imp_count AS impressions,
    click_count AS clicks,
    CASE
      WHEN imp_count > 0 THEN click_count::FLOAT / imp_count
      ELSE 0
    END AS ctr
  FROM stats;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get daily statistics for an advertisement
CREATE OR REPLACE FUNCTION get_advertisement_daily_stats(ad_id UUID)
RETURNS TABLE(
  date DATE,
  impressions BIGINT,
  clicks BIGINT,
  ctr FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH daily_stats AS (
    SELECT
      DATE(occurred_at) AS event_date,
      COUNT(*) FILTER (WHERE event_type = 'impression') AS imp_count,
      COUNT(*) FILTER (WHERE event_type = 'click') AS click_count
    FROM advertisement_analytics
    WHERE advertisement_id = ad_id
    GROUP BY DATE(occurred_at)
    ORDER BY DATE(occurred_at)
  )
  SELECT
    event_date AS date,
    imp_count AS impressions,
    click_count AS clicks,
    CASE
      WHEN imp_count > 0 THEN click_count::FLOAT / imp_count
      ELSE 0
    END AS ctr
  FROM daily_stats;
END;
$$ LANGUAGE plpgsql STABLE;
```

### 2. Comprehensive Analytics Dashboard

```tsx
// app/(admin)/union_admin/advertisement_analytics.tsx
import React, { useState, useEffect, useMemo } from "react";
import { StyleSheet, ScrollView, Platform, TouchableOpacity } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { supabase } from "@/utils/supabase";
import { Stack } from "expo-router";
import { Picker } from "@react-native-picker/picker";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/constants/Colors";
import { Ionicons } from "@expo/vector-icons";
import { LineChart, BarChart, PieChart } from "react-native-chart-kit";
import { Dimensions } from "react-native";
import { format, subDays, eachDayOfInterval } from "date-fns";

// Import CSV export functionality
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";

const screenWidth = Dimensions.get("window").width;

interface Advertisement {
  id: string;
  title: string;
}

interface AnalyticsSummary {
  impressions: number;
  views: number;
  clicks: number;
  ctr: number;
}

interface DeviceBreakdown {
  device_type: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

interface DailyStats {
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

interface LocationStats {
  location: string;
  impressions: number;
  clicks: number;
}

export default function AdvertisementAnalyticsScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [advertisements, setAdvertisements] = useState<Advertisement[]>([]);
  const [selectedAd, setSelectedAd] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<string>("7days");
  const [analytics, setAnalytics] = useState<{
    summary: AnalyticsSummary;
    byDevice: DeviceBreakdown[];
    byDay: DailyStats[];
    byLocation: LocationStats[];
  }>({
    summary: { impressions: 0, views: 0, clicks: 0, ctr: 0 },
    byDevice: [],
    byDay: [],
    byLocation: [],
  });

  const colorScheme = useColorScheme() ?? "light";

  useEffect(() => {
    fetchAdvertisements();
  }, []);

  useEffect(() => {
    if (selectedAd) {
      fetchAnalytics(selectedAd);
    }
  }, [selectedAd, dateRange]);

  const fetchAdvertisements = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("advertisements")
        .select("id, title")
        .order("created_at", { ascending: false })
        .eq("is_deleted", false);

      if (error) throw error;

      setAdvertisements(data || []);
      if (data && data.length > 0) {
        setSelectedAd(data[0].id);
      }
    } catch (error) {
      console.error("Error fetching advertisements:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAnalytics = async (adId: string) => {
    try {
      setIsLoading(true);

      // Get date range for query
      const endDate = new Date();
      const startDate = getStartDateFromRange(dateRange);

      // Fetch summary stats
      const { data: summaryData, error: summaryError } = await supabase.rpc("get_advertisement_summary", {
        ad_id: adId,
      });

      if (summaryError) throw summaryError;

      // Fetch device breakdown
      const { data: deviceData, error: deviceError } = await supabase.rpc("get_advertisement_device_breakdown", {
        ad_id: adId,
      });

      if (deviceError) throw deviceError;

      // Fetch daily stats with date range
      const { data: dailyData, error: dailyError } = await supabase
        .from("advertisement_analytics")
        .select("occurred_at, event_type")
        .eq("advertisement_id", adId)
        .gte("occurred_at", startDate.toISOString())
        .lte("occurred_at", endDate.toISOString());

      if (dailyError) throw dailyError;

      // Process daily data
      const processedDailyData = processDailyData(dailyData || [], startDate, endDate);

      // Fetch location stats
      const { data: locationData, error: locationError } = await supabase
        .from("advertisement_analytics")
        .select("location, event_type")
        .eq("advertisement_id", adId)
        .gte("occurred_at", startDate.toISOString())
        .lte("occurred_at", endDate.toISOString());

      if (locationError) throw locationError;

      // Process location data
      const processedLocationData = processLocationData(locationData || []);

      setAnalytics({
        summary: summaryData || { impressions: 0, views: 0, clicks: 0, ctr: 0 },
        byDevice: deviceData || [],
        byDay: processedDailyData,
        byLocation: processedLocationData,
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStartDateFromRange = (range: string): Date => {
    const today = new Date();
    switch (range) {
      case "7days":
        return subDays(today, 7);
      case "30days":
        return subDays(today, 30);
      case "90days":
        return subDays(today, 90);
      default:
        return subDays(today, 7);
    }
  };

  const processDailyData = (data: any[], startDate: Date, endDate: Date): DailyStats[] => {
    // Create a map for all days in the range
    const daysMap = new Map();

    eachDayOfInterval({ start: startDate, end: endDate }).forEach((date) => {
      const dateStr = format(date, "yyyy-MM-dd");
      daysMap.set(dateStr, {
        date: dateStr,
        impressions: 0,
        clicks: 0,
        ctr: 0,
      });
    });

    // Fill in the actual data
    data.forEach((item) => {
      const dateStr = format(new Date(item.occurred_at), "yyyy-MM-dd");
      if (daysMap.has(dateStr)) {
        const entry = daysMap.get(dateStr);
        if (item.event_type === "impression") {
          entry.impressions += 1;
        } else if (item.event_type === "click") {
          entry.clicks += 1;
        }
        daysMap.set(dateStr, entry);
      }
    });

    // Calculate CTR and convert to array
    const result: DailyStats[] = [];
    daysMap.forEach((entry) => {
      entry.ctr = entry.impressions > 0 ? entry.clicks / entry.impressions : 0;
      result.push(entry);
    });

    // Sort by date
    return result.sort((a, b) => a.date.localeCompare(b.date));
  };

  const processLocationData = (data: any[]): LocationStats[] => {
    const locationMap = new Map<string, { impressions: number; clicks: number }>();

    data.forEach((item) => {
      if (!locationMap.has(item.location)) {
        locationMap.set(item.location, { impressions: 0, clicks: 0 });
      }

      const entry = locationMap.get(item.location)!;
      if (item.event_type === "impression") {
        entry.impressions += 1;
      } else if (item.event_type === "click") {
        entry.clicks += 1;
      }
      locationMap.set(item.location, entry);
    });

    const result: LocationStats[] = [];
    locationMap.forEach((value, key) => {
      result.push({
        location: key,
        impressions: value.impressions,
        clicks: value.clicks,
      });
    });

    return result;
  };

  const chartConfig = {
    backgroundColor: Colors[colorScheme].card,
    backgroundGradientFrom: Colors[colorScheme].card,
    backgroundGradientTo: Colors[colorScheme].card,
    decimalPlaces: 1,
    color: (opacity = 1) => `rgba(212, 175, 55, ${opacity})`, // Gold color
    labelColor: (opacity = 1) => Colors[colorScheme].text,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: "6",
      strokeWidth: "2",
      stroke: Colors[colorScheme].primary,
    },
  };

  const lineChartData = useMemo(() => {
    return {
      labels: analytics.byDay.map((day) => format(new Date(day.date), "MMM d")),
      datasets: [
        {
          data: analytics.byDay.map((day) => day.impressions),
          color: (opacity = 1) => `rgba(212, 175, 55, ${opacity})`, // Gold
          strokeWidth: 2,
        },
        {
          data: analytics.byDay.map((day) => day.clicks),
          color: (opacity = 1) => `rgba(128, 0, 128, ${opacity})`, // Purple
          strokeWidth: 2,
        },
      ],
      legend: ["Impressions", "Clicks"],
    };
  }, [analytics.byDay, colorScheme]);

  const deviceData = useMemo(() => {
    return {
      labels: analytics.byDevice.map((item) => item.device_type),
      data: analytics.byDevice.map((item) => item.impressions),
    };
  }, [analytics.byDevice]);

  const exportCSV = async () => {
    if (!selectedAd) return;

    // Create CSV content
    let csvContent = "date,impressions,clicks,ctr\n";
    analytics.byDay.forEach((day) => {
      csvContent += `${day.date},${day.impressions},${day.clicks},${day.ctr.toFixed(4)}\n`;
    });

    if (Platform.OS === "web") {
      // For web, create a download link
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.setAttribute("hidden", "");
      a.setAttribute("href", url);
      a.setAttribute("download", `ad_analytics_${selectedAd}.csv`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      // For mobile, save to file system and share
      const fileName = `${FileSystem.documentDirectory}ad_analytics_${selectedAd}.csv`;
      await FileSystem.writeAsStringAsync(fileName, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileName);
      } else {
        // Fallback to clipboard
        await Clipboard.setStringAsync(csvContent);
        // Show a toast or alert that data is copied to clipboard
      }
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Advertisement Analytics",
        }}
      />

      <ScrollView style={styles.container}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Advertisement Analytics</ThemedText>

          <ThemedView style={styles.controls}>
            <ThemedView style={styles.pickerContainer}>
              <ThemedText style={styles.label}>Select Advertisement:</ThemedText>
              <Picker
                selectedValue={selectedAd}
                onValueChange={(itemValue) => setSelectedAd(itemValue)}
                style={styles.picker}
              >
                {advertisements.map((ad) => (
                  <Picker.Item key={ad.id} label={ad.title} value={ad.id} />
                ))}
              </Picker>
            </ThemedView>

            <ThemedView style={styles.pickerContainer}>
              <ThemedText style={styles.label}>Date Range:</ThemedText>
              <Picker
                selectedValue={dateRange}
                onValueChange={(itemValue) => setDateRange(itemValue)}
                style={styles.picker}
              >
                <Picker.Item label="Last 7 Days" value="7days" />
                <Picker.Item label="Last 30 Days" value="30days" />
                <Picker.Item label="Last 90 Days" value="90days" />
              </Picker>
            </ThemedView>
          </ThemedView>

          <TouchableOpacity style={styles.exportButton} onPress={exportCSV}>
            <Ionicons name="download-outline" size={20} color={Colors[colorScheme].text} />
            <ThemedText style={styles.exportButtonText}>Export Data</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        {isLoading ? (
          <ThemedView style={styles.loadingContainer}>
            <ThemedText>Loading analytics...</ThemedText>
          </ThemedView>
        ) : (
          <ThemedView style={styles.analyticsContainer}>
            <ThemedView style={styles.summaryContainer}>
              <ThemedView style={styles.summaryCard}>
                <ThemedText style={styles.summaryTitle}>Impressions</ThemedText>
                <ThemedText style={styles.summaryValue}>{analytics.summary.impressions}</ThemedText>
              </ThemedView>

              <ThemedView style={styles.summaryCard}>
                <ThemedText style={styles.summaryTitle}>Clicks</ThemedText>
                <ThemedText style={styles.summaryValue}>{analytics.summary.clicks}</ThemedText>
              </ThemedView>

              <ThemedView style={styles.summaryCard}>
                <ThemedText style={styles.summaryTitle}>CTR</ThemedText>
                <ThemedText style={styles.summaryValue}>{(analytics.summary.ctr * 100).toFixed(2)}%</ThemedText>
              </ThemedView>
            </ThemedView>

            <ThemedView style={styles.chartContainer}>
              <ThemedText style={styles.chartTitle}>Performance Over Time</ThemedText>
              {analytics.byDay.length > 0 ? (
                <LineChart
                  data={lineChartData}
                  width={screenWidth - 32}
                  height={220}
                  chartConfig={chartConfig}
                  bezier
                  style={styles.chart}
                />
              ) : (
                <ThemedView style={styles.noDataContainer}>
                  <ThemedText>No time-series data available for the selected period</ThemedText>
                </ThemedView>
              )}
            </ThemedView>

            <ThemedView style={styles.chartContainer}>
              <ThemedText style={styles.chartTitle}>By Device Type</ThemedText>
              {analytics.byDevice.length > 0 ? (
                <BarChart
                  data={{
                    labels: analytics.byDevice.map((d) => d.device_type),
                    datasets: [
                      {
                        data: analytics.byDevice.map((d) => d.impressions),
                      },
                    ],
                  }}
                  width={screenWidth - 32}
                  height={220}
                  chartConfig={chartConfig}
                  style={styles.chart}
                  verticalLabelRotation={30}
                />
              ) : (
                <ThemedView style={styles.noDataContainer}>
                  <ThemedText>No device data available</ThemedText>
                </ThemedView>
              )}
            </ThemedView>

            <ThemedView style={styles.chartContainer}>
              <ThemedText style={styles.chartTitle}>By Placement Location</ThemedText>
              {analytics.byLocation.length > 0 ? (
                <BarChart
                  data={{
                    labels: analytics.byLocation.map((l) => l.location),
                    datasets: [
                      {
                        data: analytics.byLocation.map((l) => l.impressions),
                      },
                    ],
                  }}
                  width={screenWidth - 32}
                  height={220}
                  chartConfig={chartConfig}
                  style={styles.chart}
                  verticalLabelRotation={30}
                />
              ) : (
                <ThemedView style={styles.noDataContainer}>
                  <ThemedText>No location data available</ThemedText>
                </ThemedView>
              )}
            </ThemedView>
          </ThemedView>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
  },
  controls: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 16,
  },
  pickerContainer: {
    flex: 1,
    minWidth: 150,
    marginRight: 16,
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
    fontSize: 14,
  },
  picker: {
    height: 40,
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.3)",
    borderRadius: 8,
    marginTop: 8,
  },
  exportButtonText: {
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  analyticsContainer: {
    padding: 16,
  },
  summaryContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    minWidth: 150,
    padding: 16,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
    alignItems: "center",
  },
  summaryTitle: {
    fontSize: 14,
    marginBottom: 8,
    textAlign: "center",
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
  },
  chartContainer: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: "rgba(0, 0, 0, 0.03)",
    borderRadius: 8,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  chart: {
    borderRadius: 8,
    paddingRight: 16,
  },
  noDataContainer: {
    height: 200,
    alignItems: "center",
    justifyContent: "center",
  },
});
```

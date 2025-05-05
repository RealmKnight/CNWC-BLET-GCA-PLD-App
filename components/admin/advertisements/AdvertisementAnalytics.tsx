import React, { useState, useEffect } from "react";
import { StyleSheet, ScrollView, FlatList, View } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { supabase } from "@/utils/supabase";
import { Colors } from "@/constants/Colors";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "@/hooks/useColorScheme";
import Toast from "react-native-toast-message";
import { format, parseISO, subDays } from "date-fns";

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

interface LocationBreakdown {
  location: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

interface DailyStats {
  date: string;
  impressions: number;
  views: number;
  clicks: number;
}

interface Advertisement {
  id: string;
  title: string;
  status: string;
}

export function AdvertisementAnalytics() {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAd, setSelectedAd] = useState<string | null>(null);
  const [advertisements, setAdvertisements] = useState<Advertisement[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [deviceBreakdown, setDeviceBreakdown] = useState<DeviceBreakdown[]>([]);
  const [locationBreakdown, setLocationBreakdown] = useState<LocationBreakdown[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [dateRange, setDateRange] = useState<"7days" | "30days" | "all">("7days");

  useEffect(() => {
    fetchAdvertisements();
  }, []);

  useEffect(() => {
    if (selectedAd) {
      fetchAnalytics();
    }
  }, [selectedAd, dateRange]);

  const fetchAdvertisements = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("advertisements")
        .select("id, title, status")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setAdvertisements(data || []);
      if (data && data.length > 0) {
        setSelectedAd(data[0].id);
      }
    } catch (error) {
      console.error("Error fetching advertisements:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to load advertisements",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    if (!selectedAd) return;

    try {
      setIsLoading(true);

      // Fetch summary
      const { data: summaryData, error: summaryError } = await supabase.rpc("get_advertisement_summary", {
        ad_id: selectedAd,
      });

      if (summaryError) throw summaryError;
      setSummary(summaryData && summaryData.length > 0 ? summaryData[0] : null);

      // Fetch device breakdown
      const { data: deviceData, error: deviceError } = await supabase.rpc("get_advertisement_device_breakdown", {
        ad_id: selectedAd,
      });

      if (deviceError) throw deviceError;
      setDeviceBreakdown(deviceData || []);

      // Fetch location breakdown
      const { data: locationData, error: locationError } = await supabase.rpc("get_advertisement_location_breakdown", {
        ad_id: selectedAd,
      });

      if (locationError) throw locationError;
      setLocationBreakdown(locationData || []);

      // Fetch daily stats based on date range
      let startDate;
      if (dateRange === "7days") {
        startDate = subDays(new Date(), 7);
      } else if (dateRange === "30days") {
        startDate = subDays(new Date(), 30);
      }

      const { data: dailyData, error: dailyError } = await supabase.rpc("get_advertisement_daily_stats", {
        ad_id: selectedAd,
        start_date: startDate ? startDate.toISOString() : null,
      });

      if (dailyError) throw dailyError;
      setDailyStats(dailyData || []);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to load analytics data",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderDateRangeButton = (value: "7days" | "30days" | "all", label: string) => {
    const isActive = dateRange === value;

    return (
      <ThemedTouchableOpacity
        style={[styles.dateRangeButton, isActive && { backgroundColor: Colors[colorScheme].tint }]}
        onPress={() => setDateRange(value)}
      >
        <ThemedText style={[styles.dateRangeButtonText, isActive && { color: "#fff" }]}>{label}</ThemedText>
      </ThemedTouchableOpacity>
    );
  };

  const renderSummaryCard = () => {
    if (!summary) return null;

    return (
      <ThemedView style={styles.card}>
        <ThemedText style={styles.cardTitle}>Summary</ThemedText>
        <ThemedView style={styles.metricsContainer}>
          <ThemedView style={styles.metricItem}>
            <ThemedText style={styles.metricValue}>{summary.impressions.toLocaleString()}</ThemedText>
            <ThemedText style={styles.metricLabel}>Impressions</ThemedText>
          </ThemedView>

          <ThemedView style={styles.metricItem}>
            <ThemedText style={styles.metricValue}>{summary.views.toLocaleString()}</ThemedText>
            <ThemedText style={styles.metricLabel}>Views</ThemedText>
          </ThemedView>

          <ThemedView style={styles.metricItem}>
            <ThemedText style={styles.metricValue}>{summary.clicks.toLocaleString()}</ThemedText>
            <ThemedText style={styles.metricLabel}>Clicks</ThemedText>
          </ThemedView>

          <ThemedView style={styles.metricItem}>
            <ThemedText style={styles.metricValue}>{(summary.ctr * 100).toFixed(2)}%</ThemedText>
            <ThemedText style={styles.metricLabel}>CTR</ThemedText>
          </ThemedView>
        </ThemedView>
      </ThemedView>
    );
  };

  const renderBreakdownCard = (title: string, data: any[], valuePath: string, labelPath: string) => {
    if (!data || data.length === 0) return null;

    return (
      <ThemedView style={styles.card}>
        <ThemedText style={styles.cardTitle}>{title}</ThemedText>
        <FlatList
          data={data}
          keyExtractor={(item, index) => `${item[labelPath]}-${index}`}
          renderItem={({ item }) => (
            <ThemedView style={styles.breakdownItem}>
              <ThemedText style={styles.breakdownLabel}>{item[labelPath]}</ThemedText>
              <ThemedView style={styles.breakdownValues}>
                <ThemedText style={styles.breakdownValue}>{item.impressions} imp</ThemedText>
                <ThemedText style={styles.breakdownValue}>{item.clicks} clicks</ThemedText>
                <ThemedText style={styles.breakdownValue}>{(item.ctr * 100).toFixed(2)}% CTR</ThemedText>
              </ThemedView>
            </ThemedView>
          )}
        />
      </ThemedView>
    );
  };

  const renderDailyStats = () => {
    if (!dailyStats || dailyStats.length === 0) return null;

    return (
      <ThemedView style={styles.card}>
        <ThemedText style={styles.cardTitle}>Daily Performance</ThemedText>
        <FlatList
          data={dailyStats}
          keyExtractor={(item, index) => `${item.date}-${index}`}
          renderItem={({ item }) => (
            <ThemedView style={styles.dailyItem}>
              <ThemedText style={styles.dailyDate}>{format(parseISO(item.date), "MMM d, yyyy")}</ThemedText>
              <ThemedView style={styles.dailyValues}>
                <ThemedView style={styles.dailyMetric}>
                  <ThemedText style={styles.dailyMetricValue}>{item.impressions}</ThemedText>
                  <ThemedText style={styles.dailyMetricLabel}>Imp</ThemedText>
                </ThemedView>
                <ThemedView style={styles.dailyMetric}>
                  <ThemedText style={styles.dailyMetricValue}>{item.views}</ThemedText>
                  <ThemedText style={styles.dailyMetricLabel}>Views</ThemedText>
                </ThemedView>
                <ThemedView style={styles.dailyMetric}>
                  <ThemedText style={styles.dailyMetricValue}>{item.clicks}</ThemedText>
                  <ThemedText style={styles.dailyMetricLabel}>Clicks</ThemedText>
                </ThemedView>
              </ThemedView>
            </ThemedView>
          )}
        />
      </ThemedView>
    );
  };

  if (advertisements.length === 0 && !isLoading) {
    return (
      <ThemedView style={styles.emptyContainer}>
        <Ionicons name="analytics-outline" size={48} color={Colors[colorScheme].text} />
        <ThemedText style={styles.emptyText}>No Advertisements Found</ThemedText>
        <ThemedText style={styles.emptySubtext}>Create advertisements first to see analytics data</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <ThemedView style={styles.adSelectorContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {advertisements.map((ad) => (
            <ThemedTouchableOpacity
              key={ad.id}
              style={[styles.adButton, selectedAd === ad.id && styles.adButtonSelected]}
              onPress={() => setSelectedAd(ad.id)}
            >
              <ThemedText
                style={[styles.adButtonText, selectedAd === ad.id && styles.adButtonTextSelected]}
                numberOfLines={1}
              >
                {ad.title}
              </ThemedText>
              <ThemedView
                style={[
                  styles.adStatusIndicator,
                  {
                    backgroundColor:
                      ad.status === "active"
                        ? Colors[colorScheme].success
                        : ad.status === "draft"
                        ? Colors[colorScheme].disabled
                        : Colors[colorScheme].warning,
                  },
                ]}
              />
            </ThemedTouchableOpacity>
          ))}
        </ScrollView>
      </ThemedView>

      {isLoading ? (
        <ThemedView style={styles.loadingContainer}>
          <ThemedText>Loading analytics data...</ThemedText>
        </ThemedView>
      ) : (
        <ThemedView style={styles.content}>
          <ThemedView style={styles.dateRangeContainer}>
            {renderDateRangeButton("7days", "Last 7 Days")}
            {renderDateRangeButton("30days", "Last 30 Days")}
            {renderDateRangeButton("all", "All Time")}
          </ThemedView>

          {renderSummaryCard()}
          {renderBreakdownCard("Device Breakdown", deviceBreakdown, "impressions", "device_type")}
          {renderBreakdownCard("Location Breakdown", locationBreakdown, "impressions", "location")}
          {renderDailyStats()}
        </ThemedView>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  adSelectorContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
  },
  adButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    flexDirection: "row",
    alignItems: "center",
  },
  adButtonSelected: {
    backgroundColor: Colors.light.tint + "30",
  },
  adButtonText: {
    fontSize: 14,
    maxWidth: 150,
    marginRight: 8,
  },
  adButtonTextSelected: {
    fontWeight: "600",
    color: Colors.light.tint,
  },
  adStatusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  content: {
    padding: 16,
  },
  dateRangeContainer: {
    flexDirection: "row",
    marginBottom: 16,
  },
  dateRangeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
  },
  dateRangeButtonText: {
    fontSize: 14,
  },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },
  metricsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metricItem: {
    alignItems: "center",
    flex: 1,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  metricLabel: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
  },
  breakdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
  },
  breakdownLabel: {
    fontSize: 14,
    flex: 1,
  },
  breakdownValues: {
    flexDirection: "row",
    gap: 12,
  },
  breakdownValue: {
    fontSize: 14,
    opacity: 0.7,
  },
  dailyItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
  },
  dailyDate: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  dailyValues: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dailyMetric: {
    alignItems: "center",
    flex: 1,
  },
  dailyMetricValue: {
    fontSize: 18,
    fontWeight: "600",
  },
  dailyMetricLabel: {
    fontSize: 12,
    opacity: 0.7,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
    opacity: 0.7,
    marginTop: 8,
  },
});

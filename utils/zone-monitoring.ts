import { supabase } from "@/utils/supabase";

interface ZoneMetrics {
    totalRequests: number;
    approvedRequests: number;
    waitlistedRequests: number;
    deniedRequests: number;
    averageProcessingTime: number;
    errorCount: number;
}

interface ZoneMonitoringResult {
    success: boolean;
    error?: string;
    metrics: Record<string, ZoneMetrics>;
    timestamp: string;
}

/**
 * Collects and reports metrics for zone-based calendar operations
 * This helps monitor the health and usage of the zone calendar system
 */
export async function collectZoneMetrics(): Promise<ZoneMonitoringResult> {
    try {
        const metrics: Record<string, ZoneMetrics> = {};
        const startTime = new Date();
        startTime.setDate(startTime.getDate() - 30); // Last 30 days

        // Get all zones with their divisions
        const { data: zones, error: zoneError } = await supabase
            .from("zones")
            .select("id, name, division_id");

        if (zoneError) throw zoneError;

        // Process each zone
        for (const zone of zones || []) {
            try {
                // Get request statistics
                const { data: requests, error: requestError } = await supabase
                    .from("pld_sdv_requests")
                    .select("status, requested_at, responded_at")
                    .eq("zone_id", zone.id)
                    .gte("requested_at", startTime.toISOString());

                if (requestError) throw requestError;

                // Calculate metrics
                const zoneMetrics: ZoneMetrics = {
                    totalRequests: requests?.length || 0,
                    approvedRequests: requests?.filter((r) =>
                        r.status === "approved"
                    ).length || 0,
                    waitlistedRequests: requests?.filter((r) =>
                        r.status === "waitlisted"
                    ).length || 0,
                    deniedRequests: requests?.filter((r) =>
                        r.status === "denied"
                    ).length || 0,
                    averageProcessingTime: 0,
                    errorCount: 0,
                };

                // Calculate average processing time
                const processingTimes = requests
                    ?.filter((r) => r.responded_at)
                    .map((r) =>
                        new Date(r.responded_at).getTime() -
                        new Date(r.requested_at).getTime()
                    );

                if (processingTimes?.length) {
                    zoneMetrics.averageProcessingTime =
                        processingTimes.reduce((a, b) => a + b, 0) /
                        processingTimes.length;
                }

                // Get error count
                const { count: errorCount, error: errorCountError } =
                    await supabase
                        .from("pld_sdv_requests")
                        .select("id", { count: "exact" })
                        .eq("zone_id", zone.id)
                        .gte("requested_at", startTime.toISOString())
                        .or("status.eq.error,status.eq.failed");

                if (errorCountError) throw errorCountError;
                zoneMetrics.errorCount = errorCount || 0;

                metrics[zone.name] = zoneMetrics;
            } catch (error) {
                console.error(
                    `Error collecting metrics for zone ${zone.name}:`,
                    error,
                );
                metrics[zone.name] = {
                    totalRequests: 0,
                    approvedRequests: 0,
                    waitlistedRequests: 0,
                    deniedRequests: 0,
                    averageProcessingTime: 0,
                    errorCount: 0,
                };
            }
        }

        return {
            success: true,
            metrics,
            timestamp: new Date().toISOString(),
        };
    } catch (error) {
        return {
            success: false,
            error: (error as Error).message,
            metrics: {},
            timestamp: new Date().toISOString(),
        };
    }
}

/**
 * Monitors zone calendar performance and sends alerts if needed
 * This should be run periodically to check for issues
 */
export async function monitorZonePerformance(
    errorThreshold: number = 5,
    processingTimeThreshold: number = 24 * 60 * 60 * 1000, // 24 hours in milliseconds
): Promise<void> {
    try {
        const metrics = await collectZoneMetrics();
        if (!metrics.success) throw new Error(metrics.error);

        const alerts: string[] = [];

        // Check each zone's metrics
        Object.entries(metrics.metrics).forEach(([zoneName, zoneMetrics]) => {
            // Check error rate
            if (zoneMetrics.errorCount >= errorThreshold) {
                alerts.push(
                    `High error rate in zone ${zoneName}: ${zoneMetrics.errorCount} errors in the last 30 days`,
                );
            }

            // Check processing time
            if (zoneMetrics.averageProcessingTime > processingTimeThreshold) {
                const hours = Math.round(
                    zoneMetrics.averageProcessingTime / (60 * 60 * 1000),
                );
                alerts.push(
                    `Slow processing time in zone ${zoneName}: Average ${hours} hours`,
                );
            }

            // Check waitlist ratio
            const waitlistRatio = zoneMetrics.waitlistedRequests /
                zoneMetrics.totalRequests;
            if (waitlistRatio > 0.5) {
                alerts.push(
                    `High waitlist ratio in zone ${zoneName}: ${
                        Math.round(waitlistRatio * 100)
                    }% of requests waitlisted`,
                );
            }
        });

        // Log alerts
        if (alerts.length > 0) {
            console.warn("Zone Calendar Monitoring Alerts:", alerts);
            // Here you would typically send these alerts to your monitoring system
            // For example, sending to Sentry, logging to a monitoring service, etc.
        }
    } catch (error) {
        console.error("Error monitoring zone performance:", error);
        // Here you would typically alert on the monitoring failure itself
    }
}

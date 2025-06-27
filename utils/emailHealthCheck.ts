import { supabase } from "@/utils/supabase";

export interface EmailHealthStatus {
    healthy: boolean;
    recentFailures: number;
    stuckAttempts: number;
    averageResponseTime: number;
    lastSuccessfulEmail: Date | null;
    totalAttempts: number;
    successRatePercent: number;
    issues: string[];
    checkedAt: Date;
    checkPeriodHours: number;
}

export interface EmailHealthReport extends EmailHealthStatus {
    recentAttempts: EmailAttemptSummary[];
    failureBreakdown: FailureBreakdown;
    trends: HealthTrends;
}

interface EmailAttemptSummary {
    id: number;
    requestId: string | null;
    emailType: string;
    attemptStatus: string;
    functionName: string | null;
    appComponent: string | null;
    attemptedAt: Date;
    completedAt: Date | null;
    errorMessage: string | null;
}

interface FailureBreakdown {
    byEmailType: Record<string, number>;
    byComponent: Record<string, number>;
    byStatus: Record<string, number>;
}

interface HealthTrends {
    hourlyAttempts: Array<{ hour: string; attempts: number; failures: number }>;
    successRateHistory: Array<{ period: string; successRate: number }>;
}

/**
 * Check email system health using the database function
 */
export async function checkEmailHealth(
    hours: number = 1,
): Promise<EmailHealthStatus | null> {
    console.log(
        `[EmailHealthCheck] Checking email health for last ${hours} hours`,
    );

    try {
        const { data, error } = await supabase.rpc("check_email_health", {
            check_hours: hours,
        });

        if (error) {
            console.error("[EmailHealthCheck] Database error:", error);
            return null;
        }

        if (!data) {
            console.warn(
                "[EmailHealthCheck] No data returned from health check",
            );
            return null;
        }

        // Parse the JSON response
        const healthData = typeof data === "string" ? JSON.parse(data) : data;

        const result: EmailHealthStatus = {
            healthy: healthData.healthy,
            recentFailures: healthData.recent_failures,
            stuckAttempts: healthData.stuck_attempts,
            averageResponseTime: healthData.average_response_time_ms,
            lastSuccessfulEmail: healthData.last_successful_email
                ? new Date(healthData.last_successful_email)
                : null,
            totalAttempts: healthData.total_attempts,
            successRatePercent: healthData.success_rate_percent,
            issues: healthData.issues || [],
            checkedAt: new Date(healthData.checked_at),
            checkPeriodHours: healthData.check_period_hours,
        };

        console.log(
            `[EmailHealthCheck] Health status: ${
                result.healthy ? "HEALTHY" : "UNHEALTHY"
            }, failures: ${result.recentFailures}, success rate: ${result.successRatePercent}%`,
        );

        return result;
    } catch (error) {
        console.error("[EmailHealthCheck] Unexpected error:", error);
        return null;
    }
}

/**
 * Get comprehensive email health report with detailed breakdown
 */
export async function getEmailHealthReport(
    hours: number = 24,
): Promise<EmailHealthReport | null> {
    console.log(
        `[EmailHealthCheck] Generating comprehensive health report for last ${hours} hours`,
    );

    try {
        // Get basic health status
        const healthStatus = await checkEmailHealth(hours);
        if (!healthStatus) {
            return null;
        }

        // Get recent attempts for detailed analysis
        const { data: recentAttempts, error: attemptsError } = await supabase
            .from("email_attempt_log")
            .select("*")
            .gte(
                "attempted_at",
                new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
            )
            .order("attempted_at", { ascending: false })
            .limit(100);

        if (attemptsError) {
            console.error(
                "[EmailHealthCheck] Error fetching recent attempts:",
                attemptsError,
            );
            return null;
        }

        // Process attempts into summary
        const attemptSummaries: EmailAttemptSummary[] = (recentAttempts || [])
            .map((attempt) => ({
                id: attempt.id,
                requestId: attempt.request_id,
                emailType: attempt.email_type,
                attemptStatus: attempt.attempt_status,
                functionName: attempt.function_name,
                appComponent: attempt.app_component,
                attemptedAt: new Date(attempt.attempted_at),
                completedAt: attempt.completed_at
                    ? new Date(attempt.completed_at)
                    : null,
                errorMessage: attempt.error_message,
            }));

        // Calculate failure breakdown
        const failureBreakdown: FailureBreakdown = {
            byEmailType: {},
            byComponent: {},
            byStatus: {},
        };

        attemptSummaries.forEach((attempt) => {
            // Count by email type
            failureBreakdown.byEmailType[attempt.emailType] =
                (failureBreakdown.byEmailType[attempt.emailType] || 0) + 1;

            // Count by component
            if (attempt.appComponent) {
                failureBreakdown.byComponent[attempt.appComponent] =
                    (failureBreakdown.byComponent[attempt.appComponent] || 0) +
                    1;
            }

            // Count by status
            failureBreakdown.byStatus[attempt.attemptStatus] =
                (failureBreakdown.byStatus[attempt.attemptStatus] || 0) + 1;
        });

        // Get hourly trends (simplified for now)
        const trends: HealthTrends = {
            hourlyAttempts: [], // TODO: Implement hourly aggregation
            successRateHistory: [], // TODO: Implement historical success rates
        };

        const report: EmailHealthReport = {
            ...healthStatus,
            recentAttempts: attemptSummaries,
            failureBreakdown,
            trends,
        };

        console.log(
            `[EmailHealthCheck] Generated comprehensive report with ${attemptSummaries.length} recent attempts`,
        );

        return report;
    } catch (error) {
        console.error(
            "[EmailHealthCheck] Error generating health report:",
            error,
        );
        return null;
    }
}

/**
 * Enhanced error categorization for better diagnostics
 */
export function categorizeEmailError(
    errorMessage: string | null,
    attemptStatus: string,
): {
    category: "network" | "timeout" | "validation" | "server" | "unknown";
    severity: "low" | "medium" | "high";
    retryable: boolean;
} {
    if (!errorMessage && attemptStatus === "function_failed") {
        return {
            category: "server",
            severity: "high",
            retryable: true,
        };
    }

    if (!errorMessage) {
        return {
            category: "unknown",
            severity: "medium",
            retryable: true,
        };
    }

    const message = errorMessage.toLowerCase();

    // Network errors
    if (
        message.includes("network") || message.includes("connection") ||
        message.includes("timeout")
    ) {
        return {
            category: "network",
            severity: "medium",
            retryable: true,
        };
    }

    // Timeout errors
    if (message.includes("timeout") || message.includes("timed out")) {
        return {
            category: "timeout",
            severity: "medium",
            retryable: true,
        };
    }

    // Validation errors
    if (
        message.includes("invalid") || message.includes("missing") ||
        message.includes("required")
    ) {
        return {
            category: "validation",
            severity: "low",
            retryable: false,
        };
    }

    // Server errors
    if (
        message.includes("500") || message.includes("internal") ||
        message.includes("server error")
    ) {
        return {
            category: "server",
            severity: "high",
            retryable: true,
        };
    }

    return {
        category: "unknown",
        severity: "medium",
        retryable: true,
    };
}

/**
 * Check if email system should be considered unhealthy based on recent patterns
 */
export function assessEmailSystemHealth(attempts: EmailAttemptSummary[]): {
    isHealthy: boolean;
    concerns: string[];
    recommendations: string[];
} {
    const concerns: string[] = [];
    const recommendations: string[] = [];

    if (attempts.length === 0) {
        return {
            isHealthy: true,
            concerns: [],
            recommendations: [],
        };
    }

    // Calculate failure rates
    const failedAttempts =
        attempts.filter((a) =>
            a.attemptStatus === "function_failed" ||
            a.attemptStatus === "email_failed"
        ).length;
    const failureRate = (failedAttempts / attempts.length) * 100;

    // Check for high failure rate
    if (failureRate > 15) {
        concerns.push(`High failure rate: ${failureRate.toFixed(1)}%`);
        recommendations.push(
            "Investigate network connectivity and edge function health",
        );
    }

    // Check for stuck attempts
    const stuckAttempts =
        attempts.filter((a) =>
            a.attemptStatus === "initiated" &&
            Date.now() - a.attemptedAt.getTime() > 10 * 60 * 1000 // 10 minutes
        ).length;

    if (stuckAttempts > 0) {
        concerns.push(`${stuckAttempts} stuck attempts detected`);
        recommendations.push(
            "Check edge function execution and database connectivity",
        );
    }

    // Check for slow response times
    const completedAttempts = attempts.filter((a) => a.completedAt);
    if (completedAttempts.length > 0) {
        const avgResponseTime = completedAttempts.reduce((sum, attempt) => {
            return sum +
                (attempt.completedAt!.getTime() -
                    attempt.attemptedAt.getTime());
        }, 0) / completedAttempts.length;

        if (avgResponseTime > 30000) { // 30 seconds
            concerns.push(
                `Slow average response time: ${
                    (avgResponseTime / 1000).toFixed(1)
                }s`,
            );
            recommendations.push(
                "Consider optimizing edge function performance or email service configuration",
            );
        }
    }

    const isHealthy = concerns.length === 0;

    return {
        isHealthy,
        concerns,
        recommendations,
    };
}

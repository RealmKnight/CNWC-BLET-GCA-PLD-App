import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

interface SMSCostStats {
    dailyCost: number;
    weeklyCost: number;
    monthlyCost: number;
    dailyCount: number;
    weeklyCount: number;
    monthlyCount: number;
    topUsers: Array<
        { name: string; count: number; cost: number; userId: string }
    >;
    budgetStatus: {
        dailyBudget: number;
        monthlyBudget: number;
        dailySpent: number;
        monthlySpent: number;
        dailyPercentUsed: number;
        monthlyPercentUsed: number;
    };
    divisionBreakdown: Array<{ division: string; count: number; cost: number }>;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Initialize Supabase client
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
            { auth: { autoRefreshToken: false, persistSession: false } },
        );

        // Get date ranges
        const now = new Date();
        const today = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
        );
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        // Get daily stats
        const { data: dailyDeliveries, error: dailyError } = await supabaseAdmin
            .from("sms_deliveries")
            .select("cost_amount, recipient_id")
            .eq("status", "sent")
            .gte("sent_at", today.toISOString());

        if (dailyError) {
            console.error("Error fetching daily SMS stats:", dailyError);
        }

        const dailyCost = dailyDeliveries?.reduce((sum, d) =>
            sum + Math.abs(d.cost_amount || 0), 0) || 0;
        const dailyCount = dailyDeliveries?.length || 0;

        // Get weekly stats
        const { data: weeklyDeliveries, error: weeklyError } =
            await supabaseAdmin
                .from("sms_deliveries")
                .select("cost_amount, recipient_id")
                .eq("status", "sent")
                .gte("sent_at", weekAgo.toISOString());

        if (weeklyError) {
            console.error("Error fetching weekly SMS stats:", weeklyError);
        }

        const weeklyCost = weeklyDeliveries?.reduce((sum, d) =>
            sum + Math.abs(d.cost_amount || 0), 0) || 0;
        const weeklyCount = weeklyDeliveries?.length || 0;

        // Get monthly stats
        const { data: monthlyDeliveries, error: monthlyError } =
            await supabaseAdmin
                .from("sms_deliveries")
                .select("cost_amount, recipient_id")
                .eq("status", "sent")
                .gte("sent_at", monthStart.toISOString());

        if (monthlyError) {
            console.error("Error fetching monthly SMS stats:", monthlyError);
        }

        const monthlyCost = monthlyDeliveries?.reduce((sum, d) =>
            sum + Math.abs(d.cost_amount || 0), 0) || 0;
        const monthlyCount = monthlyDeliveries?.length || 0;

        // Get top users for the month
        const userStats = new Map<string, { count: number; cost: number }>();

        monthlyDeliveries?.forEach((delivery) => {
            const userId = delivery.recipient_id;
            const cost = Math.abs(delivery.cost_amount || 0);

            if (userStats.has(userId)) {
                const existing = userStats.get(userId)!;
                existing.count += 1;
                existing.cost += cost;
            } else {
                userStats.set(userId, { count: 1, cost });
            }
        });

        // Get user names for top users
        const topUserIds = Array.from(userStats.entries())
            .sort((a, b) =>
                b[1].count - a[1].count
            )
            .slice(0, 10)
            .map(([userId]) =>
                userId
            );

        const { data: topUserDetails, error: userError } = await supabaseAdmin
            .from("members")
            .select("id, first_name, last_name")
            .in("id", topUserIds);

        if (userError) {
            console.error("Error fetching user details:", userError);
        }

        const topUsers = topUserIds.map((userId) => {
            const stats = userStats.get(userId)!;
            const user = topUserDetails?.find((u) =>
                u.id === userId
            );
            return {
                userId,
                name: user
                    ? `${user.first_name} ${user.last_name}`
                    : "Unknown User",
                count: stats.count,
                cost: stats.cost,
            };
        });

        // Get budget status
        const { data: budget, error: budgetError } = await supabaseAdmin
            .from("organization_sms_budget")
            .select("*")
            .single();

        let budgetStatus = {
            dailyBudget: 100,
            monthlyBudget: 2000,
            dailySpent: dailyCost,
            monthlySpent: monthlyCost,
            dailyPercentUsed: 0,
            monthlyPercentUsed: 0,
        };

        if (!budgetError && budget) {
            budgetStatus = {
                dailyBudget: budget.daily_budget || 100,
                monthlyBudget: budget.monthly_budget || 2000,
                dailySpent: budget.current_daily_spend || dailyCost,
                monthlySpent: budget.current_monthly_spend || monthlyCost,
                dailyPercentUsed: ((budget.current_daily_spend || dailyCost) /
                    (budget.daily_budget || 100)) * 100,
                monthlyPercentUsed:
                    ((budget.current_monthly_spend || monthlyCost) /
                        (budget.monthly_budget || 2000)) * 100,
            };
        }

        // Get division breakdown
        const { data: divisionStats, error: divisionError } =
            await supabaseAdmin
                .from("sms_cost_analytics")
                .select("division_name, cost_amount, message_count")
                .gte("date_sent", monthStart.toISOString().split("T")[0]);

        let divisionBreakdown: Array<
            { division: string; count: number; cost: number }
        > = [];

        if (!divisionError && divisionStats) {
            const divisionMap = new Map<
                string,
                { count: number; cost: number }
            >();

            divisionStats.forEach((stat) => {
                const division = stat.division_name || "Unknown";
                if (divisionMap.has(division)) {
                    const existing = divisionMap.get(division)!;
                    existing.count += stat.message_count || 0;
                    existing.cost += Math.abs(stat.cost_amount || 0);
                } else {
                    divisionMap.set(division, {
                        count: stat.message_count || 0,
                        cost: Math.abs(stat.cost_amount || 0),
                    });
                }
            });

            divisionBreakdown = Array.from(divisionMap.entries())
                .map(([division, stats]) => ({
                    division,
                    count: stats.count,
                    cost: stats.cost,
                }))
                .sort((a, b) =>
                    b.cost - a.cost
                );
        }

        const stats: SMSCostStats = {
            dailyCost,
            weeklyCost,
            monthlyCost,
            dailyCount,
            weeklyCount,
            monthlyCount,
            topUsers,
            budgetStatus,
            divisionBreakdown,
        };

        return new Response(
            JSON.stringify(stats),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            },
        );
    } catch (error) {
        console.error("SMS cost stats error:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            },
        );
    }
});

/* eslint-disable no-restricted-syntax */
import { supabase } from "./supabase";
import Toast from "react-native-toast-message";
import { refreshSessionIfNeeded } from "./supabase";
import { onReachabilityChange } from "./connectivity";

/**
 * guard wrapper that ensures token is valid before creating channel.
 */
export async function createRealtimeChannel(name: string) {
    await refreshSessionIfNeeded();
    const channel = supabase.channel(name);
    attachErrorHandlers(channel);
    return channel;
}

/**
 * Adds the generic reconnection / toast handlers to a Realtime channel.
 */
export function attachErrorHandlers(channel: any) {
    let reconnectingToastId: string | null = null;

    channel
        .on("error", async (event: any) => {
            const msg = event?.message || "";
            if (msg.includes("InvalidJWTToken")) {
                // show toast once
                if (!reconnectingToastId) {
                    Toast.show({
                        type: "info",
                        text1: "Reconnecting…",
                        text2: "Restoring real-time updates",
                    });
                    reconnectingToastId = "shown";
                }
                try {
                    await refreshSessionIfNeeded();
                    await channel.resubscribe();
                } catch (e) {
                    console.warn(
                        "[realtime] resubscribe after token refresh failed",
                        e,
                    );
                }
            }
        })
        .on("SUBSCRIBED", () => {
            if (reconnectingToastId) {
                Toast.hide();
                reconnectingToastId = null;
            }
        });

    // network reachability
    onReachabilityChange(async (online) => {
        if (online && channel.state !== "joined") {
            try {
                await refreshSessionIfNeeded();
                await channel.resubscribe();
            } catch (e) {
                console.error(
                    "[realtime] resubscribe on network online failed",
                    e,
                );
            }
        }
    });
}

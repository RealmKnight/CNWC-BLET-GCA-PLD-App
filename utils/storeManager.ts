/**
 * Store Event Manager - Observer pattern-based inter-store communication
 *
 * Provides a singleton event system for stores to communicate without direct imports.
 * Uses selective debouncing to prevent race conditions while maintaining responsiveness.
 * Compatible with React Native Android (no EventTarget dependency).
 *
 * Usage:
 *   import { storeEventManager, StoreEventType } from '@/utils/storeManager';
 *
 *   // Emit an event
 *   storeEventManager.emitEvent(StoreEventType.CALENDAR_DATA_UPDATED, {
 *     source: 'calendarStore',
 *     payload: { dateRange: { startDate: '2024-01-01', endDate: '2024-01-31' } }
 *   });
 *
 *   // Listen for events
 *   const cleanup = storeEventManager.addStoreEventListener(
 *     StoreEventType.TIME_DATA_UPDATED,
 *     (data) => {
 *       // Handle the event
 *     }
 *   );
 *
 *   // Clean up when done
 *   cleanup();
 */

import { Platform } from "react-native";

/**
 * Store event types for inter-store communication
 */
export enum StoreEventType {
    // Calendar-related events (debounced)
    CALENDAR_DATA_UPDATED = "CALENDAR_DATA_UPDATED",
    CALENDAR_REQUESTS_UPDATED = "CALENDAR_REQUESTS_UPDATED",
    CALENDAR_ALLOTMENTS_UPDATED = "CALENDAR_ALLOTMENTS_UPDATED",
    SIX_MONTH_REQUESTS_UPDATED = "SIX_MONTH_REQUESTS_UPDATED",

    // Time store events (debounced for data, immediate for user actions)
    TIME_DATA_UPDATED = "TIME_DATA_UPDATED",
    TIME_STATS_UPDATED = "TIME_STATS_UPDATED",

    // User action events (immediate - no debouncing)
    REQUEST_SUBMITTED = "REQUEST_SUBMITTED",
    REQUEST_CANCELLED = "REQUEST_CANCELLED",
    SIX_MONTH_REQUEST_SUBMITTED = "SIX_MONTH_REQUEST_SUBMITTED",
    SIX_MONTH_REQUEST_CANCELLED = "SIX_MONTH_REQUEST_CANCELLED",
    PAID_IN_LIEU_REQUESTED = "PAID_IN_LIEU_REQUESTED",

    // Realtime events (immediate)
    REALTIME_UPDATE_RECEIVED = "REALTIME_UPDATE_RECEIVED",
}

/**
 * Payload structure for store events
 */
export interface StoreEventData {
    type: StoreEventType;
    timestamp: number;
    source: string; // Which store emitted it
    payload: {
        // General data
        memberId?: string;
        calendarId?: string;

        // Date-related data
        requestDate?: string;
        dateRange?: { startDate: string; endDate: string };
        affectedDates?: string[];

        // Request-related data
        requestId?: string;
        requestType?: "PLD" | "SDV";
        leaveType?: "PLD" | "SDV";
        isPaidInLieu?: boolean;
        requestStatus?: string;

        // Six-month request specific
        isSixMonthRequest?: boolean;

        // Performance optimization data
        updateType?:
            | "full_refresh"
            | "partial_update"
            | "single_item"
            | "realtime_update";
        shouldRefreshTimeStore?: boolean;
        shouldRefreshCalendarStore?: boolean;

        // Realtime-specific data
        realtimeEventType?: "INSERT" | "UPDATE" | "DELETE";
        realtimeTable?: string;
        realtimePayload?: any;

        // Additional context
        triggerSource?:
            | "user_action"
            | "realtime"
            | "periodic_refresh"
            | "initialization";

        // Error information
        error?: string;
    };
}

/**
 * Event listener function type
 */
export type StoreEventListener = (data: StoreEventData) => void;

/**
 * Event manager class using observer pattern (React Native compatible)
 */
class StoreEventManager {
    private listeners = new Map<StoreEventType, Set<StoreEventListener>>();
    private debounceTimers = new Map<string, NodeJS.Timeout>();
    private isDebugMode: boolean;

    constructor() {
        this.isDebugMode = __DEV__ && Platform.OS !== "web"; // Enable debug logging in development
    }

    /**
     * Emit a store event with selective debouncing
     *
     * @param eventType - The type of event to emit
     * @param data - Event data (excluding type and timestamp)
     */
    emitEvent(
        eventType: StoreEventType,
        data: Omit<StoreEventData, "type" | "timestamp">,
    ) {
        const shouldDebounce = this.shouldDebounceEvent(eventType);
        const delay = shouldDebounce ? 200 : 0; // 200ms for data updates, immediate for user actions

        const eventData: StoreEventData = {
            type: eventType,
            timestamp: Date.now(),
            ...data,
        };

        if (this.isDebugMode) {
            console.log(
                `[StoreEventManager] Emitting ${eventType}${
                    shouldDebounce ? " (debounced)" : " (immediate)"
                }:`,
                {
                    source: data.source,
                    payload: data.payload,
                    delay,
                },
            );
        }

        if (delay > 0) {
            // Debounced execution
            const debounceKey = `${eventType}-${data.source}`;

            if (this.debounceTimers.has(debounceKey)) {
                clearTimeout(this.debounceTimers.get(debounceKey)!);
            }

            const timer = setTimeout(() => {
                this.debounceTimers.delete(debounceKey);
                this.notifyListeners(eventType, eventData);
            }, delay);

            this.debounceTimers.set(debounceKey, timer);
        } else {
            // Immediate execution
            this.notifyListeners(eventType, eventData);
        }
    }

    /**
     * Determine if an event should be debounced
     */
    private shouldDebounceEvent(eventType: StoreEventType): boolean {
        const debouncedEvents = [
            StoreEventType.CALENDAR_DATA_UPDATED,
            StoreEventType.CALENDAR_REQUESTS_UPDATED,
            StoreEventType.CALENDAR_ALLOTMENTS_UPDATED,
            StoreEventType.TIME_DATA_UPDATED,
            StoreEventType.TIME_STATS_UPDATED,
        ];

        return debouncedEvents.includes(eventType);
    }

    /**
     * Notify all listeners for a specific event type
     */
    private notifyListeners(
        eventType: StoreEventType,
        eventData: StoreEventData,
    ) {
        if (this.isDebugMode) {
            console.log(
                `[StoreEventManager] Notifying listeners for ${eventType}:`,
                eventData,
            );
        }

        const eventListeners = this.listeners.get(eventType);
        if (eventListeners) {
            eventListeners.forEach((listener) => {
                try {
                    listener(eventData);
                } catch (error) {
                    console.error(
                        `[StoreEventManager] Error in event listener for ${eventType}:`,
                        error,
                    );
                }
            });
        }
    }

    /**
     * Add an event listener for a specific event type
     *
     * @param eventType - The event type to listen for
     * @param listener - The listener function
     * @returns Cleanup function to remove the listener
     */
    addStoreEventListener(
        eventType: StoreEventType,
        listener: StoreEventListener,
    ): () => void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }

        const eventListeners = this.listeners.get(eventType)!;
        eventListeners.add(listener);

        if (this.isDebugMode) {
            console.log(
                `[StoreEventManager] Added listener for ${eventType}. Total listeners: ${eventListeners.size}`,
            );
        }

        // Return cleanup function
        return () => {
            this.removeStoreEventListener(eventType, listener);
        };
    }

    /**
     * Remove an event listener for a specific event type
     *
     * @param eventType - The event type
     * @param listener - The listener function to remove
     */
    removeStoreEventListener(
        eventType: StoreEventType,
        listener: StoreEventListener,
    ) {
        const eventListeners = this.listeners.get(eventType);
        if (eventListeners) {
            eventListeners.delete(listener);

            if (this.isDebugMode) {
                console.log(
                    `[StoreEventManager] Removed listener for ${eventType}. Remaining listeners: ${eventListeners.size}`,
                );
            }

            // Clean up empty sets
            if (eventListeners.size === 0) {
                this.listeners.delete(eventType);
            }
        }
    }

    /**
     * Clean up all listeners and timers
     */
    cleanup() {
        if (this.isDebugMode) {
            console.log(
                "[StoreEventManager] Cleaning up all listeners and timers",
            );
        }

        // Clear all debounce timers
        this.debounceTimers.forEach((timer) => clearTimeout(timer));
        this.debounceTimers.clear();

        // Clear all listeners
        this.listeners.clear();
    }

    /**
     * Get debug information about current state
     */
    getDebugInfo() {
        return {
            listenerCounts: Array.from(this.listeners.entries()).map((
                [type, listeners],
            ) => ({
                eventType: type,
                listenerCount: listeners.size,
            })),
            activeTimers: this.debounceTimers.size,
            isDebugMode: this.isDebugMode,
        };
    }
}

// Singleton instance
const storeEventManager = new StoreEventManager();

/**
 * Helper function to create cleanup for multiple event listeners
 */
export function createStoreEventCleanup(
    listeners: Array<{
        eventType: StoreEventType;
        listener: StoreEventListener;
    }>,
) {
    const cleanupFunctions = listeners.map(({ eventType, listener }) =>
        storeEventManager.addStoreEventListener(eventType, listener)
    );

    return () => {
        cleanupFunctions.forEach((cleanup) => cleanup());
    };
}

// Helper functions for common event emissions
export function emitCalendarDataUpdate(
    source: string,
    payload: {
        dateRange?: { startDate: string; endDate: string };
        affectedDates?: string[];
        calendarId?: string;
        updateType?: "full_refresh" | "partial_update" | "single_item";
        shouldRefreshTimeStore?: boolean;
    },
) {
    storeEventManager.emitEvent(StoreEventType.CALENDAR_DATA_UPDATED, {
        source,
        payload,
    });
}

export function emitTimeDataUpdate(
    source: string,
    payload: {
        memberId?: string;
        updateType?: "full_refresh" | "partial_update" | "single_item";
        shouldRefreshCalendarStore?: boolean;
        affectedDates?: string[];
    },
) {
    storeEventManager.emitEvent(StoreEventType.TIME_DATA_UPDATED, {
        source,
        payload,
    });
}

export function emitRequestSubmitted(
    source: string,
    payload: {
        requestId: string;
        requestDate: string;
        requestType: "PLD" | "SDV";
        memberId: string;
        calendarId?: string;
        isPaidInLieu?: boolean;
        isSixMonthRequest?: boolean;
    },
) {
    storeEventManager.emitEvent(StoreEventType.REQUEST_SUBMITTED, {
        source,
        payload,
    });
}

export function emitRequestCancelled(
    source: string,
    payload: {
        requestId: string;
        requestDate: string;
        requestType: "PLD" | "SDV";
        memberId: string;
        calendarId?: string;
        isSixMonthRequest?: boolean;
    },
) {
    storeEventManager.emitEvent(StoreEventType.REQUEST_CANCELLED, {
        source,
        payload,
    });
}

export { storeEventManager };

/**
 * Store Event Manager - EventTarget-based inter-store communication
 *
 * Provides a singleton event system for stores to communicate without direct imports.
 * Uses selective debouncing to prevent race conditions while maintaining responsiveness.
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
 *   storeEventManager.addEventListener(StoreEventType.TIME_DATA_UPDATED, (event) => {
 *     const data = event.detail as StoreEventData;
 *     // Handle the event
 *   });
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
 * Event manager class using native EventTarget
 */
class StoreEventManager extends EventTarget {
    private debounceTimers = new Map<string, NodeJS.Timeout>();
    private isDebugMode: boolean;

    constructor() {
        super();
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
                this.dispatchTypedEvent(eventType, eventData);
            }, delay);

            this.debounceTimers.set(debounceKey, timer);
        } else {
            // Immediate execution
            this.dispatchTypedEvent(eventType, eventData);
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
     * Dispatch the actual CustomEvent
     */
    private dispatchTypedEvent(
        eventType: StoreEventType,
        eventData: StoreEventData,
    ) {
        if (this.isDebugMode) {
            console.log(
                `[StoreEventManager] Dispatching ${eventType}:`,
                eventData,
            );
        }

        const customEvent = new CustomEvent(eventType, {
            detail: eventData,
        });

        this.dispatchEvent(customEvent);
    }

    /**
     * Add a typed event listener
     */
    addStoreEventListener(
        eventType: StoreEventType,
        listener: (event: CustomEvent<StoreEventData>) => void,
        options?: boolean | AddEventListenerOptions,
    ) {
        super.addEventListener(eventType, listener as EventListener, options);

        if (this.isDebugMode) {
            console.log(`[StoreEventManager] Added listener for ${eventType}`);
        }
    }

    /**
     * Remove a typed event listener
     */
    removeStoreEventListener(
        eventType: StoreEventType,
        listener: (event: CustomEvent<StoreEventData>) => void,
        options?: boolean | EventListenerOptions,
    ) {
        super.removeEventListener(
            eventType,
            listener as EventListener,
            options,
        );

        if (this.isDebugMode) {
            console.log(
                `[StoreEventManager] Removed listener for ${eventType}`,
            );
        }
    }

    /**
     * Clean up all debounce timers and event listeners
     */
    cleanup() {
        if (this.isDebugMode) {
            console.log(
                `[StoreEventManager] Cleaning up ${this.debounceTimers.size} debounce timers`,
            );
        }

        // Clear all debounce timers
        this.debounceTimers.forEach((timer) => clearTimeout(timer));
        this.debounceTimers.clear();

        // Note: We don't remove all event listeners here as that would break store functionality
        // Individual stores should clean up their own listeners when they unmount
    }

    /**
     * Get debug information about the event manager state
     */
    getDebugInfo() {
        return {
            activeDebounceTimers: this.debounceTimers.size,
            isDebugMode: this.isDebugMode,
            supportedEvents: Object.values(StoreEventType),
        };
    }
}

// Singleton instance for global use
export const storeEventManager = new StoreEventManager();

/**
 * Utility function to create a cleanup function for store event listeners
 */
export function createStoreEventCleanup(
    listeners: Array<{
        eventType: StoreEventType;
        listener: (event: CustomEvent<StoreEventData>) => void;
    }>,
) {
    return () => {
        listeners.forEach(({ eventType, listener }) => {
            storeEventManager.removeStoreEventListener(eventType, listener);
        });
    };
}

/**
 * Helper to emit calendar data update events
 */
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

/**
 * Helper to emit time data update events
 */
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

/**
 * Helper to emit request submission events (immediate)
 */
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
    const eventType = payload.isSixMonthRequest
        ? StoreEventType.SIX_MONTH_REQUEST_SUBMITTED
        : StoreEventType.REQUEST_SUBMITTED;

    storeEventManager.emitEvent(eventType, {
        source,
        payload,
    });
}

/**
 * Helper to emit request cancellation events (immediate)
 */
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
    const eventType = payload.isSixMonthRequest
        ? StoreEventType.SIX_MONTH_REQUEST_CANCELLED
        : StoreEventType.REQUEST_CANCELLED;

    storeEventManager.emitEvent(eventType, {
        source,
        payload,
    });
}

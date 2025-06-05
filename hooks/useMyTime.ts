import {
  TimeOffRequest,
  TimeStats,
  UserVacationRequest,
  useTimeStore,
  VacationStats,
} from "@/store/timeStore";

// Remove all old imports, state, effects, functions, constants, cache logic...
// The entire content from the original file is replaced by this simplified version.

export function useMyTime() {
  // Select state slices from the store
  const timeStats = useTimeStore((state) => state.timeStats);
  const vacationStats = useTimeStore((state) => state.vacationStats);
  const timeOffRequests = useTimeStore((state) => state.timeOffRequests);
  const vacationRequests = useTimeStore((state) => state.vacationRequests);
  const isLoading = useTimeStore((state) => state.isLoading);
  const error = useTimeStore((state) => state.error);
  const isSubmittingAction = useTimeStore((state) => state.isSubmittingAction);
  const isInitialized = useTimeStore((state) => state.isInitialized); // Expose initialization status if needed
  const lastRefreshed = useTimeStore((state) => state.lastRefreshed);
  const isSubscribing = useTimeStore((state) => state.isSubscribing);

  // Select actions from the store
  const initialize = useTimeStore((state) => state.initialize);
  const cleanup = useTimeStore((state) => state.cleanup);
  const refreshAll = useTimeStore((state) => state.refreshAll);
  const requestPaidInLieu = useTimeStore((state) => state.requestPaidInLieu);
  const cancelRequest = useTimeStore((state) => state.cancelRequest);
  const cancelSixMonthRequest = useTimeStore((state) =>
    state.cancelSixMonthRequest
  );
  const submitRequest = useTimeStore((state) => state.submitRequest);
  const submitSixMonthRequest = useTimeStore((state) =>
    state.submitSixMonthRequest
  );
  const clearError = useTimeStore((state) => state.clearError);

  // Return the selected state and actions
  // Note: The structure should align with what consuming components expect,
  //       adjust property names if necessary based on previous usage.
  //       Removed 'sixMonthRequests' as it's now part of 'timeOffRequests'.
  //       Removed 'invalidateCache' as caching is internal to the store now.
  //       Removed 'syncStatus' as individual flags like isLoading/error cover it.
  return {
    // State
    timeStats,
    vacationStats,
    timeOffRequests,
    vacationRequests,
    isLoading,
    isRefreshing: isLoading, // Map isLoading to isRefreshing if components use that name
    error,
    isInitialized,
    isSubmittingAction, // Pass the simplified submitting flag
    isSubscribing,
    lastRefreshed,

    // Actions
    initialize, // Expose if direct initialization from component is ever needed (unlikely)
    refreshData: refreshAll, // Map refreshAll to refreshData if components use that name
    requestPaidInLieu,
    cancelRequest,
    cancelSixMonthRequest,
    submitRequest,
    submitSixMonthRequest,
    clearError,
    // cleanup, // Usually not exposed to components, handled by AuthProvider
  };
}

// No other exports should remain from the old file.

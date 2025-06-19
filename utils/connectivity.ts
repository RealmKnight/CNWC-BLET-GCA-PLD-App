import { Platform } from "react-native";

// Cross-platform online/offline listener.
// On React-Native we rely on @react-native-community/netinfo; on web we use DOM events.

export type ConnectivityCallback = (isOnline: boolean) => void;

let netInfoUnsubscribe: (() => void) | null = null;
let browserHandlersRegistered = false;

export function onReachabilityChange(cb: ConnectivityCallback) {
    if (Platform.OS !== "web") {
        // Lazy-require to avoid package on web
        const NetInfo = require("@react-native-community/netinfo").default;
        const unsubscribe = NetInfo.addEventListener((state: any) => {
            cb(!!state.isConnected);
        });
        netInfoUnsubscribe = unsubscribe;
    } else {
        if (!browserHandlersRegistered) {
            window.addEventListener("online", () => cb(true));
            window.addEventListener("offline", () => cb(false));
            browserHandlersRegistered = true;
            // fire initial state
            cb(navigator.onLine);
        }
    }

    return () => {
        if (netInfoUnsubscribe) {
            netInfoUnsubscribe();
            netInfoUnsubscribe = null;
        }
        if (browserHandlersRegistered) {
            window.removeEventListener("online", () => cb(true));
            window.removeEventListener("offline", () => cb(false));
            browserHandlersRegistered = false;
        }
    };
}

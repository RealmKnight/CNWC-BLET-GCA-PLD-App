import { LogBox } from "react-native";
import { suppressCloudflareWarnings } from "./utils/errorSuppression";

// Suppress findDOMNode warning in development
if (__DEV__) {
  LogBox.ignoreLogs(["findDOMNode is deprecated in StrictMode"]);
}

// Initialize Cloudflare warning suppression for web platform
suppressCloudflareWarnings();

// ... existing code ...

import { LogBox } from "react-native";

// Suppress findDOMNode warning in development
if (__DEV__) {
  LogBox.ignoreLogs(["findDOMNode is deprecated in StrictMode"]);
}

// ... existing code ...

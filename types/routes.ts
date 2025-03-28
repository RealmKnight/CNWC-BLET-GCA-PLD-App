// Define the app's route structure
declare global {
  namespace ReactNavigation {
    interface RootParamList {
      // Auth Routes
      "/(auth)/sign-in": undefined;
      "/(auth)/sign-up": undefined;
      "/(auth)/reset-password": undefined;
      "/(auth)/member-association": undefined;
      // Admin Routes
      "/(admin)/application_admin": undefined;
      "/(admin)/union_admin": undefined;
      "/(admin)/division_admin": undefined;
      // Company Admin Routes
      "/(company-admin)/index": undefined;
      // Tab Routes
      "/(tabs)/index": undefined;
      "/(tabs)/notifications": undefined;
      "/(tabs)/calendar": undefined;
      "/(tabs)/mytime": undefined;
      "/(tabs)/profile": undefined;
    }
  }
}

// Export an empty object to make this a module
export {};

// Type for href prop in Link component
export type AppRoutes = keyof ReactNavigation.RootParamList;

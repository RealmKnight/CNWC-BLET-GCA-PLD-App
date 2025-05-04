# PLD Cross-Platform Application

A comprehensive cross-platform application built for both mobile (Android, iOS) and web platforms using Expo and React Native.

## Technology Stack

- **Frontend**: React Native, Expo, TypeScript
- **Navigation**: Expo Router with file-based routing
- **State Management**: Zustand with Supabase realtime sync
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Styling**: Styled components inspired by shadcn/ui
- **Testing**: Jest, React Native Testing Library

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI
- Android Studio (for Android development)
- Xcode (for iOS development)

### Installation

1. Clone the repository

```bash
git clone [repository-url]
cd pld-app-cnwc-gca-blet
```

2. Install dependencies

```bash
npm install
```

3. Set up environment variables

```bash
cp .env.example .env
# Add your Supabase URL and anon key to .env
```

4. Run the development server

```bash
npx expo start
```

### Available Scripts

- `npx expo start` - Start the development server
- `npm run android` - Start the app on Android
- `npm run ios` - Start the app on iOS
- `npm run web` - Start the app in web browser
- `npm test` - Run tests

## Project Structure

```
pld-app-cnwc-gca-blet/
├── app/                 # Main application code with file-based routing
│   ├── (admin)/         # Admin-related screens and functionality
│   ├── (auth)/          # Authentication flows
│   ├── (claims)/        # Claims management features
│   └── ...              # Other app sections
├── components/          # Reusable UI components
│   ├── admin/           # Admin-specific components
│   ├── modals/          # Modal components
│   └── ui/              # Common UI components
├── store/               # Zustand stores for state management
├── hooks/               # Custom React hooks
├── utils/               # Utility functions
├── types/               # TypeScript type definitions
└── assets/              # Static assets (images, fonts, sounds)
```

## Development Guidelines

- **TypeScript**: Use strict TypeScript for all code; prefer interfaces over types
- **Components**: Create functional components with TypeScript interfaces
- **State Management**: Use Zustand for local state and Supabase for realtime data sync
- **Styling**: Implement responsive design with Flexbox and React Native's styling system
- **Navigation**: Leverage Expo Router's file-based routing system
- **Performance**: Optimize rendering with useMemo and useCallback where appropriate
- **Testing**: Write unit tests for critical functionality using Jest

## Deployment

### Mobile (Android/iOS)

1. Configure app.json with appropriate settings
2. Build the application:

```bash
eas build --platform android
eas build --platform ios
```

3. Submit to app stores:

```bash
eas submit --platform android
eas submit --platform ios
```

### Web

1. Build the web version:

```bash
npx expo export:web
```

2. Deploy the `web-build` directory to your hosting provider of choice

## Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [Supabase Documentation](https://supabase.com/docs/)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)

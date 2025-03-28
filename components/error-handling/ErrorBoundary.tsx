import React from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { errorLogger } from "../../lib/errors/logger";
import { router } from "expo-router";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    errorLogger.log(error);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    // Reset to home screen
    router.replace("/");
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View className="flex-1 items-center justify-center p-4 bg-white dark:bg-gray-900">
          <View className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 max-w-md w-full">
            <Text className="text-lg font-bold text-red-800 dark:text-red-200 mb-2">Oops! Something went wrong</Text>
            {__DEV__ && this.state.error && (
              <Text className="text-sm text-red-600 dark:text-red-300 mb-4">{this.state.error.message}</Text>
            )}
            <Text className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              We apologize for the inconvenience. Please try again or contact support if the problem persists.
            </Text>
            <Pressable className="bg-red-600 dark:bg-red-500 rounded-md py-2 px-4" onPress={this.handleReset}>
              <Text className="text-white text-center font-medium">Try Again</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for wrapping components with error boundary
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: React.ReactNode
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

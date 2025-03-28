import { useCallback } from "react";
import { errorLogger } from "../lib/errors/logger";
import { AppError, NetworkError, ValidationError, AuthError, DatabaseError } from "../lib/errors/types";
import { router } from "expo-router";

interface ErrorHandlerOptions {
  showFallback?: boolean;
  rethrow?: boolean;
  redirect?: string; // Keep it as string for now
}

export function useErrorHandler() {
  const handleError = useCallback(async (error: unknown, options: ErrorHandlerOptions = {}) => {
    const { showFallback = true, rethrow = false, redirect } = options;

    // Convert unknown error to AppError
    let appError: AppError;
    if (error instanceof AppError) {
      appError = error;
    } else if (error instanceof Error) {
      appError = new AppError(error.message, "UNKNOWN_ERROR", "medium", {
        originalError: error.name,
        stack: error.stack,
      });
    } else {
      appError = new AppError("An unknown error occurred", "UNKNOWN_ERROR", "medium", { originalError: error });
    }

    // Log the error
    errorLogger.log(appError);

    // Handle specific error types
    if (appError instanceof NetworkError) {
      // Handle network errors (e.g., show offline message)
      errorLogger.warn("Network error detected", { code: appError.code });
    } else if (appError instanceof ValidationError) {
      // Handle validation errors (e.g., show form errors)
      errorLogger.warn("Validation error detected", { code: appError.code });
    } else if (appError instanceof AuthError) {
      // Handle auth errors (e.g., redirect to login)
      errorLogger.warn("Auth error detected", { code: appError.code });
      // @ts-ignore - Temporarily ignore type checking for router.replace
      router.replace("/(auth)/login");
      return;
    } else if (appError instanceof DatabaseError) {
      // Handle database errors
      errorLogger.warn("Database error detected", { code: appError.code });
    }

    // Handle redirect if specified
    if (redirect) {
      // @ts-ignore - Temporarily ignore type checking for router.replace
      router.replace(redirect);
      return;
    }

    // Rethrow if specified
    if (rethrow) {
      throw appError;
    }
  }, []);

  const wrapAsync = useCallback(
    <T>(fn: (...args: any[]) => Promise<T>, options: ErrorHandlerOptions = {}): ((...args: any[]) => Promise<T>) => {
      return async (...args: any[]): Promise<T> => {
        try {
          return await fn(...args);
        } catch (error) {
          handleError(error, options);
          throw error; // Re-throw to maintain Promise rejection
        }
      };
    },
    [handleError]
  );

  return {
    handleError,
    wrapAsync,
  };
}

import { AppError } from "./types";
import Constants from "expo-constants";

interface ErrorLogEntry {
  timestamp: string;
  error: {
    name: string;
    message: string;
    code?: string;
    severity?: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
  environment: {
    appVersion: string;
    platform: string;
    isDevelopment: boolean;
  };
}

class ErrorLogger {
  private isDevelopment = __DEV__;

  constructor() {
    // Initialize any error logging service here in the future
  }

  private formatError(error: Error | AppError): ErrorLogEntry {
    const baseError = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: this.isDevelopment ? error.stack : undefined,
      },
      environment: {
        appVersion: Constants.expoConfig?.version ?? "unknown",
        platform: Constants.platform?.web ? "web" : Constants.platform?.ios ? "ios" : "android",
        isDevelopment: this.isDevelopment,
      },
    } as ErrorLogEntry;

    if (error instanceof AppError) {
      baseError.error.code = error.code;
      baseError.error.severity = error.severity;
      baseError.metadata = error.metadata;
    }

    return baseError;
  }

  public log(error: Error | AppError): void {
    const formattedError = this.formatError(error);

    if (this.isDevelopment) {
      console.error("🚨 Error:", formattedError);
    } else {
      // In production, we'll want to send this to a logging service
      // For now, we'll just console.error in a cleaner format
      console.error(`🚨 [${formattedError.error.name}] ${formattedError.error.message}`, formattedError.metadata ?? "");
    }

    // Here we can add additional error reporting services in the future
    // Example: if (sentryEnabled) Sentry.captureException(error);
  }

  public warn(message: string, metadata?: Record<string, unknown>): void {
    if (this.isDevelopment) {
      console.warn("⚠️ Warning:", message, metadata ?? "");
    }
    // Add production warning handling here
  }

  public info(message: string, metadata?: Record<string, unknown>): void {
    if (this.isDevelopment) {
      console.info("ℹ️ Info:", message, metadata ?? "");
    }
    // Add production info logging here
  }
}

export const errorLogger = new ErrorLogger();

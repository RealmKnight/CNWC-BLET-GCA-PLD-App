/**
 * Custom error types for the application
 */

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public severity: "low" | "medium" | "high" | "critical" = "medium",
    public metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthError extends AppError {
  constructor(
    message: string,
    code: string = "AUTH_ERROR",
    severity: "low" | "medium" | "high" | "critical" = "medium",
    metadata?: Record<string, unknown>
  ) {
    super(message, code, severity, metadata);
    this.name = "AuthError";
  }
}

export class NetworkError extends AppError {
  constructor(
    message: string,
    code: string = "NETWORK_ERROR",
    severity: "low" | "medium" | "high" | "critical" = "high",
    metadata?: Record<string, unknown>
  ) {
    super(message, code, severity, metadata);
    this.name = "NetworkError";
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    code: string = "VALIDATION_ERROR",
    severity: "low" | "medium" | "high" | "critical" = "medium",
    metadata?: Record<string, unknown>
  ) {
    super(message, code, severity, metadata);
    this.name = "ValidationError";
  }
}

export class DatabaseError extends AppError {
  constructor(
    message: string,
    code: string = "DATABASE_ERROR",
    severity: "low" | "medium" | "high" | "critical" = "high",
    metadata?: Record<string, unknown>
  ) {
    super(message, code, severity, metadata);
    this.name = "DatabaseError";
  }
}

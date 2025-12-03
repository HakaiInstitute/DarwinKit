/**
 * Error types for consistent error handling
 */

import type { ErrorCode } from "./codes.ts";

// Base error interface that all errors should implement
export interface DarwinKitError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly cause?: Error;
  readonly timestamp: Date;
}

// Error result type for operations that can fail
export interface ErrorResult {
  readonly success: false;
  readonly error: DarwinKitError;
}

// Success result type for operations that can succeed
export interface SuccessResult<T = unknown> {
  readonly success: true;
  readonly data: T;
}

// Union type for operation results
export type Result<T = unknown> = SuccessResult<T> | ErrorResult;

// Utility function types for creating results
export type CreateError = (
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
  cause?: Error,
) => DarwinKitError;
export type CreateSuccess = <T>(data: T) => SuccessResult<T>;
export type CreateFailure = (error: DarwinKitError) => ErrorResult;

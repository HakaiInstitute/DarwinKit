/**
 * Error severity levels and metadata for CLI error presentation
 *
 * Simplified for MVP - focuses on CLI presentation needs
 *
 * Uses Effect's Schema.Enums for a consolidated pattern.
 */

import * as S from "effect/Schema";

/**
 * Error severity enum values
 *
 * @example
 * ```typescript
 * // Discoverable via autocomplete: ErrorSeverities.<ctrl+space>
 * const severity = ErrorSeverities.ERROR;
 *
 * // Or use string literal directly (when type is known)
 * const severity: ErrorSeverity = "error";
 * ```
 */
export const ErrorSeverities = {
  /** Critical failure that prevents operation completion */
  ERROR: "error",
  /** Issue that allows operation to complete but may have problems */
  WARNING: "warning",
  /** General informational message or notice */
  INFO: "info",
} as const;

/**
 * Error severity schema for runtime validation
 */
export const ErrorSeverity = S.Enums(ErrorSeverities);
export type ErrorSeverity = S.Schema.Type<typeof ErrorSeverity>;

/**
 * Get severity label for display
 */
export function getSeverityLabel(severity: ErrorSeverity): string {
  switch (severity) {
    case "error":
      return "Error";
    case "warning":
      return "Warning";
    case "info":
      return "Info";
  }
}

/**
 * Get severity icon for display
 */
export function getSeverityIcon(severity: ErrorSeverity): string {
  switch (severity) {
    case "error":
      return "❌";
    case "warning":
      return "⚠️";
    case "info":
      return "ℹ️";
  }
}

/**
 * Get CLI exit code based on severity
 */
export function getCliExitCode(severity: ErrorSeverity): number {
  switch (severity) {
    case "error":
      return 1;
    case "warning":
      return 2;
    case "info":
      return 0;
  }
}

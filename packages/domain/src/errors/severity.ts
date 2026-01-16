/**
 * Error severity levels and metadata for CLI error presentation
 *
 * Simplified for MVP - focuses on CLI presentation needs
 */

/**
 * Severity of an error or diagnostic message
 *
 * - `error`: Critical failure that prevents operation completion
 * - `warning`: Issue that allows operation to complete but may have problems
 * - `info`: General informational message or notice
 */
export enum ErrorSeverity {
  ERROR = "error",
  WARNING = "warning",
  INFO = "info",
}

/**
 * Get severity label for display
 */
export function getSeverityLabel(severity: ErrorSeverity): string {
  switch (severity) {
    case ErrorSeverity.ERROR:
      return "Error";
    case ErrorSeverity.WARNING:
      return "Warning";
    case ErrorSeverity.INFO:
      return "Info";
  }
}

/**
 * Get severity icon for display
 */
export function getSeverityIcon(severity: ErrorSeverity): string {
  switch (severity) {
    case ErrorSeverity.ERROR:
      return "❌";
    case ErrorSeverity.WARNING:
      return "⚠️";
    case ErrorSeverity.INFO:
      return "ℹ️";
  }
}

/**
 * Get CLI exit code based on severity
 */
export function getCliExitCode(severity: ErrorSeverity): number {
  switch (severity) {
    case ErrorSeverity.ERROR:
      return 1;
    case ErrorSeverity.WARNING:
      return 2;
    case ErrorSeverity.INFO:
      return 0;
  }
}

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

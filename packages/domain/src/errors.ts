/**
 * Domain Error Types and Utilities
 *
 * Re-exports all error-related types, utilities, and formatters from the errors directory.
 *
 * @module errors
 */

// Error severity and presentation
export * from "./errors/severity.ts";
export * from "./errors/presenter.ts";

// Base error types and interfaces
export * from "./errors/types.ts";

// Cause formatting utilities
export * from "./errors/cause-formatter.ts";

// Error tag types
export type { ValidationViolationTag } from "./errors/index.ts";

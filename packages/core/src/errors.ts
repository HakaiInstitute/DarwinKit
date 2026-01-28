/**
 * Core Error Types
 *
 * Re-exports all error-related types from the errors directory and specialized modules.
 * This provides a single import point for all core error types.
 *
 * @module errors
 */

// Main error types (ValidationError, etc.)
export * from "./errors/index.ts";

// Workspace configuration errors
export * from "./workspace/errors.ts";

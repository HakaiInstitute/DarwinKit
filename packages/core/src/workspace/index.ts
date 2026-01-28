/**
 * Workspace Module
 *
 * Re-exports workspace management functionality.
 *
 * @module workspace
 */

// Error types and formatting
export {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  DatasetFileNotFoundError,
  formatWorkspaceConfigError,
  prettyPrintWorkspaceError,
  TransformInputNotFoundError,
  ValidationConfigMissingError,
  type WorkspaceConfigError,
} from "./errors.ts";

// Workspace
export { type ValidationOptions, Workspace } from "./workspace.ts";

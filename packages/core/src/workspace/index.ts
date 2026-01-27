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

// Effect-managed workspace
export { ManagedWorkspace, type ValidationOptions } from "./workspace.ts";

// Managed workspace service for dependency injection
export {
  makeWorkspaceLayer,
  ManagedWorkspaceService,
  type ManagedWorkspaceServiceApi,
} from "./managed-workspace-service.ts";

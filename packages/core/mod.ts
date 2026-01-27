/**
 * @dwkt/core - Core business logic and Node.js-specific implementations
 */

// Workspace
export { type ValidationOptions, Workspace } from "./src/workspace/workspace.ts";

// Workspace service for dependency injection
export {
  makeWorkspaceLayer,
  WorkspaceService,
  type WorkspaceServiceApi,
} from "./src/workspace/workspace-service.ts";

// Workspace validation
export * from "./src/validation/workspace-validator.ts";

// CSV parsing
export * from "./src/parsing/csv-parser.ts";

// Transformation
export * from "./src/transform/transform.ts";

// Schema Import
export * from "./src/import/get_dwc_schema.ts";

// Error types (all core errors consolidated)
export * from "./src/errors.ts";

// Database utilities
export * from "./src/database/index.ts";

// Logging configuration
export * from "./src/logging/index.ts";

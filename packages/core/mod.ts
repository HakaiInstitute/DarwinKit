/**
 * @dwkt/core - Core business logic and Node.js-specific implementations
 */

// Effect-managed workspace
export { ManagedWorkspace, type ValidationOptions } from "./src/workspace/workspace.ts";

// Managed workspace service for dependency injection
export {
  makeWorkspaceLayer,
  ManagedWorkspaceService,
  type ManagedWorkspaceServiceApi,
} from "./src/workspace/managed-workspace-service.ts";

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

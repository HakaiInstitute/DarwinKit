/**
 * @dwkt/core - Core business logic and Node.js-specific implementations
 */

// Workspace management
export * from "./src/workspace.ts";

// Re-export validation utilities (error types, database operations, validators)
// NOTE: WorkspaceValidator class has been removed - use Workspace class directly
export {
  validateDataset,
  WorkspaceImportCSV,
  WorkspaceImportSchema,
} from "./src/validation/workspace-validator.ts";
export {
  WorkspaceImportError,
  WorkspaceValidationError,
} from "./src/validation/validation-utils.ts";

// CSV parsing
export * from "./src/csv-parser.ts";

// Transformation
export * from "./src/transform.ts";

// Schema Import
export * from "./src/import/get_dwc_schema.ts";

// Error tag types (for test autocomplete)
export type { CoreErrorTag } from "./src/errors.ts";

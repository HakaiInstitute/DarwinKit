/**
 * @dwkt/core - Core business logic and Node.js-specific implementations
 */

// Workspace management
export * from "./src/workspace/workspace.ts";
export { Transformer } from "./src/workspace/transformer.ts";
export { Validator } from "./src/workspace/validator.ts";

// Validation utilities
export { importSchemaToWorkspace } from "./src/database/index.ts";
export { validateDataset } from "./src/validation/dataset-validator.ts";

// Transformation
export * from "./src/transform.ts";

// Schema Import
export * from "./src/import/get_dwc_schema.ts";

// Error tag types (for test autocomplete)
export {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  DatasetFileNotFoundError,
  WorkspaceImportError,
  WorkspaceValidationError,
} from "./src/workspace/errors.ts";

export type { ConfigError, CoreErrorTag } from "./src/workspace/errors.ts";

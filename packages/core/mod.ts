/**
 * @dwkt/core - Core business logic and Node.js-specific implementations
 */

// Workspace
export { type ValidationOptions, Workspace } from "./src/workspace/workspace.ts";

// Workspace errors
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
} from "./src/workspace/errors.ts";

// Workspace validation
export * from "./src/validation/workspace-validator.ts";

// CSV parsing (ParseError is re-exported via ./src/errors.ts)
export {
  ParsedFileResult,
  parseFileForWorkspace,
  ParseMetadata,
  type ParseOptions,
} from "./src/loading/csv-parser.ts";

// Transformation
export * from "./src/transform/transform.ts";

// Schema Import
export * from "./src/import/get_dwc_schema.ts";

// Error types (all core errors consolidated)
export * from "./src/errors.ts";

// CSV import utilities
export * from "./src/loading/csv-import.ts";

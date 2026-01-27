/**
 * @dwkt/core - Core business logic and Node.js-specific implementations
 */

// Workspace management
export * from "./src/workspace/workspace-service.ts";
export * from "./src/validation/workspace-validator.ts";
export { ValidationService } from "./src/validation/validation-service.ts";

// CSV parsing
export * from "./src/parsing/csv-parser.ts";

// Transformation
export * from "./src/transform/transform.ts";

// Schema Import
export * from "./src/import/get_dwc_schema.ts";

// Error tag types (for test autocomplete)
export type { CoreErrorTag } from "./src/errors/index.ts";

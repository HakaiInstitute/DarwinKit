/**
 * Core Error Tag Types
 *
 * Type-only exports for error tags to enable IDE autocomplete and type safety
 * when writing tests. These tags are derived directly from the error classes
 * using TypeScript's type system, ensuring they stay in sync automatically.
 *
 * Usage in tests:
 * ```typescript
 * import type { CoreErrorTag } from "@dwkt/core/errors";
 *
 * await expectError(
 *   someEffect,
 *   "CsvReadError" as CoreErrorTag,  // ← IDE autocomplete!
 *   (error) => {
 *     // error is automatically typed
 *     assertEquals(error.csvPath, "./test.csv");
 *   }
 * );
 * ```
 */

// Import error classes to extract their tags
import type { ParseError } from "./csv-parser.ts";
import type { OutputError, TransformationError } from "./transform.ts";
import type { WorkspaceImportError } from "./validation/utils.ts";
import type {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  DatasetFileNotFoundError,
} from "./workspace.ts";

/**
 * Union type of all core package error tags
 *
 * Tags are extracted directly from error class _tag properties using
 * InstanceType<typeof ErrorClass>["_tag"]. This ensures the types stay
 * in sync with the actual error definitions automatically.
 */
export type CoreErrorTag =
  // CSV Parsing & Reading
  | InstanceType<typeof ParseError>["_tag"]
  // Configuration Management
  | InstanceType<typeof ConfigNotFoundError>["_tag"]
  | InstanceType<typeof ConfigParseError>["_tag"]
  | InstanceType<typeof ConfigValidationError>["_tag"]
  | InstanceType<typeof DatasetFileNotFoundError>["_tag"]
  // Validation & Import
  | InstanceType<typeof WorkspaceImportError>["_tag"]
  // Transformation & Output
  | InstanceType<typeof TransformationError>["_tag"]
  | InstanceType<typeof OutputError>["_tag"];

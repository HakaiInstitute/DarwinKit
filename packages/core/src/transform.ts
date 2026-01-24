/**
 * Transform - Backward-compatible exports
 *
 * This file maintains re-exports of transformation errors and operations
 * for backward compatibility. The legacy transformFile() function has been
 * removed - use Workspace API directly instead:
 *
 * @example
 * ```typescript
 * import { Workspace } from '@dwkt/core';
 * import * as Effect from 'effect/Effect';
 *
 * const workspace = await Effect.runPromise(Workspace.discover());
 * await Effect.runPromise(workspace.transformer.run());
 * workspace.close();
 * ```
 */

// Re-export transformation errors for backward compatibility
export { OutputError, TransformationError } from "./transformation/errors.ts";

// Re-export transformation operations for backward compatibility
export {
  createTableFromSchema,
  createTablesFromCSV,
  exportObisTablesToCSV,
  exportToPersistentDB,
  populateSchemaFromDataTables,
  runPostImportTransformations,
} from "./transformation/operations/index.ts";

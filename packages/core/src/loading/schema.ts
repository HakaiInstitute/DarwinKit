import type { DuckDBConnection } from "@duckdb/node-api";
import type { WorkspaceCrossDatasetRule } from "@dwkt/domain/schemas";
import { parseSpecIdentifier } from "@dwkt/domain/schemas";
import { getValidationProfile } from "@dwkt/domain/specs";
import { WorkspaceImportError } from "@dwkt/domain/errors";
import * as Effect from "effect/Effect";
import { findForeignKeyRule, sanitizeTableName } from "./sql.ts";

/**
 * Minimal dataset interface for schema import
 * Works with both validation and transform dataset configs
 */
type DatasetWithProfile = {
  readonly name: string;
  readonly profile?: string;
  readonly spec?: string;
};

/**
 * Generates and applies a database schema for a dataset based on its validation profile.
 *
 * This function:
 * - Loads a validation profile for `dataset` using `getValidationProfile(dataset.profile)`.
 *   If no profile is found the function logs a warning and returns early (no DB changes).
 * - Derives a table name from the profile's `name` (lowercased).
 * - Creates ENUM types for any profile fields declared as controlled vocabularies
 *   (profile field shape: `type === "controlled-vocabulary"` and having `values`).
 *   - Enum type name format: `${tableName}_${fieldName}_enum`
 *   - Enum members are derived from the keys of `field.values` and are quoted.
 *   - ENUMs are created with `CREATE TYPE IF NOT EXISTS ... AS ENUM (...)`.
 * - Builds a CREATE TABLE statement for the table:
 *   - Column SQL type mapping:
 *     - `IDENTIFIER` -> `TEXT`
 *     - `CONTROLLED-VOCABULARY` -> `${tableName}_${fieldName}_enum`
 *     - `URI` -> `TEXT`
 *     - default -> `TEXT`
 *   - Column names are quoted (`"fieldName"`).
 *   - A column is marked PRIMARY KEY when either:
 *     - its name equals `${tableName}ID`, or
 *     - it ends with `ID` and the profile field has `unique === "true"`.
 *   - A column is marked NOT NULL if `spec.fieldOverrides?.[fieldName]?.requirement === "required"`.
 *   - Foreign key constraints:
 *     - Created based on explicit `crossDatasetRules` from configuration.
 *     - Only adds FK constraints when a rule with `ruleType === "foreignKey"` exists
 *       where `sourceDataset` matches the current dataset name and `sourceField` matches the column.
 * - Executes DDL against the given `connection` using Effect-wrapped promises:
 *   - ENUM creation and table creation are executed via `connection.run(...)`
 *     wrapped in `Effect.tryPromise`.
 *   - SQL uses `IF NOT EXISTS` so repeated runs are safe (idempotent in typical cases).
 * - Error handling:
 *   - Database execution failures are converted into `WorkspaceImportError` values
 *     with the original error attached as `cause`.
 *   - The returned Effect fails with that `WorkspaceImportError` on DB errors.
 *
 * Side effects:
 * - Mutates the target database by creating types and tables.
 * - Silently skips table creation if the dataset has no validation profile.
 *
 * Parameters:
 * - connection: DuckDBConnection used to execute DDL statements.
 * - dataset: Dataset config with name and profile/spec (works with both validation and transform configs).
 * - datasets: All datasets, used to resolve target table names for FK constraints.
 * - crossDatasetRules: Explicit FK rules from configuration. Only rules with ruleType "foreignKey" are used.
 *
 * Returns:
 * - Effect.Effect<void, WorkspaceImportError> — an Effect which completes successfully
 *   when DDL statements have been applied, or fails with WorkspaceImportError on error.
 *
 * Notes / caveats:
 * - The function assumes profile field shapes and keys (e.g., `type`, `values`, `unique`,
 *   and `fieldOverrides`) conform to the expected validation profile format.
 * - ENUM member values are taken directly from the keys of `field.values` and quoted
 *   without additional escaping; if enum keys contain characters that require escaping
 *   for the SQL dialect in use, that may need additional handling.
 */

export function importSchema(
  connection: DuckDBConnection,
  dataset: DatasetWithProfile,
  datasets: readonly DatasetWithProfile[],
  crossDatasetRules?: readonly WorkspaceCrossDatasetRule[],
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.gen(function* (_) {
    // Load validation profile - use profile if specified, otherwise derive from spec
    let profileId = dataset.profile;
    if (!profileId && dataset.spec) {
      const parsed = parseSpecIdentifier(dataset.spec);
      if (parsed) {
        profileId = parsed.type.charAt(0).toUpperCase() + parsed.type.slice(1);
      }
    }

    if (!profileId) {
      // No profile or spec specified - skip table creation
      // TODO: When implementing issue #63 (https://github.com/HakaiInstitute/DarwinKit/issues/63):
      // See about surfacing this state as some form of a recoverable schema violation (warning)
      return;
    }

    const spec = getValidationProfile(profileId);
    if (!spec) {
      // No validation profile found - skip table creation
      // TODO: When implementing issue #63 (https://github.com/HakaiInstitute/DarwinKit/issues/63):
      // See about surfacing this state as some form of a recoverable schema violation (warning)
      return;
    }
    // Convert profile name to valid SQL table name using sanitizeTableName
    const tableName = sanitizeTableName(spec.name).toLowerCase();

    // 1. Create ENUM types for controlled vocabularies
    const enums = Object.entries(spec.fields || {}).map(
      ([fieldName, field]) => {
        // Check if this is a controlled vocabulary field
        // Profile fields use `type === "controlled-vocabulary"` and may have `values`
        if (field.type === "controlled-vocabulary" && field.values) {
          const enumName = `${tableName}_${fieldName.toLowerCase()}_enum`;
          const enumValues = Object.keys(field.values).map((v: string) => `'${v}'`).join(", ");
          return `CREATE TYPE IF NOT EXISTS ${enumName} AS ENUM (${enumValues});`;
        }
        return null;
      },
    );

    // 2. Generate Column Definition SQL
    const columns = Object.keys(spec.fields || {}).map((fieldName) => {
      const field = spec.fields![fieldName];
      const fieldType = (field.type?.toUpperCase() || "TEXT")
        .replace("IDENTIFIER", "TEXT")
        .replace(
          "CONTROLLED-VOCABULARY",
          `${tableName}_${fieldName.toLowerCase()}_enum`,
        )
        .replace("URI", "TEXT");
      let fieldStr = `"${fieldName}" ${fieldType}`;
      // Check if this field is the primary identifier for this table
      // Profile fields use simple name matching (e.g., occurrenceID for Occurrence table)
      // or check if field is marked as unique identifier
      const isUniqueIdentifier = field.unique === "true";

      if (
        fieldName === tableName + "ID" ||
        (fieldName.endsWith("ID") && isUniqueIdentifier)
      ) {
        fieldStr += " PRIMARY KEY";
      } else if (
        spec.fieldOverrides?.[fieldName]?.requirement === "required"
      ) {
        // Only apply NOT NULL if this specific profile marks the field as required
        fieldStr += " NOT NULL";
      }
      // Add foreign key constraint if an explicit rule exists in config
      const fkRule = findForeignKeyRule(dataset.name, fieldName, crossDatasetRules);
      if (fkRule) {
        // Resolve target dataset name to table name via its profile
        const targetDataset = datasets.find((ds) => ds.name === fkRule.targetDataset);
        if (targetDataset) {
          // Get profile ID for target dataset
          let targetProfileId = targetDataset.profile;
          if (!targetProfileId && targetDataset.spec) {
            const parsed = parseSpecIdentifier(targetDataset.spec);
            if (parsed) {
              targetProfileId = parsed.type.charAt(0).toUpperCase() + parsed.type.slice(1);
            }
          }
          // Look up profile to get the actual table name
          const targetProfile = targetProfileId ? getValidationProfile(targetProfileId) : undefined;
          if (targetProfile) {
            const referencedTable = sanitizeTableName(targetProfile.name).toLowerCase();
            fieldStr += ` REFERENCES ${referencedTable}("${fkRule.targetField}")`;
          }
        }
      }
      return fieldStr;
    });

    // Add _row_number column to track original CSV row numbers
    columns.push("_row_number INTEGER");

    // 3. Create ENUM Types
    const enumSql = enums.filter((e) => e !== null).join("\n");
    if (enumSql) {
      yield* _(Effect.tryPromise({
        try: () => connection.run(enumSql),
        catch: (error) =>
          new WorkspaceImportError({
            message: `Failed to create ENUM types for table '${tableName}'`,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }));
    }

    // 4. Create Tables
    // Drop table first to ensure clean state (handles cross-test contamination)
    yield* _(Effect.tryPromise({
      try: () => connection.run(`DROP TABLE IF EXISTS ${tableName}`),
      catch: (error) =>
        new WorkspaceImportError({
          message: `Failed to drop table '${tableName}'`,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    }));

    const tableSql = `CREATE TABLE ${tableName} (${columns.join(", ")})`;
    yield* _(Effect.tryPromise({
      try: () => connection.run(tableSql),
      catch: (error) =>
        new WorkspaceImportError({
          message: `Failed to create table '${tableName}': ${tableSql}`,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    }));
  });
}

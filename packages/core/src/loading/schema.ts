import type { DuckDBConnection } from "@duckdb/node-api";
import type {
  ValidationProfile,
  WorkspaceCrossDatasetRule,
  WorkspaceFieldMapping,
} from "@dwkt/domain/schemas";
import type { Standard } from "@dwkt/domain/schemas";
import { classToProfileKey } from "@dwkt/domain/schemas";
import { getValidationProfile, obligationForStandard } from "@dwkt/domain/specs";
import { WorkspaceImportError } from "@dwkt/domain/errors";
import * as Effect from "effect/Effect";
import { deriveRequirementFromConstraints } from "../validation/field-resolution.ts";
import { findForeignKeyRule, sanitizeTableName } from "./sql.ts";

/**
 * Minimal dataset interface for schema import
 * Works with both validation and transform dataset configs
 */
type DatasetWithClass = {
  readonly name: string;
  readonly class: string;
};

/**
 * Generates and applies a database schema for a dataset based on its validation profile.
 *
 * This function:
 * - Loads a validation profile for `dataset` using `getValidationProfile(classToProfileKey(dataset.class))`.
 *   If no profile is found the function returns early (no DB changes).
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
 *   - A column is marked NOT NULL if the fully resolved constraints contain a RequiredConstraint
 *     with `requirement === "required"`. Falls back to checking `spec.fieldOverrides` when
 *     resolved fields aren't provided.
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
 * - dataset: Dataset config with name and type (works with both validation and transform configs).
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

/**
 * Determine whether a controlled vocabulary field should have a DuckDB ENUM created.
 *
 * Only fields with "required" or "recommended" obligation in the active standard
 * get ENUM enforcement. Optional/unmapped fields accept any value as TEXT.
 */
function shouldEnforceVocabulary(
  spec: ValidationProfile,
  fieldName: string,
  activeStandard: "obis" | "gbif",
): boolean {
  const normalizedField = spec.normalizedFields?.[fieldName];
  if (!normalizedField) return false;
  const result = obligationForStandard(normalizedField, activeStandard);
  return result?.requirement === "required" || result?.requirement === "recommended";
}

/**
 * Determine whether a field should be NOT NULL in the DuckDB table.
 *
 * When resolved fields are available (from the 3-tier constraint pipeline),
 * uses them to derive NOT NULL from RequiredConstraints. Falls back to
 * checking profile fieldOverrides when resolved fields aren't provided.
 */
function isFieldRequired(
  resolvedFields: Record<string, WorkspaceFieldMapping> | undefined,
  spec: ValidationProfile,
  fieldName: string,
): boolean {
  if (resolvedFields) {
    const resolved = resolvedFields[fieldName];
    return deriveRequirementFromConstraints(resolved?.constraints) === "required";
  }
  return spec.fieldOverrides?.[fieldName]?.requirement === "required";
}

export function importSchema(
  connection: DuckDBConnection,
  dataset: DatasetWithClass,
  datasets: readonly DatasetWithClass[],
  standard: Standard,
  crossDatasetRules?: readonly WorkspaceCrossDatasetRule[],
  resolvedFields?: Record<string, WorkspaceFieldMapping>,
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.gen(function* (_) {
    // Load base validation profile for DDL generation
    // Uses base type profile (not standard-specific) to ensure consistent table naming
    const profileId = classToProfileKey(dataset.class);
    const spec = getValidationProfile(profileId);
    if (!spec) {
      // No validation profile found - skip table creation
      // TODO: When implementing issue #63 (https://github.com/HakaiInstitute/DarwinKit/issues/63):
      // See about surfacing this state as some form of a recoverable schema violation (warning)
      return;
    }
    // Convert profile name to valid SQL table name using sanitizeTableName
    const tableName = sanitizeTableName(spec.name).toLowerCase();
    const activeStandard = standard;

    // 1. Create ENUM types for controlled vocabularies (only for fields with sufficient obligation)
    const enumFields = new Set<string>();
    const enums = Object.entries(spec.fields || {}).map(
      ([fieldName, field]) => {
        if (field.type === "controlled-vocabulary" && field.values) {
          if (!shouldEnforceVocabulary(spec, fieldName, activeStandard)) {
            return null;
          }
          enumFields.add(fieldName);
          const enumName = `${tableName}_${fieldName.toLowerCase()}_enum`;
          const enumValues = Object.keys(field.values).map((v: string) => `'${v}'`).join(", ");
          return `CREATE TYPE IF NOT EXISTS ${enumName} AS ENUM (${enumValues});`;
        }
        return null;
      },
    );

    // NOTE: Range/format constraints are validated post-insert via SQL queries in
    // field-validators.ts, not via DuckDB CHECK constraints.
    // See #110 for potential CHECK constraint support in the future.
    // 2. Generate Column Definition SQL
    const columns = Object.keys(spec.fields || {}).map((fieldName) => {
      const field = spec.fields![fieldName];
      const fieldType = (field.type?.toUpperCase() || "TEXT")
        .replace("IDENTIFIER", "TEXT")
        .replace(
          "CONTROLLED-VOCABULARY",
          enumFields.has(fieldName) ? `${tableName}_${fieldName.toLowerCase()}_enum` : "TEXT",
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
      } else if (isFieldRequired(resolvedFields, spec, fieldName)) {
        fieldStr += " NOT NULL";
      }
      // Add foreign key constraint if an explicit rule exists in config
      const fkRule = findForeignKeyRule(dataset.name, fieldName, crossDatasetRules);
      if (fkRule) {
        // Resolve target dataset name to table name via its profile
        const targetDataset = datasets.find((ds) => ds.name === fkRule.targetDataset);
        if (targetDataset) {
          const targetProfileId = classToProfileKey(targetDataset.class);
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

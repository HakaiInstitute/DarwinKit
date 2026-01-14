/**
 * Schema Builder - Creates database schemas based on validation profiles
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { ErrorCode, resolveDatasetProfile } from "@dwkt/domain";
import * as Effect from "effect/Effect";
import { WorkspaceImportError } from "../utils.ts";
import type { DatasetWithProfile } from "./utils.ts";
import { sanitizeTableName } from "./utils.ts";

/**
 * Generates and applies a database schema for a dataset based on its validation profile.
 *
 * This function creates DuckDB tables with appropriate constraints based on Darwin Core
 * validation profiles. It handles:
 * - ENUM types for controlled vocabularies
 * - Primary key constraints
 * - NOT NULL constraints for required fields
 * - Foreign key constraints for referential integrity
 *
 * The schema generation follows these rules:
 * - Table name is derived from the profile name (lowercased and sanitized)
 * - ENUM types are created for fields with type "controlled-vocabulary" and values
 * - Column SQL types: IDENTIFIER/URI → TEXT, CONTROLLED-VOCABULARY → ENUM
 * - Primary key: field name matches `${tableName}ID` or ends with "ID" and has `unique === "true"`
 * - NOT NULL: profile marks field as required via `fieldOverrides`
 * - Foreign keys: ID fields reference tables with matching profile names
 *
 * @param connection - DuckDB connection for executing DDL
 * @param dataset - Dataset config with name and profile/spec
 * @param datasets - All datasets in workspace (for resolving foreign key references)
 * @returns Effect that completes successfully or fails with WorkspaceImportError
 *
 * @example
 * ```typescript
 * const result = yield* _(
 *   WorkspaceImportSchema(
 *     connection,
 *     { name: "occurrences", profile: "obis" },
 *     allDatasets
 *   )
 * );
 * ```
 */
export function WorkspaceImportSchema(
  connection: DuckDBConnection,
  dataset: DatasetWithProfile,
  datasets: readonly DatasetWithProfile[],
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.gen(function* (_) {
    // Resolve validation profile from dataset config
    const spec = resolveDatasetProfile(dataset);
    if (!spec) {
      console.warn(
        `No profile or spec specified for dataset ${dataset.name}, skipping table creation.`,
      );
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
        .replace("CONTROLLED-VOCABULARY", `${tableName}_${fieldName.toLowerCase()}_enum`)
        .replace("URI", "TEXT");
      let fieldStr = `"${fieldName}" ${fieldType}`;
      // Check if this field is the primary identifier for this table
      // Profile fields use simple name matching (e.g., occurrenceID for Occurrence table)
      // or check if field is marked as unique identifier
      const isUniqueIdentifier = field.unique === "true";

      if (fieldName === tableName + "ID" || (fieldName.endsWith("ID") && isUniqueIdentifier)) {
        fieldStr += " PRIMARY KEY";
      } else if (
        spec.fieldOverrides?.[fieldName]?.requirement === "required"
      ) {
        // Only apply NOT NULL if this specific profile marks the field as required
        fieldStr += " NOT NULL";
      }
      // add foreign key constraints for fields
      // Skip FK for this table's PK, but include it for other ID fields
      const isPrimaryKey = fieldName === tableName + "ID" ||
        (fieldName.endsWith("ID") && isUniqueIdentifier);
      if (fieldName.endsWith("ID") && !isPrimaryKey) {
        const referencedTable = fieldName.slice(0, -2).toLowerCase();
        // check if referenced table exists in config
        if (
          datasets.find((ds) => {
            const profile = resolveDatasetProfile(ds);
            return profile?.name.toLowerCase() === referencedTable;
          })
        ) {
          fieldStr += ` REFERENCES ${referencedTable}(${fieldName})`;
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
            code: ErrorCode.DATABASE_ERROR,
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
          code: ErrorCode.DATABASE_ERROR,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    }));

    const tableSql = `CREATE TABLE ${tableName} (${columns.join(", ")})`;
    yield* _(Effect.tryPromise({
      try: () => connection.run(tableSql),
      catch: (error) =>
        new WorkspaceImportError({
          message: `Failed to create table '${tableName}'. SQL: ${tableSql}`,
          code: ErrorCode.DATABASE_ERROR,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    }));
  });
}

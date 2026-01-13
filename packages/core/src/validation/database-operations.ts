/**
 * Database operations - CSV import, schema creation, row-by-row insertion
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import type { ValidationProfile, ValidationSettings, ValidationViolation } from "@dwkt/domain";
import {
  enforcementToSeverity,
  EnumViolation,
  ErrorCode,
  ForeignKeyViolation,
  NotNullViolation,
  PrimaryKeyViolation,
  resolveDatasetProfile,
} from "@dwkt/domain";
import * as Effect from "effect/Effect";
import {
  findSuggestedValue,
  parseDuckDBError,
  WorkspaceImportError,
  type WorkspaceValidationError,
} from "./utils.ts";

/**
 * Minimal dataset interface for schema import
 * Works with both validation and transform dataset configs
 */
export type DatasetWithProfile = {
  readonly name: string;
  readonly profile?: string;
  readonly spec?: string;
};

/**
 * Sanitize dataset name for use as SQL table name
 */
export function sanitizeTableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Get original CSV value for a specific row and field
 */
export function getOriginalCsvValue(
  connection: DuckDBConnection,
  rawTableName: string,
  fieldName: string,
  rowNumber: number,
): Effect.Effect<string, WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    const query = `
      SELECT "${fieldName}" as value
      FROM ${rawTableName}
      WHERE _row_number = ${rowNumber}
    `;

    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(Effect.orDie),
    );

    const rows = result.getRowObjects();
    if (rows.length === 0) {
      return "";
    }

    return String(rows[0].value ?? "");
  });
}

/**
 * Imports a CSV file into a DuckDB table with a _row_number column.
 *
 * @param connection - The DuckDB connection to use for the import
 * @param tableName - The name of the table to create or import into
 * @param fullPath - The full file path to the CSV file to import
 * @param nullStr - The string value(s) to treat as NULL in the CSV
 * @param dropTable - If true, drops the table if it exists before creating it. Defaults to false
 * @returns An Effect that completes when the CSV has been successfully imported, or fails with a WorkspaceImportError
 * @throws WorkspaceImportError - If the table creation or CSV import fails
 */
export function WorkspaceImportCSV(
  connection: DuckDBConnection,
  tableName: string,
  fullPath: string,
  nullStr: string,
  dropTable: boolean = false,
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.gen(function* (_) {
    yield* _(Effect.tryPromise({
      try: async () => {
        const sequenceName = `${tableName}_seq`;

        if (dropTable) {
          connection.run(`DROP TABLE IF EXISTS ${tableName}`);
          connection.run(`DROP SEQUENCE IF EXISTS ${sequenceName}`);
        }

        // Create sequence for deterministic row numbering
        await connection.run(`CREATE SEQUENCE IF NOT EXISTS ${sequenceName} START 1`);

        await connection.run(
          `CREATE TABLE IF NOT EXISTS ${tableName} AS
           SELECT *, nextval('${sequenceName}') as _row_number
           FROM read_csv_auto('${fullPath}', nullstr=[${nullStr}])`,
        );
      },
      catch: (error) =>
        new WorkspaceImportError({
          message: `Failed to create table '${tableName}' from CSV ${fullPath}`,
          code: ErrorCode.DATABASE_ERROR,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    }));
  });
}

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
 *     - For any column ending with `ID` that is not treated as the table's primary key,
 *       the code attempts to add `REFERENCES referencedTable(fieldName)` where
 *       `referencedTable` = `fieldName.slice(0, -2).toLowerCase()` — only if a dataset
 *       with that validation profile name exists in the provided `datasets` array.
 * - Executes DDL against the given `connection` using Effect-wrapped promises:
 *   - ENUM creation and table creation are executed via `connection.run(...)`
 *     wrapped in `Effect.tryPromise`.
 *   - SQL uses `IF NOT EXISTS` so repeated runs are safe (idempotent in typical cases).
 * - Error handling:
 *   - Database execution failures are converted into `WorkspaceImportError` values
 *     with `ErrorCode.DATABASE_ERROR` and the original error attached as `cause`.
 *   - The returned Effect fails with that `WorkspaceImportError` on DB errors.
 *
 * Side effects:
 * - Mutates the target database by creating types and tables.
 * - Logs a warning (console.warn) if the dataset has no validation profile.
 * - Logs the failing SQL to console.error if table creation fails.
 *
 * Parameters:
 * - connection: DuckDBConnection used to execute DDL statements.
 * - dataset: Dataset config with name and profile/spec (works with both validation and transform configs).
 * - datasets: readonly array of datasets used to resolve referenced tables for foreign keys.
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

/**
 * Insert rows one-by-one, collecting violations for any that fail
 */
export function insertRowByRow(
  connection: DuckDBConnection,
  rawTableName: string,
  schemaTableName: string,
  columnMappings: { origin: string; target: string }[],
  profile: ValidationProfile,
  validationSettings?: ValidationSettings,
): Effect.Effect<ValidationViolation[], WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    const violations: ValidationViolation[] = [];
    const enableSuggestions = validationSettings?.enableSuggestions ?? true;
    const processedDuplicates = new Set<string>(); // Track duplicate PKs we've already processed

    // Get maximum _row_number to determine iteration range
    const maxRowResult = yield* _(
      Effect.tryPromise(() =>
        connection.runAndReadAll(`SELECT MAX(_row_number) as max_row FROM ${rawTableName}`)
      ).pipe(Effect.orDie),
    );
    const maxRow = Number(maxRowResult.getRowObjects()[0]?.max_row ?? 0);

    // Build column lists for INSERT
    const targetColumns = columnMappings.map((m) => `"${m.target}"`).join(", ");
    const originColumns = columnMappings.map((m) => `"${m.origin}"`).join(", ");

    // Insert each row individually by _row_number
    for (let rowNum = 1; rowNum <= maxRow; rowNum++) {
      const insertSQL = `
        INSERT INTO ${schemaTableName} (${targetColumns}, _row_number)
        SELECT ${originColumns}, _row_number
        FROM ${rawTableName}
        WHERE _row_number = ${rowNum}
      `;

      const result = yield* _(
        Effect.tryPromise({
          try: () => connection.run(insertSQL),
          catch: (error) => error,
        }).pipe(Effect.either),
      );

      if (result._tag === "Left") {
        const error = result.left;
        if (!(error instanceof Error)) continue;

        // Parse the error to determine violation type
        const parsed = parseDuckDBError(error);

        // Create structured violation based on error type
        switch (parsed.type) {
          case "primary-key": {
            // Find the PK field from mappings
            const pkMapping = columnMappings.find((m) =>
              m.target === schemaTableName + "ID" ||
              (m.target.endsWith("ID") &&
                profile.fields?.[m.target]?.unique === "true")
            );

            if (pkMapping && parsed.value && !processedDuplicates.has(parsed.value)) {
              const specField = profile.normalizedFields?.[pkMapping.target];
              if (!specField) break;

              // Mark this duplicate value as processed
              processedDuplicates.add(parsed.value);

              // Query the raw table to find ALL rows with this duplicate value
              // This gives us complete information about all instances of the duplicate
              const duplicateQuery = `
                SELECT _row_number
                FROM ${rawTableName}
                WHERE "${pkMapping.origin}" = '${parsed.value}'
              `;

              const duplicateResult = yield* _(
                Effect.tryPromise(() => connection.runAndReadAll(duplicateQuery)).pipe(
                  Effect.orDie,
                ),
              );

              const duplicateRows = duplicateResult.getRowObjects();
              const duplicateCount = duplicateRows.length;

              // Create a violation for each row that has the duplicate value
              for (const dupRow of duplicateRows) {
                const dupRowNum = Number(dupRow._row_number);
                const csvValue = yield* _(
                  getOriginalCsvValue(
                    connection,
                    rawTableName,
                    pkMapping.origin,
                    dupRowNum,
                  ),
                );

                violations.push(
                  new PrimaryKeyViolation({
                    enforcement: "required",
                    severity: enforcementToSeverity("required"),
                    fieldName: pkMapping.origin,
                    targetName: pkMapping.target,
                    rowNumber: dupRowNum,
                    value: parsed.value,
                    csvValue,
                    constraintType: "duplicate",
                    duplicateCount,
                    errorMessage: `Duplicate primary key: "${parsed.value}"`,
                    validatorType: "primary-key",
                  }),
                );
              }
            }
            break;
          }

          case "not-null": {
            // Find the field that caused the NOT NULL violation
            const notNullMapping = columnMappings.find((m) =>
              parsed.fieldName ? m.target === parsed.fieldName : false
            );

            if (notNullMapping) {
              const specField = profile.normalizedFields?.[notNullMapping.target];
              if (!specField) break;

              violations.push(
                new NotNullViolation({
                  enforcement: "required",
                  severity: enforcementToSeverity("required"),
                  fieldName: notNullMapping.origin,
                  targetName: notNullMapping.target,
                  rowNumber: rowNum,
                  value: "",
                  csvValue: "",
                  errorMessage: `Required field "${notNullMapping.origin}" cannot be NULL`,
                  validatorType: "not-null",
                }),
              );
            }
            break;
          }

          case "enum": {
            // Find the field that caused the ENUM violation
            const enumMapping = columnMappings.find((m) =>
              m.origin === parsed.fieldName || m.target === parsed.fieldName
            );

            if (enumMapping && parsed.value) {
              const specField = profile.normalizedFields?.[enumMapping.target];
              const rawField = profile.fields?.[enumMapping.target];

              if (!specField || !rawField?.values) break;

              const allowedValues = Object.keys(rawField.values);
              const suggestedValue = enableSuggestions
                ? findSuggestedValue(parsed.value, allowedValues)
                : undefined;

              const vocabValidator = specField.validators?.find((v) =>
                v.type === "unique" || v.type === "required"
              );
              const enforcement = vocabValidator?.enforcement ?? "required";

              violations.push(
                new EnumViolation({
                  enforcement,
                  severity: enforcementToSeverity(enforcement),
                  fieldName: enumMapping.origin,
                  targetName: enumMapping.target,
                  rowNumber: rowNum,
                  value: parsed.value,
                  csvValue: parsed.value,
                  enumType: `${schemaTableName}_${enumMapping.target.toLowerCase()}_enum`,
                  allowedValues,
                  suggestedValue,
                  errorMessage: suggestedValue
                    ? `Invalid value "${parsed.value}" (did you mean "${suggestedValue}"?)`
                    : `Invalid value "${parsed.value}" (must be one of: ${
                      allowedValues.join(", ")
                    })`,
                  validatorType: "enum",
                }),
              );
            }
            break;
          }

          case "foreign-key": {
            // Find the FK field from mappings
            // The fieldName from parsed error matches the target (schema) field name
            const fkMapping = parsed.fieldName
              ? columnMappings.find((m) => m.target === parsed.fieldName)
              : columnMappings.find((m) => m.target.endsWith("ID") && parsed.value);

            if (!fkMapping) {
              console.warn(
                `FK violation but couldn't find field mapping at row ${rowNum}: ${parsed.message}`,
              );
              break;
            }

            // Get the original CSV value for this row and field
            const csvValue = yield* _(
              getOriginalCsvValue(
                connection,
                rawTableName,
                fkMapping.origin,
                rowNum,
              ),
            );

            // Determine referenced table and field
            // Convention: fieldName ending in "ID" references table named field.slice(0, -2).toLowerCase()
            const referencedField = fkMapping.target; // FK usually references the same field name
            const referencedTable = parsed.referencedTable ||
              (fkMapping.target.endsWith("ID")
                ? fkMapping.target.slice(0, -2).toLowerCase()
                : "unknown");

            // Get enforcement level from spec
            const specField = profile.normalizedFields?.[fkMapping.target];
            const validators = specField?.validators?.filter(
              (v: { type: string; enforcement?: string }) => v.type === "referential-integrity",
            );
            const enforcement = validators?.[0]?.enforcement ?? "required";

            violations.push(
              new ForeignKeyViolation({
                enforcement,
                severity: enforcementToSeverity(enforcement),
                fieldName: fkMapping.origin,
                targetName: fkMapping.target,
                rowNumber: rowNum,
                value: parsed.value || csvValue || "",
                csvValue: csvValue,
                referencedTable,
                referencedField,
                errorMessage:
                  `Foreign key violation: "${csvValue}" references non-existent record in ${referencedTable}`,
                validatorType: "foreign-key",
                params: {
                  targetDataset: referencedTable,
                  targetField: referencedField,
                },
              }),
            );
            break;
          }

          default: {
            // Unknown error type - log it
            console.warn(`Unknown constraint violation at row ${rowNum}: ${parsed.message}`);
            break;
          }
        }
      }
    }

    return violations;
  });
}

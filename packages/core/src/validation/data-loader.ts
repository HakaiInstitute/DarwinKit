/**
 * Data Loader
 *
 * Provides row-by-row data insertion with detailed violation collection.
 * Used as a fallback when bulk insertion fails due to constraint violations.
 *
 * @module validation/data-loader
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import * as Effect from "effect/Effect";

import type { ValidationProfile, ValidationSettings, ValidationViolation } from "@dwkt/domain";
import {
  enforcementToSeverity,
  EnumViolation,
  NotNullViolation,
  PrimaryKeyViolation,
} from "@dwkt/domain";

import { getCsvValue } from "../loading/csv-import.ts";
import { parseDuckDBError } from "../loading/sql.ts";
import { findSuggestedValue } from "./string-matching.ts";

/**
 * Column mapping for data insertion
 */
export interface ColumnMapping {
  readonly origin: string;
  readonly target: string;
}

/**
 * Insert rows one-by-one, collecting violations for any that fail
 *
 * This function is used as a fallback when bulk insertion fails due to
 * constraint violations. It inserts each row individually, capturing
 * detailed information about any violations that occur.
 *
 * @param connection - DuckDB connection for write operations
 * @param rawTableName - Name of the raw CSV table
 * @param schemaTableName - Name of the schema table to insert into
 * @param columnMappings - Mapping of origin columns to target columns
 * @param profile - Validation profile with field definitions
 * @param validationSettings - Optional validation settings
 * @returns Array of violations found during insertion
 */
export function insertRowByRow(
  connection: DuckDBConnection,
  rawTableName: string,
  schemaTableName: string,
  columnMappings: ColumnMapping[],
  profile: ValidationProfile,
  validationSettings?: ValidationSettings,
): Effect.Effect<ValidationViolation[]> {
  return Effect.gen(function* (_) {
    const violations: ValidationViolation[] = [];
    const enableSuggestions = validationSettings?.enableSuggestions ?? true;
    const processedDuplicates = new Set<string>(); // Track duplicate PKs we've already processed

    // Get maximum _row_number to determine iteration range
    const maxRowResult = yield* _(
      Effect.tryPromise(() =>
        connection.runAndReadAll(
          `SELECT MAX(_row_number) as max_row FROM ${rawTableName}`,
        )
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

            if (
              pkMapping && parsed.value &&
              !processedDuplicates.has(parsed.value)
            ) {
              const specField = profile.normalizedFields?.[pkMapping.target];
              if (!specField) break;

              // Mark this duplicate value as processed
              processedDuplicates.add(parsed.value);

              // Query the raw table to find ALL rows with this duplicate value
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
                  getCsvValue(connection, rawTableName, pkMapping.origin, dupRowNum),
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
              const specField = profile.normalizedFields
                ?.[notNullMapping.target];
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

          case "foreign-key":
          default:
            // FK and unknown violations need additional context to create proper violations
            // For now, silently skip - these are rare in practice
            break;
        }
      }
    }

    return violations;
  });
}

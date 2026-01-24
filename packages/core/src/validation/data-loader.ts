/**
 * Data Loader - Row-by-row insertion with constraint violation detection
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import type { WorkspaceValidationError } from "@dwkt/core";
import type { FieldViolation, ValidationConfig, ValidationProfile } from "@dwkt/domain";
import {
  enforcementToSeverity,
  EnumViolation,
  ForeignKeyViolation,
  NotNullViolation,
  PrimaryKeyViolation,
} from "@dwkt/domain";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import { findSuggestedValue, type ParsedErrorInfo, parseDuckDBError } from "./utils.ts";

/**
 * Get original CSV value for a specific row and field
 *
 * This helper function retrieves the actual value from the raw CSV table,
 * which is useful for generating detailed violation messages.
 *
 * @param connection - DuckDB connection
 * @param rawTableName - Name of the raw CSV table
 * @param fieldName - Column name to retrieve
 * @param rowNumber - Row number (_row_number) to query
 * @returns The value as a string, or empty string if not found
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
 * Context needed for creating violations from parsed errors
 */
interface ViolationContext {
  readonly connection: DuckDBConnection;
  readonly rawTableName: string;
  readonly schemaTableName: string;
  readonly columnMappings: { origin: string; target: string }[];
  readonly profile: ValidationProfile;
  readonly rowNum: number;
  readonly enableSuggestions: boolean;
  readonly processedDuplicates: Set<string>;
}

/**
 * Create structured violations from a parsed DuckDB error using exhaustive matching.
 *
 * This function uses Effect's Match module to ensure all error types are handled,
 * providing compile-time exhaustiveness checking when new error types are added
 * to ParsedErrorInfo.
 */
function createViolationsFromError(
  parsed: ParsedErrorInfo,
  ctx: ViolationContext,
): Effect.Effect<FieldViolation[], WorkspaceValidationError> {
  return Match.value(parsed).pipe(
    Match.when({ type: "primary-key" }, (p) => handlePrimaryKeyViolation(p, ctx)),
    Match.when({ type: "not-null" }, (p) => handleNotNullViolation(p, ctx)),
    Match.when({ type: "enum" }, (p) => handleEnumViolation(p, ctx)),
    Match.when({ type: "foreign-key" }, (p) => handleForeignKeyViolation(p, ctx)),
    Match.when({ type: "check" }, () => Effect.succeed([])),
    Match.when({ type: "unknown" }, () => Effect.succeed([])),
    Match.exhaustive,
  );
}

/**
 * Handle primary key constraint violations
 */
function handlePrimaryKeyViolation(
  parsed: ParsedErrorInfo,
  ctx: ViolationContext,
): Effect.Effect<FieldViolation[], WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    const {
      connection,
      rawTableName,
      columnMappings,
      profile,
      processedDuplicates,
      schemaTableName,
    } = ctx;

    // Find the PK field from mappings
    const pkMapping = columnMappings.find((m) =>
      m.target === schemaTableName + "ID" ||
      (m.target.endsWith("ID") && profile.fields?.[m.target]?.unique === "true")
    );

    if (!pkMapping || !parsed.value || processedDuplicates.has(parsed.value)) {
      return [];
    }

    const specField = profile.normalizedFields?.[pkMapping.target];
    if (!specField) return [];

    processedDuplicates.add(parsed.value);

    // Query the raw table to find ALL rows with this duplicate value
    const duplicateQuery = `
      SELECT _row_number
      FROM ${rawTableName}
      WHERE "${pkMapping.origin}" = '${parsed.value}'
    `;

    const duplicateResult = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(duplicateQuery)).pipe(Effect.orDie),
    );

    const duplicateRows = duplicateResult.getRowObjects();
    const duplicateCount = duplicateRows.length;
    const violations: FieldViolation[] = [];

    // Create a violation for each row that has the duplicate value
    for (const dupRow of duplicateRows) {
      const dupRowNum = Number(dupRow._row_number);
      const csvValue = yield* _(
        getOriginalCsvValue(connection, rawTableName, pkMapping.origin, dupRowNum),
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

    return violations;
  });
}

/**
 * Handle NOT NULL constraint violations
 */
function handleNotNullViolation(
  parsed: ParsedErrorInfo,
  ctx: ViolationContext,
): Effect.Effect<FieldViolation[], never> {
  const { columnMappings, profile, rowNum } = ctx;

  // Find the field that caused the NOT NULL violation
  const notNullMapping = columnMappings.find((m) =>
    parsed.fieldName ? m.target === parsed.fieldName : false
  );

  if (!notNullMapping) return Effect.succeed([]);

  const specField = profile.normalizedFields?.[notNullMapping.target];
  if (!specField) return Effect.succeed([]);

  return Effect.succeed([
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
  ]);
}

/**
 * Handle ENUM constraint violations (controlled vocabulary)
 */
function handleEnumViolation(
  parsed: ParsedErrorInfo,
  ctx: ViolationContext,
): Effect.Effect<FieldViolation[], never> {
  const { columnMappings, profile, rowNum, enableSuggestions, schemaTableName } = ctx;

  // Find the field that caused the ENUM violation
  const enumMapping = columnMappings.find((m) =>
    m.origin === parsed.fieldName || m.target === parsed.fieldName
  );

  if (!enumMapping || !parsed.value) return Effect.succeed([]);

  const specField = profile.normalizedFields?.[enumMapping.target];
  const rawField = profile.fields?.[enumMapping.target];

  if (!specField || !rawField?.values) return Effect.succeed([]);

  const allowedValues = Object.keys(rawField.values);
  const suggestedValue = enableSuggestions
    ? findSuggestedValue(parsed.value, allowedValues)
    : undefined;

  // Get enforcement from vocabulary config, or fall back to "required"
  // Vocabulary enforcement is mapped to standard enforcement levels:
  // strict -> required, recommended -> recommended, loose -> optional
  const vocabEnforcement = specField.vocabulary?.enforcement ?? "strict";
  const enforcement = vocabEnforcement === "strict"
    ? "required"
    : vocabEnforcement === "recommended"
    ? "recommended"
    : "optional";

  return Effect.succeed([
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
        : `Invalid value "${parsed.value}" (must be one of: ${allowedValues.join(", ")})`,
      validatorType: "enum",
    }),
  ]);
}

/**
 * Handle foreign key constraint violations
 */
function handleForeignKeyViolation(
  parsed: ParsedErrorInfo,
  ctx: ViolationContext,
): Effect.Effect<FieldViolation[], WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    const { connection, rawTableName, columnMappings, profile, rowNum } = ctx;

    // Find the FK field from mappings
    const fkMapping = parsed.fieldName
      ? columnMappings.find((m) => m.target === parsed.fieldName)
      : columnMappings.find((m) => m.target.endsWith("ID") && parsed.value);

    if (!fkMapping) {
      // Couldn't find field mapping - create violation with available info
      const fieldName = parsed.fieldName || "unknown";
      const referencedTable = parsed.referencedTable || "unknown";

      return [
        new ForeignKeyViolation({
          enforcement: "required",
          severity: "error",
          fieldName: fieldName,
          targetName: fieldName,
          rowNumber: rowNum,
          value: parsed.value || "",
          csvValue: parsed.value,
          referencedTable,
          referencedField: fieldName,
          errorMessage: `Foreign key violation: "${
            parsed.value || ""
          }" references non-existent record in ${referencedTable} (field mapping not found)`,
          validatorType: "foreign-key",
          params: {
            targetDataset: referencedTable,
            targetField: fieldName,
          },
        }),
      ];
    }

    // Get the original CSV value for this row and field
    const csvValue = yield* _(
      getOriginalCsvValue(connection, rawTableName, fkMapping.origin, rowNum),
    );

    // Determine referenced table and field
    const referencedField = fkMapping.target;
    const referencedTable = parsed.referencedTable ||
      (fkMapping.target.endsWith("ID") ? fkMapping.target.slice(0, -2).toLowerCase() : "unknown");

    // Get enforcement level from spec
    const specField = profile.normalizedFields?.[fkMapping.target];
    const validators = specField?.validators?.filter(
      (v: { type: string; enforcement?: string }) => v.type === "referential-integrity",
    );
    const enforcement = validators?.[0]?.enforcement ?? "required";

    return [
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
    ];
  });
}

/**
 * Insert rows one-by-one, collecting violations for any that fail
 *
 * This function implements the "correctness path" for data validation. When bulk
 * INSERT fails due to constraint violations, it inserts rows individually to
 * identify exactly which rows violate which constraints.
 *
 * It detects and creates structured violations for:
 * - Primary key duplicates
 * - NOT NULL violations (required fields)
 * - ENUM violations (controlled vocabulary)
 * - Foreign key violations (referential integrity)
 * - See ParsedErrorType in packages/core/src/validation/utils.ts
 *
 * @param connection - DuckDB connection
 * @param rawTableName - Raw CSV table name
 * @param schemaTableName - Target schema table name
 * @param columnMappings - Mappings from origin to target column names
 * @param profile - Validation profile with field definitions
 * @param validationSettings - Optional settings (e.g., enableSuggestions)
 * @returns Array of structured validation violations
 *
 * @example
 * ```typescript
 * const violations = yield* _(
 *   insertRowByRow(
 *     connection,
 *     "raw_occurrences",
 *     "occurrence",
 *     [{ origin: "id", target: "occurrenceID" }],
 *     profile
 *   )
 * );
 * ```
 */
export function insertRowByRow(
  connection: DuckDBConnection,
  rawTableName: string,
  schemaTableName: string,
  columnMappings: { origin: string; target: string }[],
  profile: ValidationProfile,
  validationSettings?: ValidationConfig,
): Effect.Effect<FieldViolation[], WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    const violations: FieldViolation[] = [];
    const enableSuggestions = validationSettings?.enableSuggestions ?? true;
    const processedDuplicates = new Set<string>();

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

        // Create structured violations based on error type using exhaustive matching
        const newViolations = yield* _(
          createViolationsFromError(parsed, {
            connection,
            rawTableName,
            schemaTableName,
            columnMappings,
            profile,
            rowNum,
            enableSuggestions,
            processedDuplicates,
          }),
        );
        violations.push(...newViolations);
      }
    }

    return violations;
  });
}

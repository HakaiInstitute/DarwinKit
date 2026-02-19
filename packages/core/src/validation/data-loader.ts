/**
 * Data Loader
 *
 * Provides row-by-row data insertion with detailed violation collection.
 * Used as a fallback when bulk insertion fails due to constraint violations.
 *
 * Violations are returned in the error channel following the Effect validation pattern:
 * - Success: All rows inserted without constraint violations
 * - Failure: Contains array of FieldViolation objects
 *
 * @module validation/data-loader
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";

import type {
  ValidationProfile,
  ValidationSettings,
  WorkspaceCrossDatasetRule,
} from "@dwkt/domain/schemas";
import type { FieldViolation } from "@dwkt/domain/types";
import {
  EnumViolation,
  ForeignKeyViolation,
  NotNullViolation,
  PrimaryKeyViolation,
  requirementToSeverity,
} from "@dwkt/domain/types";
import { obligationForStandard } from "@dwkt/domain/specs";

import { getCsvValue } from "../loading/csv-import.ts";
import type { ParsedErrorInfo } from "../loading/sql.ts";
import { findForeignKeyRule, formatConstraintViolation, parseDuckDBError } from "../loading/sql.ts";
import { findSuggestedValue } from "./string-matching.ts";

/**
 * Column mapping for data insertion
 */
export interface ColumnMapping {
  readonly origin: string;
  readonly target: string;
}

/**
 * Context for creating violations from parsed errors
 */
interface ViolationContext {
  readonly connection: DuckDBConnection;
  readonly rawTableName: string;
  readonly schemaTableName: string;
  readonly columnMappings: ColumnMapping[];
  readonly profile: ValidationProfile;
  readonly activeStandard: "obis" | "gbif" | "custom";
  readonly enableSuggestions: boolean;
  readonly rowNum: number;
  readonly processedDuplicates: Set<string>;
  readonly currentDataset: string;
  readonly crossDatasetRules: readonly WorkspaceCrossDatasetRule[];
}

/**
 * Handle primary key violation
 */
function handlePrimaryKeyViolation(
  parsed: ParsedErrorInfo,
  ctx: ViolationContext,
): Effect.Effect<FieldViolation[]> {
  return Effect.gen(function* (_) {
    // Find the PK field from mappings
    const pkMapping = ctx.columnMappings.find((m) =>
      m.target === ctx.schemaTableName + "ID" ||
      (m.target.endsWith("ID") &&
        ctx.profile.fields?.[m.target]?.unique === "true")
    );

    if (
      !pkMapping || !parsed.value ||
      ctx.processedDuplicates.has(parsed.value)
    ) {
      return [];
    }

    const specField = ctx.profile.normalizedFields?.[pkMapping.target];
    if (!specField) return [];

    // Mark this duplicate value as processed
    ctx.processedDuplicates.add(parsed.value);

    // Query the raw table to find ALL rows with this duplicate value
    const duplicateQuery = `
      SELECT _row_number
      FROM ${ctx.rawTableName}
      WHERE "${pkMapping.origin}" = '${parsed.value}'
    `;

    const duplicateResult = yield* _(
      Effect.tryPromise(() => ctx.connection.runAndReadAll(duplicateQuery)).pipe(
        Effect.orDie,
      ),
    );

    const duplicateRows = duplicateResult.getRowObjects();
    const duplicateCount = duplicateRows.length;
    const violations: FieldViolation[] = [];

    // Create a violation for each row that has the duplicate value
    for (const dupRow of duplicateRows) {
      const dupRowNum = Number(dupRow._row_number);
      const csvValue = yield* _(
        getCsvValue(ctx.connection, ctx.rawTableName, pkMapping.origin, dupRowNum),
      );

      violations.push(
        new PrimaryKeyViolation({
          severity: requirementToSeverity("required"),
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
 * Handle not null violation
 */
function handleNotNullViolation(
  parsed: ParsedErrorInfo,
  ctx: ViolationContext,
): Effect.Effect<FieldViolation[]> {
  return Effect.sync(() => {
    // Find the field that caused the NOT NULL violation
    const notNullMapping = ctx.columnMappings.find((m) =>
      parsed.fieldName ? m.target === parsed.fieldName : false
    );

    if (!notNullMapping) return [];

    const specField = ctx.profile.normalizedFields?.[notNullMapping.target];
    if (!specField) return [];

    return [
      new NotNullViolation({
        severity: requirementToSeverity("required"),
        fieldName: notNullMapping.origin,
        targetName: notNullMapping.target,
        rowNumber: ctx.rowNum,
        value: "",
        csvValue: "",
        errorMessage: `Required field "${notNullMapping.origin}" cannot be NULL`,
        validatorType: "not-null",
      }),
    ];
  });
}

/**
 * Handle enum violation
 *
 * ENUMs are only created for fields whose obligation warrants enforcement
 * (see `shouldEnforceVocabulary` in schema.ts). If DuckDB rejected a row
 * due to an ENUM constraint, the violation is always worth reporting.
 * Severity is derived from the field's obligation in the active standard.
 */
function handleEnumViolation(
  parsed: ParsedErrorInfo,
  ctx: ViolationContext,
): Effect.Effect<FieldViolation[]> {
  return Effect.sync(() => {
    const enumMapping = ctx.columnMappings.find((m) =>
      m.origin === parsed.fieldName || m.target === parsed.fieldName
    );

    if (!enumMapping || !parsed.value) return [];

    const specField = ctx.profile.normalizedFields?.[enumMapping.target];
    const rawField = ctx.profile.fields?.[enumMapping.target];

    if (!specField || !rawField?.values) return [];

    // Derive severity from obligation. Default to "recommended" (WARNING) since the
    // ENUM's existence already implies the field has sufficient obligation.
    const obligationResult = obligationForStandard(specField, ctx.activeStandard);
    const requirement = obligationResult?.requirement ?? "recommended";

    const allowedValues = Object.keys(rawField.values);
    const suggestedValue = ctx.enableSuggestions
      ? findSuggestedValue(parsed.value, allowedValues)
      : undefined;

    return [
      new EnumViolation({
        severity: requirementToSeverity(requirement),
        fieldName: enumMapping.origin,
        targetName: enumMapping.target,
        rowNumber: ctx.rowNum,
        value: parsed.value,
        csvValue: parsed.value,
        enumType: `${ctx.schemaTableName}_${enumMapping.target.toLowerCase()}_enum`,
        allowedValues,
        suggestedValue,
        errorMessage: suggestedValue
          ? `Invalid value "${parsed.value}" (did you mean "${suggestedValue}"?)`
          : `Invalid value "${parsed.value}" (must be one of: ${allowedValues.join(", ")})`,
        validatorType: "enum",
      }),
    ];
  });
}

/**
 * Handle foreign key violation
 *
 * Creates a ForeignKeyViolation when a row references a value that doesn't
 * exist in the referenced table. FK constraints only exist when explicit
 * crossDatasetRules are configured, so we look up the matching rule for
 * proper error context.
 */
function handleForeignKeyViolation(
  parsed: ParsedErrorInfo,
  ctx: ViolationContext,
): Effect.Effect<FieldViolation[]> {
  return Effect.gen(function* (_) {
    // Find the mapping for the FK field from the parsed error
    const fkMapping = parsed.fieldName
      ? ctx.columnMappings.find((m) =>
        m.target === parsed.fieldName || m.origin === parsed.fieldName
      )
      : undefined;

    // Look up the FK rule from config if we have a mapping
    const fkRule = fkMapping
      ? findForeignKeyRule(ctx.currentDataset, fkMapping.target, ctx.crossDatasetRules)
      : undefined;

    // Resolve field names - prefer mapping, fall back to parsed info
    const originField = fkMapping?.origin ?? parsed.fieldName ?? "unknown";
    const targetField = fkMapping?.target ?? parsed.fieldName ?? "unknown";

    // Get the CSV value - fetch from DB if we have a mapping, otherwise use parsed value
    const csvValue = parsed.value ??
      (fkMapping
        ? yield* _(getCsvValue(ctx.connection, ctx.rawTableName, fkMapping.origin, ctx.rowNum))
        : "");

    // Determine requirement and referenced table/field from rule or parsed info
    const requirement = fkRule?.requirement ?? "required";
    const referencedTable = fkRule?.targetDataset ?? parsed.referencedTable ?? "unknown";
    const referencedField = fkRule?.targetField ?? parsed.referencedField ?? targetField;

    // Use shared formatting for error message
    const errorMessage = formatConstraintViolation({
      type: "foreign-key",
      fieldName: targetField,
      value: csvValue,
      message: parsed.message,
      datasetName: ctx.currentDataset,
      fkRule,
      referencedTable: fkRule ? undefined : parsed.referencedTable,
      referencedField: fkRule ? undefined : parsed.referencedField,
    });

    return [
      new ForeignKeyViolation({
        severity: requirementToSeverity(requirement),
        fieldName: originField,
        targetName: targetField,
        rowNumber: ctx.rowNum,
        value: csvValue,
        csvValue,
        referencedTable,
        referencedField,
        errorMessage,
        validatorType: "foreign-key",
        // Include rule params when available for downstream consumers
        ...(fkRule && {
          params: {
            targetDataset: fkRule.targetDataset,
            targetField: fkRule.targetField,
          },
        }),
      }),
    ];
  });
}

/**
 * Create violations from a parsed DuckDB error
 *
 * Uses exhaustive Match pattern matching to handle all error types at compile time.
 * Returns empty array for error types that don't generate violations (check, unknown).
 */
function createViolationsFromError(
  parsed: ParsedErrorInfo,
  ctx: ViolationContext,
): Effect.Effect<FieldViolation[]> {
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
 * Insert rows one-by-one, collecting violations for any that fail
 *
 * This function is used as a fallback when bulk insertion fails due to
 * constraint violations. It inserts each row individually, capturing
 * detailed information about any violations that occur.
 *
 * Uses the error channel pattern for violations:
 * - Success: All rows inserted without constraint violations
 * - Failure: Contains array of FieldViolation objects found during insertion
 *
 * @param connection - DuckDB connection for write operations
 * @param rawTableName - Name of the raw CSV table
 * @param schemaTableName - Name of the schema table to insert into
 * @param columnMappings - Mapping of origin columns to target columns
 * @param profile - Validation profile with field definitions
 * @param validationSettings - Optional validation settings
 * @returns Effect that succeeds with void or fails with FieldViolation[]
 */
export function insertRowByRow(
  connection: DuckDBConnection,
  rawTableName: string,
  schemaTableName: string,
  columnMappings: ColumnMapping[],
  profile: ValidationProfile,
  activeStandard: "obis" | "gbif" | "custom",
  currentDataset: string,
  crossDatasetRules: readonly WorkspaceCrossDatasetRule[],
  validationSettings?: ValidationSettings,
): Effect.Effect<void, FieldViolation[]> {
  return Effect.gen(function* (_) {
    const violations: FieldViolation[] = [];
    const enableSuggestions = validationSettings?.enableSuggestions ?? true;
    const processedDuplicates = new Set<string>();

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

      if (result._tag === "Right") {
        continue;
      }

      const error = result.left;
      if (!(error instanceof Error)) continue;

      // Parse the error to determine violation type
      const parsed = parseDuckDBError(error);

      // Create context for violation handling
      const ctx: ViolationContext = {
        connection,
        rawTableName,
        schemaTableName,
        columnMappings,
        profile,
        activeStandard,
        enableSuggestions,
        rowNum,
        processedDuplicates,
        currentDataset,
        crossDatasetRules,
      };

      // Create violations using Match.exhaustive pattern
      const newViolations = yield* _(createViolationsFromError(parsed, ctx));
      violations.push(...newViolations);
    }

    // Use error channel: succeed if no violations, fail with violations otherwise
    if (violations.length > 0) {
      return yield* _(Effect.fail(violations));
    }
  });
}

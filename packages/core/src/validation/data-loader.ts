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
import * as Result from "effect/Result";

import type { DatasetRuleConfig, ResolvedSpec, ValidationSettings } from "@dwkt/domain/schemas";
import type { FieldViolation } from "@dwkt/domain/types";
import {
  EnumViolation,
  ForeignKeyViolation,
  NotNullViolation,
  PrimaryKeyViolation,
  requirementToSeverity,
} from "@dwkt/domain/types";
import { obligationForStandard } from "@dwkt/domain/specs";

import { getTableValue } from "../loading/table-import.ts";
import type { ParsedErrorInfo } from "../loading/sql.ts";
import {
  escapeString,
  findForeignKeyRule,
  formatConstraintViolation,
  parseDuckDBError,
  queryRows,
} from "../loading/sql.ts";
import { findSuggestedValue } from "./string-matching.ts";

interface ColumnMapping {
  readonly origin: string;
  readonly target: string;
}

interface ViolationContext {
  readonly connection: DuckDBConnection;
  readonly rawTableName: string;
  readonly schemaTableName: string;
  readonly columnMappings: ColumnMapping[];
  readonly resolvedSpec: ResolvedSpec;
  readonly activeStandard: "obis" | "gbif";
  readonly enableSuggestions: boolean;
  readonly rowNum: number;
  readonly processedDuplicates: Set<string>;
  readonly currentDataset: string;
  readonly datasetRules: readonly DatasetRuleConfig[];
}

function handlePrimaryKeyViolation(
  parsed: ParsedErrorInfo,
  ctx: ViolationContext,
): Effect.Effect<FieldViolation[]> {
  return Effect.gen(function* () {
    const pkMapping = ctx.columnMappings.find((m) =>
      m.target === ctx.schemaTableName + "ID" ||
      (m.target.endsWith("ID") &&
        ctx.resolvedSpec.rawFields?.[m.target]?.unique === "true")
    );

    if (
      !pkMapping || !parsed.value ||
      ctx.processedDuplicates.has(parsed.value)
    ) {
      return [];
    }

    const specField = ctx.resolvedSpec.specFields?.[pkMapping.target];
    if (!specField) return [];

    ctx.processedDuplicates.add(parsed.value);

    const duplicateQuery = `
      SELECT _row_number
      FROM ${ctx.rawTableName}
      WHERE "${pkMapping.origin}" = '${escapeString(parsed.value)}'
    `;

    const duplicateRows = yield* queryRows(ctx.connection, duplicateQuery);
    const duplicateCount = duplicateRows.length;
    const violations: FieldViolation[] = [];

    for (const dupRow of duplicateRows) {
      const dupRowNum = Number(dupRow._row_number);

      violations.push(
        new PrimaryKeyViolation({
          severity: requirementToSeverity("required"),
          fieldName: pkMapping.origin,
          targetName: pkMapping.target,
          rowNumber: dupRowNum,
          value: parsed.value,
          constraintType: "duplicate",
          duplicateCount,
          errorMessage: `Duplicate primary key: "${parsed.value}"`,
        }),
      );
    }

    return violations;
  });
}

function handleNotNullViolation(
  parsed: ParsedErrorInfo,
  ctx: ViolationContext,
): Effect.Effect<FieldViolation[]> {
  return Effect.sync(() => {
    const notNullMapping = ctx.columnMappings.find((m) =>
      parsed.fieldName ? m.target === parsed.fieldName : false
    );

    if (!notNullMapping) return [];

    const specField = ctx.resolvedSpec.specFields?.[notNullMapping.target];
    if (!specField) return [];

    return [
      new NotNullViolation({
        severity: requirementToSeverity("required"),
        fieldName: notNullMapping.origin,
        targetName: notNullMapping.target,
        rowNumber: ctx.rowNum,
        value: "",
        errorMessage: `Required field "${notNullMapping.origin}" cannot be NULL`,
      }),
    ];
  });
}

/**
 * Handle enum violation
 *
 * ENUMs are only created for fields whose obligation warrants strict validation
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

    const specField = ctx.resolvedSpec.specFields?.[enumMapping.target];
    const rawField = ctx.resolvedSpec.rawFields?.[enumMapping.target];

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
        enumType: `${ctx.schemaTableName}_${enumMapping.target.toLowerCase()}_enum`,
        allowedValues,
        suggestedValue,
        errorMessage: suggestedValue
          ? `Invalid value "${parsed.value}" (did you mean "${suggestedValue}"?)`
          : `Invalid value "${parsed.value}" (must be one of: ${allowedValues.join(", ")})`,
      }),
    ];
  });
}

function handleForeignKeyViolation(
  parsed: ParsedErrorInfo,
  ctx: ViolationContext,
): Effect.Effect<FieldViolation[]> {
  return Effect.gen(function* () {
    const fkMapping = parsed.fieldName
      ? ctx.columnMappings.find((m) =>
        m.target === parsed.fieldName || m.origin === parsed.fieldName
      )
      : undefined;

    const fkRule = fkMapping
      ? findForeignKeyRule(ctx.currentDataset, fkMapping.target, ctx.datasetRules)
      : undefined;

    const originField = fkMapping?.origin ?? parsed.fieldName ?? "unknown";
    const targetField = fkMapping?.target ?? parsed.fieldName ?? "unknown";

    const csvValue = parsed.value ??
      (fkMapping
        ? yield* getTableValue(ctx.connection, ctx.rawTableName, fkMapping.origin, ctx.rowNum)
        : "");

    const requirement = fkRule?.requirement ?? "required";
    const referencedTable = fkRule?.targetDataset ?? parsed.referencedTable ?? "unknown";
    const referencedField = fkRule?.targetField ?? parsed.referencedField ?? targetField;

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
        referencedTable,
        referencedField,
        errorMessage,
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
 * Fallback for when bulk INSERT fails — inserts each row individually,
 * collecting constraint violations in the error channel.
 */
export function insertRowByRow(
  connection: DuckDBConnection,
  rawTableName: string,
  schemaTableName: string,
  columnMappings: ColumnMapping[],
  resolvedSpec: ResolvedSpec,
  activeStandard: "obis" | "gbif",
  currentDataset: string,
  datasetRules: readonly DatasetRuleConfig[],
  validationSettings?: ValidationSettings,
): Effect.Effect<void, FieldViolation[]> {
  return Effect.gen(function* () {
    const violations: FieldViolation[] = [];
    const enableSuggestions = validationSettings?.enableSuggestions ?? true;
    const processedDuplicates = new Set<string>();

    const maxRows = yield* queryRows(
      connection,
      `SELECT MAX(_row_number) as max_row FROM ${rawTableName}`,
    );
    const maxRow = Number(maxRows[0]?.max_row ?? 0);

    const targetColumns = columnMappings.map((m) => `"${m.target}"`).join(", ");
    const originColumns = columnMappings.map((m) => `"${m.origin}"`).join(", ");

    for (let rowNum = 1; rowNum <= maxRow; rowNum++) {
      const insertSQL = `
        INSERT INTO ${schemaTableName} (${targetColumns}, _row_number)
        SELECT ${originColumns}, _row_number
        FROM ${rawTableName}
        WHERE _row_number = ${rowNum}
      `;

      const result = yield* Effect.tryPromise({
        try: () => connection.run(insertSQL),
        catch: (error) => error,
      }).pipe(Effect.result);

      if (Result.isSuccess(result)) {
        continue;
      }

      const error = result.failure;
      if (!(error instanceof Error)) continue;

      const parsed = parseDuckDBError(error);
      const ctx: ViolationContext = {
        connection,
        rawTableName,
        schemaTableName,
        columnMappings,
        resolvedSpec,
        activeStandard,
        enableSuggestions,
        rowNum,
        processedDuplicates,
        currentDataset,
        datasetRules,
      };

      const newViolations = yield* createViolationsFromError(parsed, ctx);
      violations.push(...newViolations);
    }

    if (violations.length > 0) {
      return yield* Effect.fail(violations);
    }
  });
}

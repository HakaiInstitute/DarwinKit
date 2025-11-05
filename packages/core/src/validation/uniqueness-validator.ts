/**
 * DuckDB-Based Uniqueness Validation
 *
 * Performs uniqueness validation using DuckDB queries against workspace data.
 * Supports simple uniqueness, compound uniqueness, and conditional uniqueness within groups.
 * Data is imported first, then validated to provide rich diagnostic information.
 */

import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import { join } from "@std/path";
import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBConnection as DuckDB } from "@duckdb/node-api";

import type { FieldMapping } from "@dwkt/domain";
import { ErrorCode, getDWCField, isIdentifierField } from "@dwkt/domain";

// Uniqueness validation configuration
export interface UniquenessRule {
  readonly fieldName: string;
  readonly ruleType: "simple" | "compound" | "conditional";
  readonly fields?: ReadonlyArray<string>; // For compound uniqueness
  readonly groupByFields?: ReadonlyArray<string>; // For conditional uniqueness
  readonly allowNulls?: boolean;
}

// Uniqueness violation result with rich DuckDB-sourced information
export interface UniquenessViolation {
  readonly rule: UniquenessRule;
  readonly violationType: "duplicate";
  readonly duplicateValue: string | Record<string, unknown>;
  readonly occurrenceCount: number;
  readonly affectedRows: ReadonlyArray<number>;
  readonly sampleValues?: ReadonlyArray<Record<string, unknown>>; // Sample of actual row data
  readonly suggestion: string;
}

// Workspace connection information
export interface WorkspaceConnection {
  readonly workspaceId: string;
  readonly workspaceDir: string;
  readonly duckdbPath: string;
  readonly tableName: string;
}

// Error class for uniqueness validation
const UniquenessValidationErrorBase = Data.TaggedClass("UniquenessValidationError")<{
  readonly message: string;
  readonly workspaceId: string;
  readonly code: ErrorCode;
  readonly cause?: Error;
}>;
export class UniquenessValidationError extends UniquenessValidationErrorBase {}

/**
 * DuckDB-based uniqueness validator for workspace data
 */
export class UniquenessValidator {
  private readonly workspacesDir: string;

  constructor({ workspacesDir = "./workspaces" }: { workspacesDir?: string } = {}) {
    this.workspacesDir = workspacesDir;
  }

  /**
   * Validate uniqueness constraints for field mappings using workspace DuckDB data
   */
  validateUniqueFields(
    workspaceId: string,
    fieldMappings: ReadonlyArray<FieldMapping>,
  ): Effect.Effect<ReadonlyArray<UniquenessViolation>, UniquenessValidationError> {
    const workspaceDbResource = this.createWorkspaceDbResource(workspaceId);

    return Effect.scoped(
      Effect.gen(function* (_) {
        // Acquire workspace DuckDB connection (guaranteed cleanup)
        const { connection, workspaceConnection } = yield* _(workspaceDbResource);

        // Extract uniqueness rules from field mappings
        const uniquenessRules = extractUniquenessRules(fieldMappings);

        // Validate each uniqueness rule using DuckDB
        const violations: UniquenessViolation[] = [];

        for (const rule of uniquenessRules) {
          const ruleViolations = yield* _(
            validateUniquenessRuleWithDuckDB(connection, workspaceConnection.tableName, rule),
          );
          violations.push(...ruleViolations);
        }

        return violations;
      }),
    );
  }

  /**
   * Create a managed workspace DuckDB connection resource
   *
   * Uses Effect.acquireRelease to guarantee connection cleanup even on errors.
   * The connection is automatically closed when the scope exits.
   */
  private createWorkspaceDbResource(workspaceId: string) {
    const workspacesDir = this.workspacesDir;

    // Acquire: Create and attach DuckDB connection
    const acquire = Effect.gen(function* (_) {
      const workspaceDir = join(workspacesDir, `workspace-${workspaceId}`);
      const duckdbPath = join(workspaceDir, "data.duckdb");

      // Create DuckDB connection
      const connection = yield* _(
        Effect.tryPromise({
          try: () => DuckDB.create(),
          catch: (error) =>
            new UniquenessValidationError({
              message: `Failed to create DuckDB connection: ${error}`,
              workspaceId,
              code: ErrorCode.DATABASE_ERROR,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );

      // Attach workspace database
      yield* _(
        Effect.tryPromise({
          try: () => connection.runAndReadAll(`ATTACH '${duckdbPath}' AS workspace_db`),
          catch: (error) =>
            new UniquenessValidationError({
              message: `Failed to attach workspace database: ${error}`,
              workspaceId,
              code: ErrorCode.DATABASE_ERROR,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );

      const workspaceConnection: WorkspaceConnection = {
        workspaceId,
        workspaceDir,
        duckdbPath,
        tableName: "workspace_data", // Standard table name
      };

      return { connection, workspaceConnection };
    });

    // Release: Close connection (ignores any errors during cleanup)
    const release = (
      resource: { connection: DuckDBConnection; workspaceConnection: WorkspaceConnection },
    ) => Effect.try(() => resource.connection.closeSync()).pipe(Effect.ignore);

    return Effect.acquireRelease(acquire, release);
  }
}

/**
 * Validate uniqueness rule using DuckDB queries
 */
function validateUniquenessRuleWithDuckDB(
  connection: DuckDBConnection,
  tableName: string,
  rule: UniquenessRule,
): Effect.Effect<ReadonlyArray<UniquenessViolation>, UniquenessValidationError> {
  return Effect.gen(function* (_) {
    switch (rule.ruleType) {
      case "simple":
        return yield* _(validateColumnarUniqueness(connection, tableName, rule));
      case "compound":
        return yield* _(validateCompoundUniquenessWithDuckDB(connection, tableName, rule));
      case "conditional":
        return yield* _(validateConditionalUniquenessWithDuckDB(connection, tableName, rule));
      default:
        return [];
    }
  });
}

/**
 * Validate simple field uniqueness using DuckDB
 */
function validateColumnarUniqueness(
  connection: DuckDBConnection,
  tableName: string,
  rule: UniquenessRule,
): Effect.Effect<ReadonlyArray<UniquenessViolation>, UniquenessValidationError> {
  return Effect.gen(function* (_) {
    // Build WHERE clause for null handling
    const nullCondition = rule.allowNulls ? "" : `WHERE "${rule.fieldName}" IS NOT NULL`;

    // Query to find duplicate values with row numbers and counts
    const duplicatesQuery = `
      SELECT
        "${rule.fieldName}" as duplicate_value,
        COUNT(*) as occurrence_count,
        array_agg(row_number() OVER()) as affected_rows
      FROM ${tableName}
      ${nullCondition}
      GROUP BY "${rule.fieldName}"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, "${rule.fieldName}"
    `;

    const duplicatesResult = yield* _(
      Effect.tryPromise({
        try: () => connection.runAndReadAll(duplicatesQuery),
        catch: (error) =>
          new UniquenessValidationError({
            message: `Failed to validate simple uniqueness for field '${rule.fieldName}': ${error}`,
            workspaceId: "unknown",
            code: ErrorCode.VALIDATION_FAILED,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }),
    );

    const duplicates = duplicatesResult.getRowObjects();

    // Convert to UniquenessViolation format
    const violations: UniquenessViolation[] = duplicates.map((duplicate) => ({
      rule,
      violationType: "duplicate",
      duplicateValue: String(duplicate.duplicate_value),
      occurrenceCount: Number(duplicate.occurrence_count),
      affectedRows: Array.isArray(duplicate.affected_rows)
        ? duplicate.affected_rows as number[]
        : [],
      suggestion:
        `Field '${rule.fieldName}' has duplicate value '${duplicate.duplicate_value}' in ${duplicate.occurrence_count} rows. Each ${rule.fieldName} should be unique.`,
    }));

    return violations;
  });
}

/**
 * Validate compound field uniqueness using DuckDB
 */
function validateCompoundUniquenessWithDuckDB(
  connection: DuckDBConnection,
  tableName: string,
  rule: UniquenessRule,
): Effect.Effect<ReadonlyArray<UniquenessViolation>, UniquenessValidationError> {
  return Effect.gen(function* (_) {
    if (!rule.fields || rule.fields.length === 0) {
      return [];
    }

    // Build field list and null condition
    const fieldList = rule.fields.map((f) => `"${f}"`).join(", ");
    const nullCondition = rule.allowNulls
      ? ""
      : `WHERE ${rule.fields.map((f) => `"${f}" IS NOT NULL`).join(" AND ")}`;

    // Query to find compound duplicates
    const duplicatesQuery = `
      SELECT
        ${fieldList},
        COUNT(*) as occurrence_count,
        array_agg(row_number() OVER()) as affected_rows
      FROM ${tableName}
      ${nullCondition}
      GROUP BY ${fieldList}
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `;

    const duplicatesResult = yield* _(
      Effect.tryPromise({
        try: () => connection.runAndReadAll(duplicatesQuery),
        catch: (error) =>
          new UniquenessValidationError({
            message: `Failed to validate compound uniqueness for fields [${
              rule.fields?.join(", ") || "unknown"
            }]: ${error}`,
            workspaceId: "unknown",
            code: ErrorCode.VALIDATION_FAILED,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }),
    );

    const duplicates = duplicatesResult.getRowObjects();

    // Convert to UniquenessViolation format
    const violations: UniquenessViolation[] = duplicates.map((duplicate) => {
      const compoundValue: Record<string, unknown> = {};
      for (const field of rule.fields!) {
        compoundValue[field] = duplicate[field];
      }

      return {
        rule,
        violationType: "duplicate",
        duplicateValue: compoundValue,
        occurrenceCount: Number(duplicate.occurrence_count),
        affectedRows: Array.isArray(duplicate.affected_rows)
          ? duplicate.affected_rows as number[]
          : [],
        suggestion: `Compound key [${
          rule.fields!.join(", ")
        }] has duplicate combination in ${duplicate.occurrence_count} rows. The combination of these fields should be unique.`,
      };
    });

    return violations;
  });
}

/**
 * Validate conditional uniqueness (unique within groups) using DuckDB
 */
function validateConditionalUniquenessWithDuckDB(
  connection: DuckDBConnection,
  tableName: string,
  rule: UniquenessRule,
): Effect.Effect<ReadonlyArray<UniquenessViolation>, UniquenessValidationError> {
  return Effect.gen(function* (_) {
    if (!rule.groupByFields || rule.groupByFields.length === 0) {
      return yield* _(validateColumnarUniqueness(connection, tableName, rule));
    }

    // Build group by and partition clauses
    const groupFields = rule.groupByFields.map((f) => `"${f}"`).join(", ");
    const nullCondition = rule.allowNulls ? "" : `WHERE "${rule.fieldName}" IS NOT NULL`;

    // Query to find duplicates within each group
    const duplicatesQuery = `
      WITH grouped_data AS (
        SELECT
          ${groupFields},
          "${rule.fieldName}",
          COUNT(*) OVER (PARTITION BY ${groupFields}, "${rule.fieldName}") as occurrence_count,
          row_number() OVER () as row_num
        FROM ${tableName}
        ${nullCondition}
      )
      SELECT
        ${groupFields},
        "${rule.fieldName}" as duplicate_value,
        occurrence_count,
        array_agg(row_num) as affected_rows
      FROM grouped_data
      WHERE occurrence_count > 1
      GROUP BY ${groupFields}, "${rule.fieldName}", occurrence_count
      ORDER BY occurrence_count DESC
    `;

    const duplicatesResult = yield* _(
      Effect.tryPromise({
        try: () => connection.runAndReadAll(duplicatesQuery),
        catch: (error) =>
          new UniquenessValidationError({
            message:
              `Failed to validate conditional uniqueness for field '${rule.fieldName}' within groups [${
                rule.groupByFields?.join(", ") || "unknown"
              }]: ${error}`,
            workspaceId: "unknown",
            code: ErrorCode.VALIDATION_FAILED,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }),
    );

    const duplicates = duplicatesResult.getRowObjects();

    // Convert to UniquenessViolation format
    const violations: UniquenessViolation[] = duplicates.map((duplicate) => {
      const groupInfo = rule.groupByFields!.map((field) => `${field}=${duplicate[field]}`).join(
        ", ",
      );

      return {
        rule,
        violationType: "duplicate",
        duplicateValue: String(duplicate.duplicate_value),
        occurrenceCount: Number(duplicate.occurrence_count),
        affectedRows: Array.isArray(duplicate.affected_rows)
          ? duplicate.affected_rows as number[]
          : [],
        suggestion:
          `Field '${rule.fieldName}' has duplicate value '${duplicate.duplicate_value}' within group (${groupInfo}). Values should be unique within each group.`,
      };
    });

    return violations;
  });
}

/**
 * Extract uniqueness rules from Darwin Core field mappings
 */
export function extractUniquenessRules(
  fieldMappings: ReadonlyArray<FieldMapping>,
): ReadonlyArray<UniquenessRule> {
  const rules: UniquenessRule[] = [];

  for (const mapping of fieldMappings) {
    const dwcField = getDWCField(mapping.darwinCoreFieldName);

    // Add uniqueness rule for identifier fields
    if (dwcField && isIdentifierField(dwcField)) {
      rules.push({
        fieldName: mapping.originName,
        ruleType: "simple",
        allowNulls: false, // Identifiers should not allow nulls
      });
    }
  }

  return rules;
}

/**
 * Create a compound uniqueness rule
 */
export function createCompoundUniquenessRule(
  fieldNames: ReadonlyArray<string>,
  allowNulls = false,
): UniquenessRule {
  return {
    fieldName: fieldNames.join("+"), // Composite name
    ruleType: "compound",
    fields: fieldNames,
    allowNulls,
  };
}

/**
 * Create a conditional uniqueness rule (unique within groups)
 */
export function createConditionalUniquenessRule(
  fieldName: string,
  groupByFields: ReadonlyArray<string>,
  allowNulls = false,
): UniquenessRule {
  return {
    fieldName,
    ruleType: "conditional",
    groupByFields,
    allowNulls,
  };
}

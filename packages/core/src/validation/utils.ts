/**
 * Validation utilities - Error classes, violation partitioning, summary calculation, fuzzy matching
 */

import type { DatasetValidationResult, ErrorCode } from "@dwkt/domain";
import * as Data from "effect/Data";
import { levenshteinDistance } from "../utils/string-utils.ts";

/**
 * Error classes for workspace validation
 */
const WorkspaceValidationErrorBase = Data.TaggedError("WorkspaceValidationError")<{
  readonly message: string;
  readonly code: ErrorCode;
  readonly cause?: Error;
}>;

/**
 * Represents an error that occurs during the data importing process.
 */
export class WorkspaceImportError extends WorkspaceValidationErrorBase {}

export class WorkspaceValidationError extends WorkspaceValidationErrorBase {}

// Re-export from domain for backward compatibility
export { partitionFieldViolations } from "@dwkt/domain";

/**
 * Count violations across schema and field violation structures
 */
function countViolations(
  result: DatasetValidationResult,
  level: "errors" | "warnings" | "info",
): number {
  return result.schemaViolations[level].length + result.fieldViolations[level].length;
}

/**
 * Calculate summary statistics across all dataset results
 */
export function calculateSummary(datasetResults: readonly DatasetValidationResult[]): {
  readonly totalDatasets: number;
  readonly datasetsPassedCount: number;
  readonly datasetsWithWarningsCount: number;
  readonly datasetsFailedCount: number;
  readonly totalErrors: number;
  readonly totalWarnings: number;
  readonly totalInfo: number;
  readonly totalRowsProcessed: number;
} {
  let datasetsPassedCount = 0;
  let datasetsWithWarningsCount = 0;
  let datasetsFailedCount = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalInfo = 0;
  let totalRowsProcessed = 0;

  for (const result of datasetResults) {
    totalRowsProcessed += result.rowsProcessed;
    totalErrors += countViolations(result, "errors");
    totalWarnings += countViolations(result, "warnings");
    totalInfo += countViolations(result, "info");

    // Increment dataset status counter based on status
    if (result.status === "pass") {
      datasetsPassedCount++;
    } else if (result.status === "warn") {
      datasetsWithWarningsCount++;
    } else {
      datasetsFailedCount++;
    }
  }

  return {
    totalDatasets: datasetResults.length,
    datasetsPassedCount,
    datasetsWithWarningsCount,
    datasetsFailedCount,
    totalErrors,
    totalWarnings,
    totalInfo,
    totalRowsProcessed,
  };
}

type ParsedErrorType = "primary-key" | "not-null" | "enum" | "foreign-key" | "check" | "unknown";

/**
 * Parse DuckDB error into structured violation information
 */
export interface ParsedErrorInfo {
  readonly type: ParsedErrorType;
  readonly fieldName?: string;
  readonly value?: string;
  readonly referencedTable?: string;
  readonly referencedField?: string;
  readonly message: string;
}

export function parseDuckDBError(error: Error): ParsedErrorInfo {
  const message = error.message;

  // Primary key violations
  const primaryKeyMatch = message.match(
    /PRIMARY KEY or UNIQUE constraint violation: duplicate key "([^"]+)"|Duplicate key "(?:\w+:\s*)?([^"]+)" violates primary key constraint/,
  );
  if (primaryKeyMatch) {
    return {
      type: "primary-key",
      message,
      value: primaryKeyMatch[1] || primaryKeyMatch[2],
    };
  }

  // NOT NULL violations
  const notNullMatch = message.match(/NOT NULL constraint failed:?\s*(.+)?/i);
  if (notNullMatch) {
    return {
      type: "not-null",
      message,
      fieldName: notNullMatch[1]?.trim(),
    };
  }

  // ENUM violations
  const enumMatch = message.match(/Could not convert string '([^']+)'.+from source column (\w+)/);
  if (enumMatch) {
    return {
      type: "enum",
      message,
      value: enumMatch[1],
      fieldName: enumMatch[2],
    };
  }

  // Foreign key violations
  if (/FOREIGN KEY constraint|Violates foreign key constraint/i.test(message)) {
    const detailMatch = message.match(/key "([^:]+):\s*([^"]+)" does not exist/) ||
      message.match(/key "([^"]+)" does not exist/);

    return {
      type: "foreign-key",
      message,
      ...(detailMatch?.[2]
        ? { fieldName: detailMatch[1], value: detailMatch[2] }
        : detailMatch?.[1]
        ? { value: detailMatch[1] }
        : {}),
    };
  }

  // CHECK constraint violations
  if (/CHECK constraint/i.test(message)) {
    return { type: "check", message };
  }

  return { type: "unknown", message };
}

/**
 * Find suggested value using fuzzy matching (Levenshtein distance)
 */
export function findSuggestedValue(
  invalidValue: string,
  allowedValues: ReadonlyArray<string>,
  threshold: number = 3,
): string | undefined {
  let bestMatch: string | undefined;
  let bestDistance = threshold;

  for (const allowed of allowedValues) {
    const distance = levenshteinDistance(invalidValue, allowed);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = allowed;
    }
  }

  return bestMatch;
}

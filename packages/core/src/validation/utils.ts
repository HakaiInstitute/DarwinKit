/**
 * Validation Utilities
 *
 * Shared utility functions for validation operations including
 * error parsing, fuzzy matching, and result aggregation.
 *
 * @module validation/utils
 */

import type { DatasetValidationResult, ValidationViolation } from "@dwkt/domain";
import { levenshteinDistance } from "../utils/string-utils.ts";

/**
 * Parsed DuckDB error information
 */
export interface ParsedErrorInfo {
  readonly type:
    | "primary-key"
    | "not-null"
    | "enum"
    | "foreign-key"
    | "check"
    | "unknown";
  readonly fieldName?: string;
  readonly value?: string;
  readonly message: string;
}

/**
 * Parse DuckDB error into structured violation information
 *
 * Extracts violation type, field name, and value from DuckDB error messages
 * to create actionable error information.
 *
 * @param error - The DuckDB error to parse
 * @returns Structured error information
 */
export function parseDuckDBError(error: Error): ParsedErrorInfo {
  const message = error.message;

  // PRIMARY KEY or UNIQUE constraint violation
  // Example 1: "Constraint Error: PRIMARY KEY or UNIQUE constraint violation: duplicate key "E1""
  // Example 2: "Constraint Error: Duplicate key "eventID: E1" violates primary key constraint."
  let pkMatch = message.match(
    /PRIMARY KEY or UNIQUE constraint violation: duplicate key "([^"]+)"/,
  );
  if (pkMatch) {
    return {
      type: "primary-key",
      value: pkMatch[1],
      message,
    };
  }

  // Alternative format for duplicate keys
  pkMatch = message.match(
    /Duplicate key "(?:\w+:\s*)?([^"]+)" violates primary key constraint/,
  );
  if (pkMatch) {
    return {
      type: "primary-key",
      value: pkMatch[1],
      message,
    };
  }

  // NOT NULL constraint violation
  // Example: "Constraint Error: NOT NULL constraint failed: column_name"
  const notNullMatch = message.match(/NOT NULL constraint failed:?\s*(.+)?/i);
  if (notNullMatch) {
    return {
      type: "not-null",
      fieldName: notNullMatch[1]?.trim(),
      message,
    };
  }

  // ENUM/Type conversion error
  // Example: "Conversion Error: Could not convert string 'InvalidBasis' to UINT8 when casting from source column basisOfRecord"
  const enumMatch = message.match(
    /Could not convert string '([^']+)'.+from source column (\w+)/,
  );
  if (enumMatch) {
    return {
      type: "enum",
      value: enumMatch[1],
      fieldName: enumMatch[2],
      message,
    };
  }

  // FOREIGN KEY constraint violation
  const fkMatch = message.match(/FOREIGN KEY constraint/i);
  if (fkMatch) {
    return {
      type: "foreign-key",
      message,
    };
  }

  // CHECK constraint violation
  const checkMatch = message.match(/CHECK constraint/i);
  if (checkMatch) {
    return {
      type: "check",
      message,
    };
  }

  return {
    type: "unknown",
    message,
  };
}

/**
 * Find suggested value using fuzzy matching (Levenshtein distance)
 *
 * Useful for providing helpful suggestions when a user enters
 * an invalid vocabulary value.
 *
 * @param invalidValue - The invalid value entered by the user
 * @param allowedValues - Array of valid values to match against
 * @param threshold - Maximum edit distance to consider (default: 3)
 * @returns The closest matching value, or undefined if none within threshold
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

/**
 * Partition violations by severity level
 *
 * Groups violations into errors (required), warnings (recommended),
 * and info (optional) based on their enforcement level.
 *
 * @param violations - Array of violations to partition
 * @returns Object with errors, warnings, and info arrays
 */
export function partitionViolations(
  violations: ReadonlyArray<ValidationViolation>,
): {
  readonly errors: ValidationViolation[];
  readonly warnings: ValidationViolation[];
  readonly info: ValidationViolation[];
} {
  const errors: ValidationViolation[] = [];
  const warnings: ValidationViolation[] = [];
  const info: ValidationViolation[] = [];

  for (const violation of violations) {
    switch (violation.enforcement) {
      case "required":
        errors.push(violation);
        break;
      case "recommended":
        warnings.push(violation);
        break;
      case "optional":
        info.push(violation);
        break;
    }
  }

  return { errors, warnings, info };
}

/**
 * Summary statistics for validation results
 */
export interface ValidationSummary {
  readonly totalDatasets: number;
  readonly datasetsPassedCount: number;
  readonly datasetsWithWarningsCount: number;
  readonly datasetsFailedCount: number;
  readonly totalErrors: number;
  readonly totalWarnings: number;
  readonly totalInfo: number;
  readonly totalRowsProcessed: number;
}

/**
 * Calculate summary statistics across all dataset results
 *
 * @param datasetResults - Array of dataset validation results
 * @returns Summary statistics
 */
export function calculateSummary(
  datasetResults: readonly DatasetValidationResult[],
): ValidationSummary {
  let datasetsPassedCount = 0;
  let datasetsWithWarningsCount = 0;
  let datasetsFailedCount = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalInfo = 0;
  let totalRowsProcessed = 0;

  for (const result of datasetResults) {
    totalRowsProcessed += result.rowsProcessed;

    // Count violations by severity from partitioned structure
    totalErrors += result.violations.errors.length;
    totalWarnings += result.violations.warnings.length;
    totalInfo += result.violations.info.length;

    // Also count old-style errors for backward compatibility
    totalErrors += result.typeErrors.length + result.requiredFieldErrors.length;
    totalWarnings += result.warnings.length;

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

/**
 * Determine overall validation status from summary
 *
 * @param summary - Validation summary
 * @returns "pass", "warn", or "fail"
 */
export function determineOverallStatus(
  summary: ValidationSummary,
): "pass" | "warn" | "fail" {
  if (summary.datasetsFailedCount > 0 || summary.totalErrors > 0) {
    return "fail";
  }
  if (summary.datasetsWithWarningsCount > 0 || summary.totalWarnings > 0) {
    return "warn";
  }
  return "pass";
}

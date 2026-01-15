/**
 * Schema Violation Types
 *
 * Defines violation types for schema-level / structural issues that exist
 * regardless of data values. These are distinct from FieldViolations which
 * represent row-level data validation failures.
 *
 * Schema violations are detected during setup/configuration phase, before
 * any data processing occurs. Examples:
 * - Required field not found in CSV
 * - Field not mapped to Darwin Core target
 * - Unknown profile/spec referenced
 * - Field not defined in profile
 */

import { Data } from "effect";
import type { ErrorSeverity } from "../errors/severity.ts";
import type { EnforcementLevel } from "../specs/validators.ts";
import type { PartitionedViolations } from "./validation-violation.ts";

/**
 * Common fields shared by all schema violations
 *
 * Unlike FieldViolationBase, this does NOT include row-level fields
 * (rowNumber, value, csvValue, transformedValue, transformationChain)
 * because schema violations are structural issues, not data issues.
 */
interface SchemaViolationBase {
  readonly enforcement: EnforcementLevel;
  readonly severity: ErrorSeverity;
  readonly fieldName: string;
  readonly targetName: string;
  readonly errorMessage: string;
  readonly validatorType: "schema";
}

/**
 * Missing field violation - required/recommended field not found or not mapped
 *
 * @example Required field not in CSV
 * ```typescript
 * new MissingFieldViolation({
 *   enforcement: "required",
 *   severity: ErrorSeverity.ERROR,
 *   fieldName: "eventID",
 *   targetName: "eventID",
 *   errorMessage: "Required field 'eventID' not found in CSV",
 *   validatorType: "schema",
 *   reason: "not_in_csv",
 * });
 * ```
 *
 * @example Strongly recommended field not mapped
 * ```typescript
 * new MissingFieldViolation({
 *   enforcement: "recommended",
 *   severity: ErrorSeverity.WARNING,
 *   fieldName: "coordinateUncertaintyInMeters",
 *   targetName: "coordinateUncertaintyInMeters",
 *   errorMessage: "Strongly recommended field 'coordinateUncertaintyInMeters' not mapped",
 *   validatorType: "schema",
 *   reason: "not_mapped",
 * });
 * ```
 */
export class MissingFieldViolation extends Data.TaggedClass("MissingFieldViolation")<
  SchemaViolationBase & {
    readonly reason: "not_in_csv" | "not_mapped";
  }
> {}

/**
 * Unknown profile violation - referenced profile/spec not found or invalid
 *
 * @example Profile not found
 * ```typescript
 * new UnknownProfileViolation({
 *   enforcement: "required",
 *   severity: ErrorSeverity.ERROR,
 *   fieldName: "",
 *   targetName: "",
 *   errorMessage: "Profile 'unknown-profile' not found in registry",
 *   validatorType: "schema",
 *   profileId: "unknown-profile",
 *   reason: "not_found",
 * });
 * ```
 */
export class UnknownProfileViolation extends Data.TaggedClass("UnknownProfileViolation")<
  SchemaViolationBase & {
    readonly profileId: string;
    readonly reason: "not_found" | "invalid";
  }
> {}

/**
 * Unknown field violation - mapped field not defined in the profile
 *
 * @example Field not in profile
 * ```typescript
 * new UnknownFieldViolation({
 *   enforcement: "required",
 *   severity: ErrorSeverity.ERROR,
 *   fieldName: "customField",
 *   targetName: "customField",
 *   errorMessage: "Field 'customField' not defined in profile 'dwc-event'",
 *   validatorType: "schema",
 *   profileId: "dwc-event",
 * });
 * ```
 */
export class UnknownFieldViolation extends Data.TaggedClass("UnknownFieldViolation")<
  SchemaViolationBase & {
    readonly profileId: string;
  }
> {}

/**
 * Discriminated union of all schema violation types
 *
 * Use the provided type guard helpers for filtering:
 *
 * @example Type guard filtering
 * ```typescript
 * const missingFields = violations.filter(isMissingFieldViolation);
 * const unknownProfiles = violations.filter(isUnknownProfileViolation);
 * ```
 */
export type SchemaViolation =
  | MissingFieldViolation
  | UnknownProfileViolation
  | UnknownFieldViolation;

/**
 * Type guard helper for MissingFieldViolation
 */
export function isMissingFieldViolation(v: SchemaViolation): v is MissingFieldViolation {
  return v._tag === "MissingFieldViolation";
}

/**
 * Type guard helper for UnknownProfileViolation
 */
export function isUnknownProfileViolation(v: SchemaViolation): v is UnknownProfileViolation {
  return v._tag === "UnknownProfileViolation";
}

/**
 * Type guard helper for UnknownFieldViolation
 */
export function isUnknownFieldViolation(v: SchemaViolation): v is UnknownFieldViolation {
  return v._tag === "UnknownFieldViolation";
}

/**
 * Partition schema violations by enforcement level
 *
 * @param violations - Array of schema violations to partition
 * @returns Object with errors, warnings, and info arrays
 *
 * @example
 * ```typescript
 * const partitioned = partitionSchemaViolations(allSchemaViolations);
 * console.log(`${partitioned.errors.length} schema errors`);
 * console.log(`${partitioned.warnings.length} schema warnings`);
 * ```
 */
export function partitionSchemaViolations(
  violations: ReadonlyArray<SchemaViolation>,
): PartitionedViolations<SchemaViolation> {
  const errors: SchemaViolation[] = [];
  const warnings: SchemaViolation[] = [];
  const info: SchemaViolation[] = [];

  for (const v of violations) {
    switch (v.enforcement) {
      case "required":
        errors.push(v);
        break;
      case "recommended":
        warnings.push(v);
        break;
      case "optional":
        info.push(v);
        break;
    }
  }

  return { errors, warnings, info };
}

/**
 * Create an empty partitioned schema violations object
 */
export function emptyPartitionedSchemaViolations(): PartitionedViolations<SchemaViolation> {
  return { errors: [], warnings: [], info: [] };
}

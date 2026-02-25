/**
 * Schema Violation Types
 *
 * Defines typed data classes for schema-level validation violations. These represent
 * structural issues detected before data validation (missing fields, unknown profiles, etc.)
 *
 * Schema violations are separate from field violations:
 * - SchemaViolation: Structural issues (missing columns, unknown profiles, unmapped columns)
 * - FieldViolation: Data issues (invalid values, range violations, duplicates)
 *
 * Both use Schema.TaggedClass and flow through the success channel.
 */

import { Schema } from "effect";
import type { PartitionedViolations } from "./validation-violation.ts";

/**
 * Base fields shared by all schema violations
 *
 * Note: No rowNumber since schema violations are structural, not row-level.
 */
const baseSchemaViolationFields = {
  severity: Schema.Union(
    Schema.Literal("error"),
    Schema.Literal("warning"),
    Schema.Literal("info"),
  ),
  fieldName: Schema.String,
  targetName: Schema.String,
  errorMessage: Schema.String,
  validatorType: Schema.Literal("schema"),
};

/**
 * Missing field violation - field required by profile is not in CSV or not mapped
 */
export class MissingFieldViolation
  extends Schema.TaggedClass<MissingFieldViolation>()("MissingFieldViolation", {
    ...baseSchemaViolationFields,
    reason: Schema.Union(
      Schema.Literal("not_in_csv"),
      Schema.Literal("not_mapped"),
    ),
  }) {}

/**
 * Unknown profile violation - specified profile does not exist in registry
 */
export class UnknownProfileViolation
  extends Schema.TaggedClass<UnknownProfileViolation>()("UnknownProfileViolation", {
    ...baseSchemaViolationFields,
    profileId: Schema.String,
    reason: Schema.Union(
      Schema.Literal("not_found"),
      Schema.Literal("invalid"),
    ),
  }) {}

/**
 * Unknown field violation - mapped field does not exist in the profile
 */
export class UnknownFieldViolation
  extends Schema.TaggedClass<UnknownFieldViolation>()("UnknownFieldViolation", {
    ...baseSchemaViolationFields,
    profileId: Schema.String,
  }) {}

/**
 * Unmapped column violation - CSV column is not mapped to any Darwin Core field
 */
export class UnmappedColumnViolation
  extends Schema.TaggedClass<UnmappedColumnViolation>()("UnmappedColumnViolation", {
    ...baseSchemaViolationFields,
    datasetName: Schema.String,
  }) {}

/**
 * Missing mapping violation - field exists in CSV but mapping references wrong origin name
 */
export class MissingMappingViolation
  extends Schema.TaggedClass<MissingMappingViolation>()("MissingMappingViolation", {
    ...baseSchemaViolationFields,
    datasetName: Schema.String,
  }) {}

/**
 * Discriminated union of all schema validation violation types
 */
export type SchemaViolation =
  | MissingFieldViolation
  | UnknownProfileViolation
  | UnknownFieldViolation
  | UnmappedColumnViolation
  | MissingMappingViolation;

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
 * Type guard helper for UnmappedColumnViolation
 */
export function isUnmappedColumnViolation(v: SchemaViolation): v is UnmappedColumnViolation {
  return v._tag === "UnmappedColumnViolation";
}

/**
 * Type guard helper for MissingMappingViolation
 */
export function isMissingMappingViolation(v: SchemaViolation): v is MissingMappingViolation {
  return v._tag === "MissingMappingViolation";
}

/**
 * Partition schema violations by severity level
 *
 * Groups violations into errors, warnings, and info based on their
 * severity level.
 *
 * @param violations - Array of violations to partition
 * @returns Partitioned violations object
 */
export function partitionSchemaViolations(
  violations: ReadonlyArray<SchemaViolation>,
): PartitionedViolations<SchemaViolation> {
  const errors: SchemaViolation[] = [];
  const warnings: SchemaViolation[] = [];
  const info: SchemaViolation[] = [];

  for (const violation of violations) {
    switch (violation.severity) {
      case "error":
        errors.push(violation);
        break;
      case "warning":
        warnings.push(violation);
        break;
      case "info":
        info.push(violation);
        break;
    }
  }

  return { errors, warnings, info };
}

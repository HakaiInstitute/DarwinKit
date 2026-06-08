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
 * Both use S.TaggedClass and flow through the success channel.
 */

import * as S from "effect/Schema";
import {
  type PartitionedViolations,
  partitionViolationsBySeverity,
} from "./validation-violation.ts";

/**
 * Base fields shared by all schema violations
 *
 * Note: No rowNumber since schema violations are structural, not row-level.
 */
const baseSchemaViolationFields = {
  severity: S.Literals(["error", "warning", "info"]),
  fieldName: S.String,
  targetName: S.String,
  errorMessage: S.String,
};

/**
 * Missing field violation - field required by profile is not in CSV or not mapped
 */
export class MissingFieldViolation
  extends S.TaggedClass<MissingFieldViolation>()("MissingFieldViolation", {
    ...baseSchemaViolationFields,
    reason: S.Literals(["not_in_csv", "not_mapped"]),
  }) {}

/**
 * Unknown profile violation - specified profile does not exist in registry
 */
export class UnknownProfileViolation
  extends S.TaggedClass<UnknownProfileViolation>()("UnknownProfileViolation", {
    ...baseSchemaViolationFields,
    profileId: S.String,
    reason: S.Literals(["not_found", "invalid"]),
  }) {}

/**
 * Unknown field violation - mapped field does not exist in the profile
 */
export class UnknownFieldViolation
  extends S.TaggedClass<UnknownFieldViolation>()("UnknownFieldViolation", {
    ...baseSchemaViolationFields,
    profileId: S.String,
  }) {}

/**
 * Unmapped column violation - CSV column is not mapped to any Darwin Core field
 */
export class UnmappedColumnViolation
  extends S.TaggedClass<UnmappedColumnViolation>()("UnmappedColumnViolation", {
    ...baseSchemaViolationFields,
    datasetName: S.String,
  }) {}

/**
 * Missing mapping violation - field exists in CSV but mapping references wrong origin name
 */
export class MissingMappingViolation
  extends S.TaggedClass<MissingMappingViolation>()("MissingMappingViolation", {
    ...baseSchemaViolationFields,
    datasetName: S.String,
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
  return partitionViolationsBySeverity(violations);
}

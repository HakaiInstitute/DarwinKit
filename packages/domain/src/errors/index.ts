/**
 * Domain Error Tag Types
 *
 * Type-only exports for validation violation tags to enable IDE autocomplete
 * and type safety when writing tests. These tags are derived directly from
 * the FieldViolation classes using TypeScript's type system, ensuring
 * they stay in sync automatically.
 *
 * Usage in tests:
 * ```typescript
 * import type { FieldViolationTag } from "@dwkt/domain/errors";
 * import { isRangeViolation } from "@dwkt/domain";
 *
 * const rangeViolations = result.violations.filter(isRangeViolation);
 * // Or filter by tag directly:
 * const violations = result.violations.filter(
 *   v => v._tag === "RangeViolation" as FieldViolationTag
 * );
 * ```
 *
 * Re-exports from other error modules:
 */
export { ErrorCode } from "./codes.ts";
export { ErrorSeverity } from "./severity.ts";

// Import violation classes to extract their tags
import type {
  CrossDatasetViolation,
  EnumViolation,
  ForeignKeyViolation,
  NotNullViolation,
  PrimaryKeyViolation,
  RangeViolation,
  TemporalViolation,
  UniquenessViolation,
  VocabularyViolation,
} from "../types/validation-violation.ts";

/**
 * Union type of all validation violation tags
 *
 * Tags are extracted directly from violation class _tag properties using
 * InstanceType<typeof ViolationClass>["_tag"]. This ensures the types stay
 * in sync with the actual violation definitions automatically.
 *
 * These represent different types of data quality violations detected
 * during workspace validation:
 * - RangeViolation: Numeric/date values outside allowed range
 * - VocabularyViolation: Values not in controlled vocabulary
 * - UniquenessViolation: Duplicate identifiers
 * - TemporalViolation: Invalid date/time consistency
 * - CrossDatasetViolation: Foreign key violations across datasets
 * - PrimaryKeyViolation: Primary key constraint violations
 * - NotNullViolation: Required field is null
 * - EnumViolation: Value not in allowed enum
 * - ForeignKeyViolation: Referenced value doesn't exist
 */
export type FieldViolationTag =
  | InstanceType<typeof RangeViolation>["_tag"]
  | InstanceType<typeof VocabularyViolation>["_tag"]
  | InstanceType<typeof UniquenessViolation>["_tag"]
  | InstanceType<typeof TemporalViolation>["_tag"]
  | InstanceType<typeof CrossDatasetViolation>["_tag"]
  | InstanceType<typeof PrimaryKeyViolation>["_tag"]
  | InstanceType<typeof NotNullViolation>["_tag"]
  | InstanceType<typeof EnumViolation>["_tag"]
  | InstanceType<typeof ForeignKeyViolation>["_tag"];

/**
 * Domain Error Tag Types
 *
 * Type-only exports for validation violation tags to enable IDE autocomplete
 * and type safety when writing tests. These tags are derived directly from
 * the ValidationViolation classes using TypeScript's type system, ensuring
 * they stay in sync automatically.
 *
 * Usage in tests:
 * ```typescript
 * import type { ValidationViolationTag } from "@dwkt/domain/errors";
 * import { isRangeViolation } from "@dwkt/domain";
 *
 * const rangeViolations = result.violations.filter(isRangeViolation);
 * // Or filter by tag directly:
 * const violations = result.violations.filter(
 *   v => v._tag === "RangeViolation" as ValidationViolationTag
 * );
 * ```
 *
 * Re-exports from other error modules:
 */
export { ErrorSeverity } from "./severity.ts";

// Import violation classes to extract their tags

export { createTaggedFormatter, prettyPrintCause } from "./cause-formatter.ts";

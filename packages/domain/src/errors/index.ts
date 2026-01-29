/**
 * Domain Error Utilities
 *
 * Re-exports error handling utilities including severity levels and
 * cause formatting helpers.
 *
 * For violation type guards, import directly from "@dwkt/domain":
 * ```typescript
 * import { isRangeViolation, isPrimaryKeyViolation } from "@dwkt/domain";
 *
 * const rangeErrors = violations.filter(isRangeViolation);
 * ```
 *
 * Re-exports from other error modules:
 */
export { ErrorSeverity } from "./severity.ts";

// Import violation classes to extract their tags

export { createTaggedFormatter, prettyPrintCause } from "./cause-formatter.ts";

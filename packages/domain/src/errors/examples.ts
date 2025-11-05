/**
 * Example: Creating enriched errors for better CLI presentation
 *
 * Demonstrates how to enhance TaggedError classes with metadata
 * for consistent error handling and user-friendly messages
 */

import * as Data from "effect/Data";
import { ErrorCode } from "./codes.ts";
import type { EnrichedError, SimpleErrorMetadata } from "./severity.ts";
import { ErrorSeverity } from "./severity.ts";

/**
 * Example: Field validation error with configurable severity
 *
 * This demonstrates the recommended pattern for enriched errors:
 * - Extends Data.TaggedError for Effect integration
 * - Implements EnrichedError interface
 * - Provides metadata for CLI presentation
 * - Can be used as ERROR or WARNING based on context
 *
 * @example
 * ```typescript
 * // Critical validation failure
 * const error = new FieldValidationError({
 *   message: "eventID is required",
 *   fieldName: "eventID",
 *   value: null,
 * }, ErrorSeverity.ERROR);
 *
 * // Non-critical validation warning
 * const warning = new FieldValidationError({
 *   message: "year is missing but eventDate is present",
 *   fieldName: "year",
 *   value: null,
 * }, ErrorSeverity.WARNING);
 * ```
 */
export class FieldValidationError extends Data.TaggedError("FieldValidationError")<{
  readonly message: string;
  readonly fieldName: string;
  readonly value: unknown;
}> implements EnrichedError {
  readonly code = ErrorCode.VALIDATION_FAILED;
  readonly metadata: SimpleErrorMetadata;

  constructor(
    props: {
      readonly message: string;
      readonly fieldName: string;
      readonly value: unknown;
    },
    severity: ErrorSeverity = ErrorSeverity.ERROR,
  ) {
    super(props);

    this.metadata = {
      severity,
      userMessage: `Invalid value for field "${props.fieldName}"`,
      hint: `Check the expected format for "${props.fieldName}"`,
      suggestedActions: [
        `Review the "${props.fieldName}" field in your data`,
        "Consult the Darwin Core specification for field requirements",
      ],
    };
  }
}

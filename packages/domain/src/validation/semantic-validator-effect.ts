/**
 * Effect-Based Validation Flow for Semantic Types
 *
 * Demonstrates:
 * - Hybrid validation (intrinsic + external) using Effect
 * - Composable validation with Effect.all()
 * - Integration with Effect Schema
 * - Async validation support
 * - Type-safe error handling
 */

import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as S from "effect/Schema";
import type { ValidatorConfig } from "../specs/validators.ts";
import { isSemanticValue, unwrap, ValidationError } from "../types/semantic-values.ts";

/**
 * Validation result with both intrinsic and external errors
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  readonly intrinsicErrors: readonly ValidationError[];
  readonly externalErrors: readonly ValidationError[];
}

/**
 * Helper to create an external validation error
 */
export function externalError(message: string, value: unknown): ValidationError {
  return new ValidationError({
    message,
    value: String(value),
  });
}

/**
 * Run multiple validations and collect all errors
 *
 * Uses Effect.all with mode: "validate" to continue validation even if some fail
 */
export function runValidations(
  intrinsicValidations: Array<Effect.Effect<void, ValidationError, never>>,
  externalValidations: Array<Effect.Effect<void, ValidationError, never>>,
): Effect.Effect<ValidationResult, never, never> {
  return Effect.gen(function* (_) {
    // Run intrinsic validations
    const intrinsicResult = yield* _(
      Effect.exit(
        Effect.all(intrinsicValidations, { concurrency: "unbounded", mode: "validate" }),
      ),
    );

    // Run external validations
    const externalResult = yield* _(
      Effect.exit(
        Effect.all(externalValidations, { concurrency: "unbounded", mode: "validate" }),
      ),
    );

    const intrinsicErrors: ValidationError[] = [];
    const externalErrors: ValidationError[] = [];

    // Collect intrinsic errors
    if (intrinsicResult._tag === "Failure") {
      const causes = Cause.failures(intrinsicResult.cause);
      for (const cause of causes) {
        // Cause.failures returns Option values, extract the Some values
        intrinsicErrors.push(cause as unknown as ValidationError);
      }
    }

    // Collect external errors
    if (externalResult._tag === "Failure") {
      const causes = Cause.failures(externalResult.cause);
      for (const cause of causes) {
        // Cause.failures returns Option values, extract the Some values
        externalErrors.push(cause as unknown as ValidationError);
      }
    }

    const allErrors = [...intrinsicErrors, ...externalErrors];

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      intrinsicErrors,
      externalErrors,
    };
  });
}

/**
 * Validate a value with both intrinsic and external validators
 *
 * Returns Effect that collects all validation errors
 * Uses Effect.all with mode: "validate" to run all validations even if some fail
 */
export function validateWithSemantics(
  value: unknown,
  externalValidators: ReadonlyArray<ValidatorConfig>,
): Effect.Effect<ValidationResult, never, never> {
  return Effect.gen(function* (_) {
    const intrinsicValidations: Array<Effect.Effect<void, ValidationError, never>> = [];
    const externalValidations: Array<Effect.Effect<void, ValidationError, never>> = [];

    // Step 1: Intrinsic validation (if semantic type has it)
    // Only Coordinate type currently has validateIntrinsic method
    if (
      isSemanticValue(value) &&
      "validateIntrinsic" in value &&
      typeof value.validateIntrinsic === "function"
    ) {
      intrinsicValidations.push(value.validateIntrinsic());
    }

    // Step 2: External validators (from FieldDefinition)
    for (const validatorConfig of externalValidators) {
      externalValidations.push(applyExternalValidator(value, validatorConfig));
    }

    // Run all validations and collect all errors
    return yield* _(runValidations(intrinsicValidations, externalValidations));
  });
}

/**
 * Apply a single external validator
 * Returns Effect that succeeds or fails with ValidationError
 */
function applyExternalValidator(
  value: unknown,
  config: ValidatorConfig,
): Effect.Effect<void, ValidationError, never> {
  // Unwrap semantic type to get primitive value
  const primitiveValue = unwrap(value);

  switch (config.type) {
    case "required":
      return validateRequired(primitiveValue, config);
    case "unique":
      // Uniqueness is dataset-wide - handled separately
      return Effect.void;
    case "range":
      return validateRange(primitiveValue, config);
    case "length":
      return validateLength(primitiveValue, config);
    case "format":
      return validateFormat(primitiveValue, config);
    case "pattern":
      return validatePattern(primitiveValue, config);
    default:
      return Effect.void;
  }
}

/**
 * Validate required fields
 */
function validateRequired(
  value: unknown,
  config: ValidatorConfig,
): Effect.Effect<void, ValidationError, never> {
  const { allowEmpty = false, allowWhitespace = false } = config.params || {};

  if (value === null || value === undefined) {
    return Effect.fail(
      externalError(
        config.message || "Field is required and cannot be null",
        value,
      ),
    );
  }

  if (typeof value === "string") {
    if (!allowEmpty && value.length === 0) {
      return Effect.fail(
        externalError(
          config.message || "Field is required and cannot be empty",
          value,
        ),
      );
    }

    if (!allowWhitespace && value.trim().length === 0) {
      return Effect.fail(
        externalError(
          config.message || "Field is required and cannot be whitespace",
          value,
        ),
      );
    }
  }

  return Effect.void;
}

/**
 * Validate numeric range
 */
function validateRange(
  value: unknown,
  config: ValidatorConfig,
): Effect.Effect<void, ValidationError, never> {
  if (typeof value !== "number") {
    return Effect.void; // Type validation is separate
  }

  const { min, max, inclusive = true } = config.params || {};

  if (min !== undefined) {
    if (inclusive && value < min) {
      return Effect.fail(
        externalError(config.message || `Value must be >= ${min}`, value),
      );
    }
    if (!inclusive && value <= min) {
      return Effect.fail(
        externalError(config.message || `Value must be > ${min}`, value),
      );
    }
  }

  if (max !== undefined) {
    if (inclusive && value > max) {
      return Effect.fail(
        externalError(config.message || `Value must be <= ${max}`, value),
      );
    }
    if (!inclusive && value >= max) {
      return Effect.fail(
        externalError(config.message || `Value must be < ${max}`, value),
      );
    }
  }

  return Effect.void;
}

/**
 * Validate string length
 */
function validateLength(
  value: unknown,
  config: ValidatorConfig,
): Effect.Effect<void, ValidationError, never> {
  if (typeof value !== "string") {
    return Effect.void;
  }

  const { minLength, maxLength } = config.params || {};

  if (minLength !== undefined && value.length < minLength) {
    return Effect.fail(
      externalError(
        config.message || `Length must be at least ${minLength}`,
        value,
      ),
    );
  }

  if (maxLength !== undefined && value.length > maxLength) {
    return Effect.fail(
      externalError(
        config.message || `Length must be at most ${maxLength}`,
        value,
      ),
    );
  }

  return Effect.void;
}

/**
 * Validate format using Effect Schema
 */
function validateFormat(
  value: unknown,
  config: ValidatorConfig,
): Effect.Effect<void, ValidationError, never> {
  if (typeof value !== "string") {
    return Effect.void;
  }

  const { format } = config.params || {};

  switch (format) {
    case "iso8601":
      return validateISO8601(value, config);
    case "url":
      return validateURL(value, config);
    case "uuid":
      return validateUUID(value, config);
    case "email":
      return validateEmail(value, config);
    default:
      return Effect.void;
  }
}

/**
 * Validate ISO 8601 date format using Effect Schema
 */
function validateISO8601(
  value: string,
  config: ValidatorConfig,
): Effect.Effect<void, ValidationError, never> {
  // Define ISO 8601 pattern schema
  const iso8601Pattern = S.String.pipe(
    S.pattern(/^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}:\d{2})?)?)?$/),
  );

  return S.decodeUnknown(iso8601Pattern)(value).pipe(
    Effect.mapError(() =>
      externalError(
        config.message || "Value must be in ISO 8601 format (YYYY-MM-DD)",
        value,
      )
    ),
    Effect.asVoid,
  );
}

/**
 * Validate URL format
 */
function validateURL(
  value: string,
  config: ValidatorConfig,
): Effect.Effect<void, ValidationError, never> {
  return Effect.try({
    try: () => new URL(value),
    catch: () => externalError(config.message || "Value must be a valid URL", value),
  }).pipe(Effect.asVoid);
}

/**
 * Validate UUID format using Effect Schema
 */
function validateUUID(
  value: string,
  config: ValidatorConfig,
): Effect.Effect<void, ValidationError, never> {
  const uuidPattern = S.String.pipe(
    S.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  );

  return S.decodeUnknown(uuidPattern)(value).pipe(
    Effect.mapError(() => externalError(config.message || "Value must be a valid UUID", value)),
    Effect.asVoid,
  );
}

/**
 * Validate email format using Effect Schema
 */
function validateEmail(
  value: string,
  config: ValidatorConfig,
): Effect.Effect<void, ValidationError, never> {
  const emailPattern = S.String.pipe(
    S.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  );

  return S.decodeUnknown(emailPattern)(value).pipe(
    Effect.mapError(() =>
      externalError(
        config.message || "Value must be a valid email address",
        value,
      )
    ),
    Effect.asVoid,
  );
}

/**
 * Validate pattern (regex)
 */
function validatePattern(
  value: unknown,
  config: ValidatorConfig,
): Effect.Effect<void, ValidationError, never> {
  if (typeof value !== "string") {
    return Effect.void;
  }

  const { pattern, flags } = config.params || {};
  if (!pattern) {
    return Effect.void;
  }

  const regex = new RegExp(pattern, flags);
  if (!regex.test(value)) {
    return Effect.fail(
      externalError(
        config.message || `Value must match pattern: ${pattern}`,
        value,
      ),
    );
  }

  return Effect.void;
}

/**
 * Validate multiple fields in parallel
 *
 * Demonstrates Effect.all() for parallel validation
 */
export function validateFields(
  fields: ReadonlyArray<{
    value: unknown;
    validators: ReadonlyArray<ValidatorConfig>;
  }>,
): Effect.Effect<ValidationResult, never, never> {
  return Effect.gen(function* (_) {
    // Validate all fields in parallel
    const results = yield* _(
      Effect.all(
        fields.map((field) => validateWithSemantics(field.value, field.validators)),
        { concurrency: "unbounded" },
      ),
    );

    // Combine all results
    const allErrors: ValidationError[] = [];
    const allIntrinsicErrors: ValidationError[] = [];
    const allExternalErrors: ValidationError[] = [];

    for (const result of results) {
      allErrors.push(...result.errors);
      allIntrinsicErrors.push(...result.intrinsicErrors);
      allExternalErrors.push(...result.externalErrors);
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      intrinsicErrors: allIntrinsicErrors,
      externalErrors: allExternalErrors,
    };
  });
}

/**
 * Example: Batch validation with Effect
 *
 * Shows how to validate an entire dataset using Effect.all()
 */
export function validateDataset(
  rows: ReadonlyArray<Record<string, unknown>>,
  fieldDefinitions: ReadonlyArray<{
    name: string;
    validators: ReadonlyArray<ValidatorConfig>;
  }>,
): Effect.Effect<
  ReadonlyArray<{ rowNumber: number; result: ValidationResult }>,
  never,
  never
> {
  return Effect.all(
    rows.map((row, index) =>
      Effect.gen(function* (_) {
        // Validate all fields in this row
        const fieldValidations = fieldDefinitions.map((fieldDef) => ({
          value: row[fieldDef.name],
          validators: fieldDef.validators,
        }));

        const result = yield* _(validateFields(fieldValidations));

        return {
          rowNumber: index + 1,
          result,
        };
      })
    ),
    { concurrency: "unbounded" }, // Validate all rows in parallel
  );
}

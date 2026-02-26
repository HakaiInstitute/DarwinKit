/**
 * Shared constraint factory functions for tests.
 */

import type { Constraint } from "@dwkt/domain/specs";
import {
  FormatConstraint,
  LengthConstraint,
  PatternConstraint,
  RangeConstraint,
  RequiredConstraint,
  UniqueConstraint,
} from "@dwkt/domain/specs";

export function rangeConstraint(min: number, max: number): Constraint {
  return new RangeConstraint({ min, max, inclusive: true });
}

export function requiredConstraint(
  level: "required" | "recommended" | "optional" = "required",
): Constraint {
  return new RequiredConstraint({ level, allowEmpty: false, allowWhitespace: false });
}

export function formatConstraint(
  format: "email" | "url" | "uuid" | "iso8601" | "decimal-degrees" | "integer",
): Constraint {
  return new FormatConstraint({ format });
}

export function patternConstraint(pattern: string): Constraint {
  return new PatternConstraint({ pattern });
}

export function lengthConstraint(minLength?: number, maxLength?: number): Constraint {
  return new LengthConstraint({ minLength, maxLength });
}

export function uniqueConstraint(): Constraint {
  return new UniqueConstraint({});
}

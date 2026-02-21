/**
 * Constraint Presets
 *
 * Named constraint bundles for common validation patterns.
 * Presets provide reusable constraint configurations that can be
 * referenced by name in YAML configuration files.
 *
 * @module specs/constraint-presets
 */

import type { Constraint } from "./constraints.ts";
import {
  FormatConstraint,
  PatternConstraint,
  RangeConstraint,
  RequiredConstraint,
  UniqueConstraint,
} from "./constraints.ts";

/**
 * A named bundle of constraints for a common validation pattern
 */
export interface ConstraintPreset {
  readonly description: string;
  readonly constraints: readonly Constraint[];
}

/**
 * Registry of named constraint presets
 */
export const CONSTRAINT_PRESETS: Record<string, ConstraintPreset> = {
  latitude: {
    description: "WGS84 latitude (-90 to +90 decimal degrees)",
    constraints: [
      new RangeConstraint({ min: -90, max: 90, inclusive: true }),
      new FormatConstraint({ format: "decimal-degrees" }),
    ],
  },
  longitude: {
    description: "WGS84 longitude (-180 to +180 decimal degrees)",
    constraints: [
      new RangeConstraint({ min: -180, max: 180, inclusive: true }),
      new FormatConstraint({ format: "decimal-degrees" }),
    ],
  },
  depth: {
    description: "Ocean depth in meters (0 to 11000)",
    constraints: [
      new RangeConstraint({ min: 0, max: 11000, inclusive: true }),
    ],
  },
  isoDate: {
    description: "ISO 8601 date or date range",
    constraints: [
      new FormatConstraint({ format: "iso8601" }),
    ],
  },
  uniqueId: {
    description: "Unique identifier (non-null, unique within dataset)",
    constraints: [
      new RequiredConstraint({ level: "required", allowEmpty: false, allowWhitespace: false }),
      new UniqueConstraint({}),
    ],
  },
  requiredText: {
    description: "Required non-empty text field",
    constraints: [
      new RequiredConstraint({ level: "required", allowEmpty: false, allowWhitespace: false }),
    ],
  },
  url: {
    description: "Valid HTTP/HTTPS URL",
    constraints: [
      new FormatConstraint({ format: "url" }),
    ],
  },
  uuid: {
    description: "UUID format identifier",
    constraints: [
      new FormatConstraint({ format: "uuid" }),
    ],
  },
  countryCode: {
    description: "ISO 3166-1 alpha-2 country code (2 uppercase letters)",
    constraints: [
      new PatternConstraint({ pattern: "^[A-Z]{2}$" }),
    ],
  },
  year: {
    description: "Four-digit year (1000-2100)",
    constraints: [
      new RangeConstraint({ min: 1000, max: 2100, inclusive: true }),
      new FormatConstraint({ format: "integer" }),
    ],
  },
  month: {
    description: "Month number (1-12)",
    constraints: [
      new RangeConstraint({ min: 1, max: 12, inclusive: true }),
      new FormatConstraint({ format: "integer" }),
    ],
  },
  day: {
    description: "Day of month (1-31)",
    constraints: [
      new RangeConstraint({ min: 1, max: 31, inclusive: true }),
      new FormatConstraint({ format: "integer" }),
    ],
  },
};

/**
 * Get a constraint preset by name
 */
export function getPreset(name: string): readonly Constraint[] | undefined {
  return CONSTRAINT_PRESETS[name]?.constraints;
}

/**
 * Get all valid preset names
 */
export function getPresetNames(): string[] {
  return Object.keys(CONSTRAINT_PRESETS);
}

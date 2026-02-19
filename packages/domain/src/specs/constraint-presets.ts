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
      { type: "range", min: -90, max: 90, inclusive: true },
      { type: "format", format: "decimal-degrees" },
    ],
  },
  longitude: {
    description: "WGS84 longitude (-180 to +180 decimal degrees)",
    constraints: [
      { type: "range", min: -180, max: 180, inclusive: true },
      { type: "format", format: "decimal-degrees" },
    ],
  },
  depth: {
    description: "Ocean depth in meters (0 to 11000)",
    constraints: [
      { type: "range", min: 0, max: 11000, inclusive: true },
    ],
  },
  isoDate: {
    description: "ISO 8601 date or date range",
    constraints: [
      { type: "format", format: "iso8601" },
    ],
  },
  uniqueId: {
    description: "Unique identifier (non-null, unique within dataset)",
    constraints: [
      { type: "required", allowEmpty: false, allowWhitespace: false, requirement: "required" },
      { type: "unique" },
    ],
  },
  requiredText: {
    description: "Required non-empty text field",
    constraints: [
      { type: "required", allowEmpty: false, allowWhitespace: false, requirement: "required" },
    ],
  },
  url: {
    description: "Valid HTTP/HTTPS URL",
    constraints: [
      { type: "format", format: "url" },
    ],
  },
  uuid: {
    description: "UUID format identifier",
    constraints: [
      { type: "format", format: "uuid" },
    ],
  },
  countryCode: {
    description: "ISO 3166-1 alpha-2 country code (2 uppercase letters)",
    constraints: [
      { type: "pattern", pattern: "^[A-Z]{2}$" },
    ],
  },
  year: {
    description: "Four-digit year (1000-2100)",
    constraints: [
      { type: "range", min: 1000, max: 2100, inclusive: true },
      { type: "format", format: "integer" },
    ],
  },
  month: {
    description: "Month number (1-12)",
    constraints: [
      { type: "range", min: 1, max: 12, inclusive: true },
      { type: "format", format: "integer" },
    ],
  },
  day: {
    description: "Day of month (1-31)",
    constraints: [
      { type: "range", min: 1, max: 31, inclusive: true },
      { type: "format", format: "integer" },
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

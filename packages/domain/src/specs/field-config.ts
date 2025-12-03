/**
 * Field configuration types and utilities
 *
 * Provides configuration interfaces for different field types (measurement,
 * location, taxonomy, etc.) and utility functions for working with field definitions.
 */

import type { field } from "../types/validation-profile.ts";
import type { FieldDefinition } from "./field-definition.ts";

/**
 * Configuration for measurement fields
 */
export interface MeasurementConfig {
  readonly unit?: string;
  readonly defaultUnit?: string;
  readonly precision?: number;
  readonly unitVocabularyKey?: string;
  readonly conversionFactor?: number;
  readonly measurementType?:
    | "length"
    | "area"
    | "volume"
    | "weight"
    | "temperature"
    | "count"
    | "other";
}

/**
 * Configuration for location/geographic fields
 */
export interface LocationConfig {
  readonly coordinateSystem?: string;
  readonly precision?: number;
  readonly uncertaintyUnit?: string;
  readonly geodeticDatum?: string;
  readonly georeferenceSources?: readonly string[];
  readonly spatialFit?: number;
}

/**
 * Configuration for taxonomic fields
 */
export interface TaxonomyConfig {
  readonly rank?: string;
  readonly rankVocabularyKey?: string;
  readonly nomenclaturalCode?: "ICZN" | "ICN" | "ICNP" | "ICTV";
  readonly authorityPattern?: string;
  readonly hybridFormula?: boolean;
}

/**
 * Configuration for temporal/date fields
 */
export interface TemporalConfig {
  readonly dateFormat?: "iso8601" | "verbatim" | "partial";
  readonly allowFutureDates?: boolean;
  readonly allowIncompleteDate?: boolean;
  readonly minYear?: number;
  readonly maxYear?: number;
  readonly intervalSupported?: boolean;
}

/**
 * Configuration for identifier fields
 */
export interface IdentifierConfig {
  readonly identifierType?: "uuid" | "uri" | "urn" | "doi" | "local" | "other";
  readonly namespace?: string;
  readonly globallyUnique?: boolean;
  readonly persistentIdentifier?: boolean;
  readonly resolvable?: boolean;
}

/**
 * Helper functions for working with field definitions
 */

/**
 * Check if a field uses controlled vocabulary
 *
 * Supports multiple field formats:
 * - NormalizedField: has 'vocabulary' property
 * - Raw JSON schema: has 'values' object (used before normalization)
 */
export function hasControlledVocabulary(
  field: FieldDefinition | field,
): boolean {
  // NormalizedField format (has 'vocabulary' property)
  if ("vocabulary" in field && field.vocabulary) {
    return true;
  }

  // JSON schema format (has 'values' object - used before normalization)
  if ("values" in field && field.values) {
    return typeof field.values === "object" && Object.keys(field.values).length > 0;
  }

  return false;
}

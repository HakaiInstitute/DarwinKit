/**
 * Enhanced field definition interface for specifications
 *
 * Combines semantic types, parameterized validators, and controlled
 * vocabularies into a comprehensive field specification system.
 */

import * as S from "effect/Schema";
import type { BaseEntity, PrimitiveType } from "../types/common.ts";
import type { SemanticType } from "./semantic-types.ts";
import type { ValidatorConfig } from "./validators.ts";
import type { VocabularyConfig } from "./vocabularies/config.ts";
import { optionalBoolean, optionalNumber, optionalString } from "../schemas/util.ts";
import type { NormalizedField } from "./normalized-field.ts";
import type { field } from "../types/validation-profile.ts";

/**
 * @deprecated Use NormalizedField instead.
 *
 * This interface predates the JSON schema refactor and has been superseded by
 * NormalizedField which provides a simpler, more consistent structure for validation.
 *
 * FieldDefinition was designed for TypeScript-defined field specifications,
 * but the system now uses JSON schemas as the source of truth with runtime
 * normalization to NormalizedField.
 *
 * Comprehensive field definition with semantic types and validation
 */
export interface FieldDefinition extends BaseEntity {
  readonly schemaId: string;
  readonly name: string;
  readonly semanticType: SemanticType;
  readonly validators: readonly ValidatorConfig[];
  readonly primitiveType: PrimitiveType;
  readonly termIri: string;
  readonly versionIri?: string;
  readonly label: string;
  readonly definition: string;
  readonly examples?: readonly string[];
  readonly comments?: string;

  // Controlled vocabulary configuration (only when semanticType is "controlled-vocabulary")
  readonly vocabulary?: VocabularyConfig;

  // Semantic type-specific configurations
  readonly measurement?: MeasurementConfig;
  readonly location?: LocationConfig;
  readonly taxonomy?: TaxonomyConfig;
  readonly temporal?: TemporalConfig;
  readonly identifier?: IdentifierConfig;
}

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
 * Effect Schema for FieldDefinition
 */
export const FieldDefinitionSchema = S.Struct({
  id: S.String,
  schemaId: S.String,
  name: S.String,
  semanticType: S.String,
  validators: S.Array(S.Struct({
    type: S.String,
    enforcement: S.String,
    params: S.optional(S.Record({ key: S.String, value: S.Unknown })),
    message: optionalString,
  })),
  primitiveType: S.String,
  termIri: S.String,
  versionIri: optionalString,
  label: S.String,
  definition: S.String,
  examples: S.optional(S.Array(S.String)),
  comments: optionalString,
  createdAt: S.Date,
  updatedAt: S.Date,
  vocabulary: S.optional(S.Struct({
    vocabularyKey: S.String,
    enforcement: S.String,
    allowCustomValues: optionalBoolean,
    caseSensitive: optionalBoolean,
    normalizeValues: optionalBoolean,
    suggestionThreshold: optionalNumber,
  })),
  measurement: S.optional(S.Struct({
    unit: optionalString,
    defaultUnit: optionalString,
    precision: optionalNumber,
    unitVocabularyKey: optionalString,
    conversionFactor: optionalNumber,
    measurementType: optionalString,
  })),
  location: S.optional(S.Struct({
    coordinateSystem: optionalString,
    precision: optionalNumber,
    uncertaintyUnit: optionalString,
    geodeticDatum: optionalString,
    georeferenceSources: S.optional(S.Array(S.String)),
    spatialFit: optionalNumber,
  })),
  taxonomy: S.optional(S.Struct({
    rank: optionalString,
    rankVocabularyKey: optionalString,
    nomenclaturalCode: optionalString,
    authorityPattern: optionalString,
    hybridFormula: optionalBoolean,
  })),
  temporal: S.optional(S.Struct({
    dateFormat: optionalString,
    allowFutureDates: optionalBoolean,
    allowIncompleteDate: optionalBoolean,
    minYear: optionalNumber,
    maxYear: optionalNumber,
    intervalSupported: optionalBoolean,
  })),
  identifier: S.optional(S.Struct({
    identifierType: optionalString,
    namespace: optionalString,
    globallyUnique: optionalBoolean,
    persistentIdentifier: optionalBoolean,
    resolvable: optionalBoolean,
  })),
});

/**
 * Helper functions for working with field definitions
 */

/**
 * Check if a field uses controlled vocabulary
 *
 * Supports multiple field formats for backward compatibility:
 * - NormalizedField (recommended): has 'vocabulary' property
 * - FieldDefinition (deprecated): has 'semanticType' and 'vocabulary'
 * - Raw JSON schema: has 'values' object
 */
export function hasControlledVocabulary(
  field: NormalizedField | FieldDefinition | field,
): boolean {
  // NormalizedField format (recommended - has 'vocabulary' but no 'semanticType')
  if ("vocabulary" in field && field.vocabulary && !("semanticType" in field)) {
    return true;
  }

  // FieldDefinition format (deprecated)
  if ("semanticType" in field && "vocabulary" in field) {
    return field.semanticType === "controlled-vocabulary" && !!field.vocabulary;
  }

  // JSON schema format (has 'values' object - used before normalization)
  if ("values" in field && field.values) {
    return typeof field.values === "object" && Object.keys(field.values).length > 0;
  }

  return false;
}

/**
 * Check if a field is a measurement
 */
export function isMeasurementField(field: FieldDefinition): boolean {
  return field.semanticType === "measurement" && !!field.measurement;
}

/**
 * Check if a field contains geographic information
 */
export function isGeographicField(field: FieldDefinition): boolean {
  return field.semanticType === "location" && !!field.location;
}

/**
 * Check if a field contains taxonomic information
 */
export function isTaxonomicField(field: FieldDefinition): boolean {
  return field.semanticType === "taxonomy" && !!field.taxonomy;
}

/**
 * Check if a field contains temporal information
 */
export function isTemporalField(field: FieldDefinition): boolean {
  return field.semanticType === "temporal" && !!field.temporal;
}

/**
 * Check if a field is an identifier
 */
export function isIdentifierField(field: FieldDefinition): boolean {
  return field.semanticType === "identifier" && !!field.identifier;
}

/**
 * Get required validators for a field
 */
export function getRequiredValidators(field: FieldDefinition): ValidatorConfig[] {
  return field.validators.filter((v) => v.enforcement === "required");
}

/**
 * Get recommended validators for a field
 */
export function getRecommendedValidators(field: FieldDefinition): ValidatorConfig[] {
  return field.validators.filter((v) => v.enforcement === "recommended");
}

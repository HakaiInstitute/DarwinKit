/**
 * Consolidated Semantic Value Types
 *
 * Domain-specific semantic types for Darwin Core biodiversity data.
 * Uses Effect's Data.TaggedClass for structural equality and pattern matching.
 *
 * Design Principles:
 * 1. Intrinsic validation: Rules that are ALWAYS true (physical constraints)
 * 2. External validation: Rules that depend on context (uniqueness, vocabularies)
 * 3. Transformation tracking: Maintain data provenance
 * 4. Effect integration: Type-safe error handling and composability
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { Transformation } from "./transformation.ts";

/**
 * Validation error for semantic value validation failures
 */
const ValidationErrorBase = Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly value: unknown;
  readonly field?: string;
}>;
export class ValidationError extends ValidationErrorBase {}

/**
 * Coordinate - Geographic location with coordinate system
 *
 * HAS intrinsic validation: lat/lon ranges are always-true physical constraints
 */
const CoordinateBase = Data.TaggedClass("Coordinate")<{
  readonly latitude: number;
  readonly longitude: number;
  readonly coordinateSystem: string;
  readonly sourceValue?: string;
  readonly transformations?: ReadonlyArray<Transformation>;
}>;
export class Coordinate extends CoordinateBase {
  /**
   * Intrinsic validation: lat/lon ranges are physical constraints
   * These rules are ALWAYS true regardless of context
   */
  validateIntrinsic(): Effect.Effect<void, ValidationError, never> {
    if (this.latitude < -90 || this.latitude > 90) {
      return Effect.fail(
        new ValidationError({
          message: `Latitude ${this.latitude} must be between -90 and +90 degrees`,
          value: this.latitude,
          field: "latitude",
        }),
      );
    }

    if (this.longitude < -180 || this.longitude > 180) {
      return Effect.fail(
        new ValidationError({
          message: `Longitude ${this.longitude} must be between -180 and +180 degrees`,
          value: this.longitude,
          field: "longitude",
        }),
      );
    }

    return Effect.void;
  }

  override toString(): string {
    return `${this.latitude}, ${this.longitude} (${this.coordinateSystem})`;
  }

  toJSON(): object {
    return {
      _tag: this._tag,
      latitude: this.latitude,
      longitude: this.longitude,
      coordinateSystem: this.coordinateSystem,
      sourceValue: this.sourceValue,
    };
  }
}

/**
 * TemporalValue - Date/time with precision metadata
 *
 * HAS intrinsic validation: month/day ranges are always-true constraints
 */
const TemporalValueBase = Data.TaggedClass("TemporalValue")<{
  readonly date: Date;
  readonly precision: "year" | "month" | "day" | "hour" | "minute" | "second";
  readonly sourceValue?: string;
  readonly transformations?: ReadonlyArray<Transformation>;
}>;
export class TemporalValue extends TemporalValueBase {
  /**
   * Intrinsic validation: month/day ranges are always-true
   * Future dates validation is EXTERNAL (context-dependent for occurrence vs predictions)
   */
  validateIntrinsic(): Effect.Effect<void, ValidationError, never> {
    const month = this.date.getMonth() + 1;
    const day = this.date.getDate();

    if (month < 1 || month > 12) {
      return Effect.fail(
        new ValidationError({
          message: `Month ${month} must be between 1 and 12`,
          value: month,
          field: "month",
        }),
      );
    }

    if (day < 1 || day > 31) {
      return Effect.fail(
        new ValidationError({
          message: `Day ${day} must be between 1 and 31`,
          value: day,
          field: "day",
        }),
      );
    }

    // Year validation is external (depends on context - historical data vs predictions)
    // Future date validation is external (allowed for predictions, not for occurrences)

    return Effect.void;
  }

  override toString(): string {
    switch (this.precision) {
      case "year":
        return this.date.getFullYear().toString();
      case "month":
        return `${this.date.getFullYear()}-${String(this.date.getMonth() + 1).padStart(2, "0")}`;
      case "day":
        return this.date.toISOString().split("T")[0];
      case "hour":
        return this.date.toISOString().split(":")[0];
      case "minute":
        return this.date.toISOString().slice(0, 16);
      default:
        return this.date.toISOString();
    }
  }

  toJSON(): object {
    return {
      _tag: this._tag,
      date: this.date.toISOString(),
      precision: this.precision,
      sourceValue: this.sourceValue,
    };
  }
}

/**
 * Identifier - Unique identifier with metadata
 *
 * NO intrinsic validation: all rules are context-dependent
 * - Uniqueness: external (dataset-wide check)
 * - Format (UUID vs local): external (depends on identifierType)
 * - Required: external (depends on spec/profile)
 * - Resolvability: external (depends on usage)
 */
const IdentifierBase = Data.TaggedClass("Identifier")<{
  readonly value: string;
  readonly identifierType: "local" | "global" | "uri";
  readonly sourceValue?: string;
  readonly transformations?: ReadonlyArray<Transformation>;
}>;
export class Identifier extends IdentifierBase {
  get isGloballyUnique(): boolean {
    return this.identifierType === "global" || this.identifierType === "uri";
  }

  get isResolvable(): boolean {
    return this.identifierType === "uri";
  }

  // NO validateIntrinsic() - all validation is external/contextual

  override toString(): string {
    return this.value;
  }

  toJSON(): object {
    return {
      _tag: this._tag,
      value: this.value,
      identifierType: this.identifierType,
      sourceValue: this.sourceValue,
    };
  }
}

/**
 * ScientificName - Taxonomic name with authority
 *
 * HYBRID validation:
 * - Intrinsic: basic format (starts with capital, has genus + species)
 * - External: authority lookup (WoRMS, GBIF, etc.)
 * - External: nomenclatural code validation
 */
const ScientificNameBase = Data.TaggedClass("ScientificName")<{
  readonly scientificName: string;
  readonly authority?: string;
  readonly nomenclaturalCode?: "ICZN" | "ICN" | "ICNP" | "ICTV";
  readonly sourceValue?: string;
  readonly transformations?: ReadonlyArray<Transformation>;
}>;
export class ScientificName extends ScientificNameBase {
  /**
   * Intrinsic validation: basic format check
   * Authority lookup is EXTERNAL (requires API calls)
   */
  validateIntrinsic(): Effect.Effect<void, ValidationError, never> {
    const pattern = /^[A-Z][a-z]+ [a-z]+/;

    if (!pattern.test(this.scientificName)) {
      return Effect.fail(
        new ValidationError({
          message:
            `Scientific name "${this.scientificName}" should follow format "Genus species" (binomial nomenclature)`,
          value: this.scientificName,
        }),
      );
    }

    // Authority lookup and nomenclatural code validation are EXTERNAL
    // (require external data sources and are context-dependent)

    return Effect.void;
  }

  /**
   * Authority lookup - external async validation
   *
   * This is async, requires external services, and is context-dependent
   * Therefore it's NOT in validateIntrinsic()
   */
  lookupAuthority(): Effect.Effect<TaxonomicRecord | null, AuthorityLookupError, never> {
    // Future: Query WoRMS, GBIF, ITIS, etc.
    // This is async and requires external services
    return Effect.succeed(null);
  }

  override toString(): string {
    return this.authority ? `${this.scientificName} [${this.authority}]` : this.scientificName;
  }

  toJSON(): object {
    return {
      _tag: this._tag,
      scientificName: this.scientificName,
      authority: this.authority,
      nomenclaturalCode: this.nomenclaturalCode,
      sourceValue: this.sourceValue,
    };
  }
}

/**
 * Measurement - Numeric value with unit
 *
 * HYBRID validation:
 * - Intrinsic: value is finite number
 * - External: range constraints (depend on measurement type and context)
 */
const MeasurementBase = Data.TaggedClass("Measurement")<{
  readonly value: number;
  readonly unit: string;
  readonly measurementType?: string;
  readonly sourceValue?: string;
  readonly transformations?: ReadonlyArray<Transformation>;
}>;
export class Measurement extends MeasurementBase {
  /**
   * Intrinsic validation: must be finite number
   * Range validation is EXTERNAL (depends on measurement type and context)
   */
  validateIntrinsic(): Effect.Effect<void, ValidationError, never> {
    if (!Number.isFinite(this.value)) {
      return Effect.fail(
        new ValidationError({
          message: `Measurement value must be a finite number, got ${this.value}`,
          value: this.value,
        }),
      );
    }

    return Effect.void;
  }

  override toString(): string {
    return `${this.value} ${this.unit}`;
  }

  toJSON(): object {
    return {
      _tag: this._tag,
      value: this.value,
      unit: this.unit,
      measurementType: this.measurementType,
      sourceValue: this.sourceValue,
    };
  }

  /**
   * Convert to different unit (future implementation)
   */
  // convert(toUnit: string): Effect.Effect<Measurement, ConversionError, never> {
  //   // Unit conversion logic
  //   return Effect.fail(new ConversionError({ message: "Not yet implemented" }));
  // }
}

/**
 * Description - Free text with language/length metadata
 *
 * NO intrinsic validation: all rules are context-dependent
 * - Required: external (depends on spec)
 * - Max length: external (depends on implementation)
 * - Language: external (depends on requirements)
 */
const DescriptionBase = Data.TaggedClass("Description")<{
  readonly text: string;
  readonly language?: string;
  readonly sourceValue?: string;
  readonly transformations?: ReadonlyArray<Transformation>;
}>;
export class Description extends DescriptionBase {
  // NO validateIntrinsic() - all validation is external

  override toString(): string {
    return this.text;
  }

  /**
   * Extract URIs from description text
   * Useful for finding embedded links
   */
  extractURIs(): string[] {
    const uriPattern = /https?:\/\/[^\s]+/g;
    return this.text.match(uriPattern) || [];
  }

  toJSON(): object {
    return {
      _tag: this._tag,
      text: this.text,
      language: this.language,
      sourceValue: this.sourceValue,
    };
  }
}

/**
 * ControlledVocabularyValue - Value from a controlled list
 *
 * NO intrinsic validation: vocabulary membership is external
 * The vocabulary itself is external configuration
 */
const ControlledVocabularyValueBase = Data.TaggedClass("ControlledVocabularyValue")<{
  readonly value: string;
  readonly vocabularyKey: string;
  readonly caseSensitive: boolean;
  readonly sourceValue?: string;
  readonly transformations?: ReadonlyArray<Transformation>;
}>;
export class ControlledVocabularyValue extends ControlledVocabularyValueBase {
  // NO validateIntrinsic() - vocabulary lookup is external

  override toString(): string {
    return this.value;
  }

  /**
   * Vocabulary validation - EXTERNAL (async, requires vocabulary data)
   */
  validateVocabulary(
    allowedValues: readonly string[],
  ): Effect.Effect<void, ValidationError, never> {
    const isValid = this.caseSensitive
      ? allowedValues.includes(this.value)
      : allowedValues.some((v) => v.toLowerCase() === this.value.toLowerCase());

    if (!isValid) {
      return Effect.fail(
        new ValidationError({
          message: `Value "${this.value}" is not in vocabulary "${this.vocabularyKey}"`,
          value: this.value,
        }),
      );
    }

    return Effect.void;
  }

  toJSON(): object {
    return {
      _tag: this._tag,
      value: this.value,
      vocabularyKey: this.vocabularyKey,
      caseSensitive: this.caseSensitive,
      sourceValue: this.sourceValue,
    };
  }
}

/**
 * Union type for all semantic values
 * Enables exhaustive pattern matching using _tag
 */
export type SemanticValue =
  | Coordinate
  | TemporalValue
  | Identifier
  | ScientificName
  | Measurement
  | Description
  | ControlledVocabularyValue;

/**
 * Helper to check if value is a semantic type
 */
export function isSemanticValue(value: unknown): value is SemanticValue {
  return (
    value instanceof Coordinate ||
    value instanceof TemporalValue ||
    value instanceof Identifier ||
    value instanceof ScientificName ||
    value instanceof Measurement ||
    value instanceof Description ||
    value instanceof ControlledVocabularyValue
  );
}

/**
 * Get semantic type name from _tag
 */
export function getSemanticTypeName(value: SemanticValue): string {
  return value._tag;
}

/**
 * Extract primitive value from semantic type
 */
export function unwrap(value: SemanticValue | unknown): unknown {
  if (value instanceof Coordinate) {
    return { lat: value.latitude, lon: value.longitude };
  }
  if (value instanceof TemporalValue) {
    return value.date;
  }
  if (value instanceof Identifier) {
    return value.value;
  }
  if (value instanceof ScientificName) {
    return value.scientificName;
  }
  if (value instanceof Measurement) {
    return value.value;
  }
  if (value instanceof Description) {
    return value.text;
  }
  if (value instanceof ControlledVocabularyValue) {
    return value.value;
  }
  return value;
}

/**
 * Validate a semantic value's intrinsic constraints
 * Returns void if valid, or ValidationError if invalid
 */
export function validateIntrinsic(
  value: SemanticValue,
): Effect.Effect<void, ValidationError, never> {
  // Only validate types that have intrinsic validation
  if ("validateIntrinsic" in value && typeof value.validateIntrinsic === "function") {
    return value.validateIntrinsic();
  }

  // No intrinsic validation for this type
  return Effect.void;
}

/**
 * Types for async operations
 */
export interface TaxonomicRecord {
  readonly scientificName: string;
  readonly authority: string;
  readonly rank: string;
  readonly source: "WoRMS" | "GBIF" | "ITIS";
}

const AuthorityLookupErrorBase = Data.TaggedError("AuthorityLookupError")<{
  readonly message: string;
  readonly authority: string;
}>;
export class AuthorityLookupError extends AuthorityLookupErrorBase {}

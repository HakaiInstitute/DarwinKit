/**
 * Normalized Field Definition
 *
 * A normalized field structure that bridges JSON schema fields and TypeScript
 * FieldDefinition (deprecated). Used by validation logic to work with a consistent
 * format regardless of the source (JSON vs TypeScript).
 *
 * ## Purpose
 *
 * NormalizedField provides a unified representation for validation by:
 * - Converting string validators → ValidatorConfig objects
 * - Converting values object → VocabularyConfig
 * - Providing consistent property names and structure
 *
 * This is a subset of FieldDefinition with only the properties needed for validation,
 * making it simpler and more focused than the comprehensive FieldDefinition interface.
 *
 * ## Usage
 *
 * - Validation code uses `profile.normalizedFields` (NormalizedField)
 * - Transformation code uses `profile.fields` (raw JSON schema format)
 *
 * See validation-profile.ts for details on the dual-purpose field storage.
 */

import * as S from "effect/Schema";
import type { field } from "../types/validation-profile.ts";
import type { ValidatorConfig } from "./validators.ts";
import { ValidatorConfigSchema } from "./validators.ts";
import type { VocabularyConfig } from "./vocabularies/config.ts";
import type { VocabularyKey } from "./vocabularies/registry.ts";

/**
 * Normalized field for validation
 *
 * Contains only the properties needed by validation logic.
 */
export interface NormalizedField {
  readonly name: string;
  readonly label?: string;
  readonly validators: readonly ValidatorConfig[];
  readonly vocabulary?: VocabularyConfig;
  readonly type?: string;
  readonly comments?: string;
  readonly examples?: string;
}

/**
 * Schema for normalized field
 */
export const NormalizedFieldSchema = S.Struct({
  name: S.String,
  label: S.optional(S.String),
  validators: S.Array(ValidatorConfigSchema),
  vocabulary: S.optional(S.Struct({
    vocabularyKey: S.String,
    caseSensitive: S.optional(S.Boolean),
    enforcement: S.optional(S.Literal("strict", "lenient", "optional")),
  })),
  type: S.optional(S.String),
  comments: S.optional(S.String),
  examples: S.optional(S.String),
});

/**
 * Normalize a JSON schema field to a NormalizedField
 *
 * Converts:
 * - validators: string[] → ValidatorConfig[]
 * - values: Record<string, unknown> → vocabulary: VocabularyConfig
 */
export function normalizeField(jsonField: field): NormalizedField {
  // Convert validators to ValidatorConfig objects
  // JSON schema validators can be either strings or objects
  const validators: ValidatorConfig[] = jsonField.validators?.map((v) => {
    // If already an object, use as-is (already ValidatorConfig format)
    if (typeof v === "object" && v !== null && "type" in v) {
      return v as unknown as ValidatorConfig;
    }

    // Convert string validators to ValidatorConfig objects
    if (typeof v === "string") {
      switch (v) {
        case "uniqueIdentifier":
        case "unique":
          return {
            type: "unique" as const,
            enforcement: "required" as const,
          };
        case "required":
          return {
            type: "required" as const,
            enforcement: "required" as const,
          };
        case "recommended":
          return {
            type: "required" as const,
            enforcement: "recommended" as const,
          };
        case "optional":
          return {
            type: "required" as const,
            enforcement: "optional" as const,
          };
        case "integer":
        case "decimal":
        case "date":
        case "url":
        case "iso8601Date":
          // Type validators - these validate the data type
          // Note: Some like "url" and "iso8601Date" are not in ValidatorType enum
          // but are used in legacy schemas. We treat them as optional validators.
          return {
            type: v as ValidatorConfig["type"],
            enforcement: "optional" as const,
          };
        default:
          // Unknown validator string - skip with warning
          console.warn(`Unknown validator string: ${v}`);
          return {
            type: "required" as const,
            enforcement: "optional" as const,
          };
      }
    }

    // Fallback for unexpected format
    return v as unknown as ValidatorConfig;
  }) || [];

  // Convert values object to vocabulary config
  const vocabulary: VocabularyConfig | undefined = jsonField.values
    ? {
      // Derive vocabulary key from field type (cast to any valid key)
      vocabularyKey: deriveVocabularyKey(jsonField),
      caseSensitive: false,
      enforcement: deriveVocabularyEnforcement(jsonField),
    }
    : undefined;

  return {
    name: jsonField.name,
    label: jsonField.label,
    validators,
    vocabulary,
    type: jsonField.type,
    comments: jsonField.comments,
    examples: jsonField.examples,
  };
}

/**
 * Derive vocabulary key from field
 *
 * Maps Darwin Core field names to their vocabulary keys.
 * Returns the mapped key or the field name as a fallback (cast to any valid key).
 */
function deriveVocabularyKey(field: field): VocabularyKey {
  // Common Darwin Core vocabulary mappings
  const vocabularyMap: Record<string, string> = {
    "type": "dctype",
    "basisOfRecord": "basisOfRecord",
    "occurrenceStatus": "occurrenceStatus",
    "establishmentMeans": "establishmentMeans",
    "degreeOfEstablishment": "degreeOfEstablishment",
    "pathway": "pathway",
    "reproductiveCondition": "reproductiveCondition",
    "sex": "sex",
    "lifeStage": "lifeStage",
    "behavior": "behavior",
    "vitality": "vitality",
    "typeStatus": "typeStatus",
    "disposition": "disposition",
    "preparations": "preparations",
    "georeferenceProtocol": "georeferenceProtocol",
    "geodeticDatum": "geodeticDatum",
    "identificationQualifier": "identificationQualifier",
    "measurementType": "measurementType",
    "measurementUnit": "measurementUnit",
    "measurementMethod": "measurementMethod",
  };

  return (vocabularyMap[field.name] || field.name) as VocabularyKey;
}

/**
 * Derive vocabulary enforcement level from field metadata
 *
 * Determines the appropriate enforcement level based on obis_required and gbif_required.
 * This ensures that vocabulary violations produce appropriate severity levels:
 * - strict: errors for required/strongly recommended fields
 * - recommended: warnings for recommended fields
 * - loose: info messages for optional fields
 */
function deriveVocabularyEnforcement(field: field): "strict" | "recommended" | "loose" {
  const obisRequired = field.obis_required;
  const gbifRequired = field.gbif_required;

  // Check OBIS requirements first (preferred for marine biodiversity)
  if (obisRequired === "required" || obisRequired === "strongly recommended") {
    return "strict";
  }
  if (obisRequired === "recommended") {
    return "recommended";
  }

  // Fall back to GBIF requirements
  if (gbifRequired === "true") {
    return "strict";
  }

  // Default to loose for optional or unspecified fields
  // This allows custom values with info-level notifications
  return "loose";
}

/**
 * Validate a normalized field using Effect Schema
 */
export function validateNormalizedField(
  field: unknown,
): S.Schema.Type<typeof NormalizedFieldSchema> {
  return S.decodeUnknownSync(NormalizedFieldSchema)(field);
}

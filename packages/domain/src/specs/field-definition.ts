/**
 * Field Definition
 *
 * A normalized field structure derived from JSON schema fields.
 * Used by validation logic to work with a consistent format.
 *
 * ## Purpose
 *
 * FieldDefinition provides a unified representation for validation by:
 * - Converting string validators -> typed Constraint objects
 * - Converting values object -> VocabularyConstraint in constraints array
 * - Providing consistent property names and structure
 *
 * ## Usage
 *
 * - Validation code uses `profile.normalizedFields` (FieldDefinition)
 * - Transformation code uses `profile.fields` (raw JSON schema format)
 *
 * See validation-profile.ts for details on the dual-purpose field storage.
 */

import * as S from "effect/Schema";
import type { Field } from "../schemas/validation-profile.ts";
import { Constraint, type EnforcementLevel, FieldDataType } from "./constraints.ts";
import { vocabularyEnforcementToStandard } from "./validators.ts";
import type { VocabularyEnforcement } from "./vocabularies/config.ts";
import type { VocabularyKey } from "./vocabularies/registry.ts";

export const FieldDefinitionSchema = S.Struct({
  name: S.String,
  label: S.optional(S.String),
  constraints: S.Array(Constraint),
  type: S.optional(FieldDataType),
  requirement: S.optional(S.String),
  comments: S.optional(S.String),
  examples: S.optional(S.String),
});

export type FieldDefinition = S.Schema.Type<typeof FieldDefinitionSchema>;

/**
 * Map JSON schema type strings to FieldDataType values.
 *
 * JSON schemas use different naming than our FieldDataType enum:
 * - "controlled-vocabulary" → "string"
 * - "decimal" → "number"
 * - "uri" → "uri"
 * - etc.
 */
export function mapJsonTypeToFieldDataType(
  jsonType: string | undefined,
): S.Schema.Type<typeof FieldDataType> | undefined {
  if (!jsonType) return undefined;
  const mapping: Record<string, S.Schema.Type<typeof FieldDataType>> = {
    "string": "string",
    "controlled-vocabulary": "string",
    "decimal": "number",
    "integer": "integer",
    "date": "date",
    "boolean": "boolean",
    "uri": "uri",
    "identifier": "identifier",
    "coordinate": "coordinate",
  };
  return mapping[jsonType];
}

/**
 * Normalize a JSON schema field to a FieldDefinition
 *
 * Converts:
 * - validators: string[] -> Constraint[]
 * - values: Record<string, unknown> -> VocabularyConstraint in constraints
 */
export function normalizeField(jsonField: Field): FieldDefinition {
  const constraints: Constraint[] = [];

  // Convert validators to Constraint objects
  if (jsonField.validators) {
    for (const v of jsonField.validators) {
      // If already an object with type field, convert to flat constraint format
      if (typeof v === "object" && v !== null && "type" in v) {
        const obj = v as Record<string, unknown>;
        const constraintType = obj.type as string;

        if (constraintType === "range") {
          const params = (obj.params as Record<string, unknown>) || {};
          constraints.push({
            type: "range" as const,
            min: typeof params.min === "number" ? params.min : undefined,
            max: typeof params.max === "number" ? params.max : undefined,
            inclusive: typeof params.inclusive === "boolean" ? params.inclusive : true,
            enforcement: (obj.enforcement as EnforcementLevel) || "required",
            message: obj.message as string | undefined,
          });
        } else if (constraintType === "format") {
          const params = (obj.params as Record<string, unknown>) || {};
          constraints.push({
            type: "format" as const,
            format: (params.format || obj.format) as
              | "email"
              | "url"
              | "uuid"
              | "iso8601"
              | "decimal-degrees"
              | "integer",
            enforcement: (obj.enforcement as EnforcementLevel) || "required",
            message: obj.message as string | undefined,
          });
        } else if (constraintType === "pattern") {
          const params = (obj.params as Record<string, unknown>) || {};
          constraints.push({
            type: "pattern" as const,
            pattern: (params.pattern || obj.pattern) as string,
            flags: (params.flags || obj.flags) as string | undefined,
            enforcement: (obj.enforcement as EnforcementLevel) || "required",
            message: obj.message as string | undefined,
          });
        } else if (constraintType === "length") {
          const params = (obj.params as Record<string, unknown>) || {};
          constraints.push({
            type: "length" as const,
            minLength: typeof params.minLength === "number" ? params.minLength : undefined,
            maxLength: typeof params.maxLength === "number" ? params.maxLength : undefined,
            enforcement: (obj.enforcement as EnforcementLevel) || "required",
            message: obj.message as string | undefined,
          });
        } else if (constraintType === "unique") {
          constraints.push({
            type: "unique" as const,
            enforcement: (obj.enforcement as EnforcementLevel) || "required",
            message: obj.message as string | undefined,
          });
        } else if (constraintType === "required") {
          constraints.push({
            type: "required" as const,
            allowEmpty: false,
            allowWhitespace: false,
            enforcement: (obj.enforcement as EnforcementLevel) || "required",
            message: obj.message as string | undefined,
          });
        } else if (constraintType === "vocabulary") {
          constraints.push({
            type: "vocabulary" as const,
            vocabularyKey: (obj.vocabularyKey as string) || "",
            caseSensitive: false,
            enforcement: (obj.enforcement as EnforcementLevel) || "recommended",
            message: obj.message as string | undefined,
          });
        }
        continue;
      }

      // Convert string validators to Constraint objects
      if (typeof v === "string") {
        switch (v) {
          case "uniqueIdentifier":
          case "unique":
            constraints.push({
              type: "unique" as const,
              enforcement: "required" as const,
            });
            break;
          case "required":
            constraints.push({
              type: "required" as const,
              allowEmpty: false,
              allowWhitespace: false,
              enforcement: "required" as const,
            });
            break;
          case "recommended":
            constraints.push({
              type: "required" as const,
              allowEmpty: false,
              allowWhitespace: false,
              enforcement: "recommended" as const,
            });
            break;
          case "optional":
            constraints.push({
              type: "required" as const,
              allowEmpty: false,
              allowWhitespace: false,
              enforcement: "optional" as const,
            });
            break;
          case "integer":
            constraints.push({
              type: "format" as const,
              format: "integer" as const,
              enforcement: "optional" as const,
            });
            break;
          case "date":
          case "iso8601Date":
            constraints.push({
              type: "format" as const,
              format: "iso8601" as const,
              enforcement: "optional" as const,
            });
            break;
          case "url":
            constraints.push({
              type: "format" as const,
              format: "url" as const,
              enforcement: "optional" as const,
            });
            break;
          case "decimal":
            constraints.push({
              type: "format" as const,
              format: "decimal-degrees" as const,
              enforcement: "optional" as const,
            });
            break;
          default:
            console.warn(
              `Unknown validator string "${v}" for field "${jsonField.name}" — skipping`,
            );
            break;
        }
      }
    }
  }

  // Convert values object to VocabularyConstraint
  if (
    jsonField.values && typeof jsonField.values === "object" &&
    Object.keys(jsonField.values).length > 0
  ) {
    const vocabEnforcement = deriveVocabularyEnforcement(jsonField);
    constraints.push({
      type: "vocabulary" as const,
      vocabularyKey: deriveVocabularyKey(jsonField),
      caseSensitive: false,
      enforcement: vocabularyEnforcementToStandard(vocabEnforcement),
    });
  }

  return {
    name: jsonField.name,
    label: jsonField.label,
    constraints,
    type: mapJsonTypeToFieldDataType(jsonField.type),
    requirement: jsonField.obis_required,
    comments: jsonField.comments,
    examples: jsonField.examples,
  };
}

/**
 * Derive vocabulary key from field
 *
 * Maps Darwin Core field names to their vocabulary keys.
 */
function deriveVocabularyKey(field: Field): VocabularyKey {
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
 */
function deriveVocabularyEnforcement(field: Field): VocabularyEnforcement {
  const obisRequired = field.obis_required;
  const gbifRequired = field.gbif_required;

  if (obisRequired === "required" || obisRequired === "strongly recommended") {
    return "strict";
  }
  if (obisRequired === "recommended") {
    return "recommended";
  }
  if (gbifRequired === "true") {
    return "strict";
  }

  return "loose";
}

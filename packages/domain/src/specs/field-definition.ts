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
import { Constraint, FieldDataType, type Obligation, ObligationsMap } from "./constraints.ts";

export const FieldDefinitionSchema = S.Struct({
  name: S.String,
  label: S.optional(S.String),
  constraints: S.Array(Constraint),
  type: S.optional(FieldDataType),
  obligations: S.optional(ObligationsMap),
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
const VALID_OBLIGATIONS: ReadonlySet<string> = new Set([
  "required",
  "strongly recommended",
  "recommended",
  "optional",
  "required (if exists)",
  "optional (required for imaging data)",
]);

function isValidObligation(value: string): value is Obligation {
  return VALID_OBLIGATIONS.has(value);
}

export function normalizeField(jsonField: Field): FieldDefinition {
  const constraints: Constraint[] = [];

  // Convert validators to Constraint objects
  if (jsonField.validators) {
    for (const v of jsonField.validators) {
      // If already an object with type field, flatten params and decode via Constraint schema
      if (typeof v === "object" && v !== null && "type" in v) {
        const obj = v as Record<string, unknown>;
        const params = (obj.params as Record<string, unknown>) || {};

        // Flatten params into the object
        const raw: Record<string, unknown> = {
          ...params,
          ...obj,
        };
        // Remove nested params — fields are now at top level
        delete raw.params;

        // Apply type-specific defaults for fields that Schema requires
        if (raw.type === "required") {
          raw.allowEmpty ??= false;
          raw.allowWhitespace ??= false;
          raw.enforcement ??= "required";
        } else {
          // Value constraints no longer have enforcement — strip if present
          if (raw.enforcement !== undefined) {
            console.warn(
              `Stripping "enforcement" from ${raw.type} constraint on field "${jsonField.name}" — only "required" constraints support enforcement`,
            );
          }
          delete raw.enforcement;
        }
        if (raw.type === "vocabulary") {
          raw.values ??= [];
          raw.caseSensitive ??= false;
          raw.strictness ??= "recommended";
        }

        try {
          constraints.push(S.decodeUnknownSync(Constraint)(raw));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(
            `Invalid constraint object for field "${jsonField.name}" — skipping: ${message}`,
            JSON.stringify(raw),
          );
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
              enforcement: "optional" as const,
            });
            break;
          case "optional":
            // No constraint emitted — matches requirementToConstraint() behavior
            break;
          case "integer":
            constraints.push({
              type: "format" as const,
              format: "integer" as const,
            });
            break;
          case "date":
          case "iso8601Date":
            constraints.push({
              type: "format" as const,
              format: "iso8601" as const,
            });
            break;
          case "url":
            constraints.push({
              type: "format" as const,
              format: "url" as const,
            });
            break;
          case "decimal":
            constraints.push({
              type: "format" as const,
              format: "decimal-degrees" as const,
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
    const vocabStrictness = deriveVocabularyStrictness(jsonField);
    constraints.push({
      type: "vocabulary" as const,
      values: Object.keys(jsonField.values),
      caseSensitive: false,
      strictness: vocabStrictness,
    });
  }

  // Build obligations map from raw JSON field metadata
  const obligations: { obis?: Obligation; gbif?: Obligation } = {};
  if (jsonField.obis_required && isValidObligation(jsonField.obis_required)) {
    obligations.obis = jsonField.obis_required;
  }
  if (jsonField.gbif_required) {
    // gbif_required uses "true"/"false" strings — map to standard obligation values
    if (jsonField.gbif_required === "true") {
      obligations.gbif = "required";
    } else if (jsonField.gbif_required === "false") {
      obligations.gbif = "optional";
    } else if (isValidObligation(jsonField.gbif_required)) {
      obligations.gbif = jsonField.gbif_required;
    }
  }

  return {
    name: jsonField.name,
    label: jsonField.label,
    constraints,
    type: mapJsonTypeToFieldDataType(jsonField.type),
    obligations: Object.keys(obligations).length > 0 ? obligations : undefined,
    comments: jsonField.comments,
    examples: jsonField.examples,
  };
}

/**
 * Derive vocabulary strictness from field metadata.
 *
 * Maps obligation-level metadata to vocabulary strictness:
 * - required / strongly recommended / gbif required → "strict" (errors)
 * - everything else → "recommended" (warnings, default)
 */
function deriveVocabularyStrictness(_field: Field): "strict" | "recommended" {
  // Darwin Core treats all controlled vocabularies as "recommended best practice"
  // — none are strictly enforced at the standard level. Obligation level governs
  // field *presence*, not vocabulary value strictness. Users/profiles can override
  // to "strict" in their configuration.
  return "recommended";
}

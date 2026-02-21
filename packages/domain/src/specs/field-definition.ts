/**
 * Field Definition
 *
 * A normalized field structure derived from JSON schema fields.
 * Used by validation logic to work with a consistent format.
 *
 * ## Purpose
 *
 * SpecField provides a unified representation for validation by:
 * - Converting string validators -> typed Constraint objects
 * - Preserving values for DuckDB ENUM creation (via raw `fields`)
 * - Providing consistent property names and structure
 *
 * ## Usage
 *
 * - Validation code uses `profile.normalizedFields` (SpecField)
 * - Transformation code uses `profile.fields` (raw JSON schema format)
 *
 * See validation-profile.ts for details on the dual-purpose field storage.
 */

import * as S from "effect/Schema";
import type { RawField } from "../schemas/validation-profile.ts";
import {
  type Constraint,
  ConstraintSchema,
  FieldDataType,
  FormatConstraint,
  type Obligation,
  ObligationsMap,
  obligationToRequirement,
  RequiredConstraint,
  type RequirementLevel,
  UniqueConstraint,
} from "./constraints.ts";

export const SpecFieldSchema = S.Struct({
  name: S.String,
  label: S.optional(S.String),
  constraints: S.Array(ConstraintSchema),
  dataType: S.optional(FieldDataType),
  obligations: S.optional(ObligationsMap),
  comments: S.optional(S.String),
  examples: S.optional(S.String),
});

export type SpecField = S.Schema.Type<typeof SpecFieldSchema>;

/**
 * Result of looking up a field's obligation for a given standard.
 *
 * Returns both the raw obligation (for conditional logic like "required (if exists)")
 * and the derived requirement level (for constraint generation).
 */
export interface ObligationResult {
  readonly obligation: Obligation;
  readonly requirement: RequirementLevel | undefined;
}

/**
 * Get the obligation and derived requirement level for a field, given the active standard.
 */
export function obligationForStandard(
  field: SpecField,
  standard: "obis" | "gbif",
): ObligationResult | undefined {
  if (!field.obligations) return undefined;
  const obligation = standard === "obis" ? field.obligations.obis : field.obligations.gbif;
  if (!obligation) return undefined;
  return { obligation, requirement: obligationToRequirement(obligation) };
}

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
 * Normalize a JSON schema field to a SpecField
 *
 * Converts:
 * - validators: string[] -> Constraint[]
 * - values: Preserved in raw `fields` for DuckDB ENUM creation (not in constraints)
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

export function normalizeField(jsonField: RawField): SpecField {
  const constraints: Constraint[] = [];

  // Convert validators to Constraint objects
  //
  // Terminology chain (JSON validator string → RequirementLevel → ErrorSeverity):
  //   "required"    → "required"  → ERROR
  //   "recommended" → "optional"  → INFO
  //   "optional"    → (no constraint emitted)
  //
  // Note: Obligation "strongly recommended" → requirement "recommended" → WARNING
  // is handled separately via obligationToRequirement(), not via validator strings.
  if (jsonField.validators) {
    for (const v of jsonField.validators) {
      // If already an object with type field, flatten params and decode via ConstraintSchema
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
          // Accept both "requirement" and "level" from JSON, prefer "level"
          if (raw.level === undefined && raw.requirement !== undefined) {
            raw.level = raw.requirement;
          }
          raw.level ??= "required";
          // Keep requirement for schema decode compatibility
          raw.requirement ??= raw.level;
        } else {
          // Value constraints no longer have requirement — strip if present
          if (raw.requirement !== undefined) {
            console.warn(
              `Stripping "requirement" from ${raw.type} constraint on field "${jsonField.name}" — only "required" constraints support requirement`,
            );
          }
          delete raw.requirement;
          delete raw.level;
        }
        try {
          constraints.push(S.decodeUnknownSync(ConstraintSchema)(raw));
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
            constraints.push(new UniqueConstraint({}));
            break;
          case "required":
            constraints.push(
              new RequiredConstraint({
                level: "required",
                allowEmpty: false,
                allowWhitespace: false,
              }),
            );
            break;
          case "recommended":
            constraints.push(
              new RequiredConstraint({
                level: "optional",
                allowEmpty: false,
                allowWhitespace: false,
              }),
            );
            break;
          case "optional":
            // No constraint emitted — matches requirementToConstraint() behavior
            break;
          case "integer":
            constraints.push(new FormatConstraint({ format: "integer" }));
            break;
          case "date":
          case "iso8601Date":
            constraints.push(new FormatConstraint({ format: "iso8601" }));
            break;
          case "url":
            constraints.push(new FormatConstraint({ format: "url" }));
            break;
          case "decimal":
            constraints.push(new FormatConstraint({ format: "decimal-degrees" }));
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
    dataType: mapJsonTypeToFieldDataType(jsonField.type),
    obligations: Object.keys(obligations).length > 0 ? obligations : undefined,
    comments: jsonField.comments,
    examples: jsonField.examples,
  };
}

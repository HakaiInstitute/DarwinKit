import * as S from "effect/Schema";
import * as Result from "effect/Result";
import type { RawField } from "../schemas/spec-types.ts";
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

const SpecFieldSchema = S.Struct({
  name: S.String,
  label: S.optional(S.String),
  constraints: S.Array(ConstraintSchema),
  dataType: S.optional(FieldDataType),
  obligations: S.optional(ObligationsMap),
  comments: S.optional(S.String),
  examples: S.optional(S.String),
});

export type SpecField = typeof SpecFieldSchema.Type;

/**
 * Result of looking up a field's obligation for a given standard.
 *
 * Returns both the raw obligation (for conditional logic like "required (if exists)")
 * and the derived requirement level (for constraint generation).
 */
interface ObligationResult {
  readonly obligation: Obligation;
  readonly requirement: RequirementLevel | undefined;
}

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
function mapJsonTypeToFieldDataType(
  jsonType: string | undefined,
): typeof FieldDataType.Type | undefined {
  if (!jsonType) return undefined;
  const mapping: Record<string, typeof FieldDataType.Type> = {
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

const STRING_VALIDATOR_MAP: Record<string, Constraint | null> = {
  uniqueIdentifier: new UniqueConstraint({}),
  unique: new UniqueConstraint({}),
  required: new RequiredConstraint({
    level: "required",
    allowEmpty: false,
    allowWhitespace: false,
  }),
  // "recommended" obligation maps to RequirementLevel "optional" because:
  // RequirementLevel is a strictness scale (required > recommended > optional).
  // The obligation "recommended" is the weakest level that still generates a
  // constraint, which corresponds to RequirementLevel "optional" (INFO severity).
  // The obligation "strongly recommended" maps to RequirementLevel "recommended" (WARNING).
  recommended: new RequiredConstraint({
    level: "optional",
    allowEmpty: false,
    allowWhitespace: false,
  }),
  optional: null,
  integer: new FormatConstraint({ format: "integer" }),
  date: new FormatConstraint({ format: "iso8601" }),
  iso8601Date: new FormatConstraint({ format: "iso8601" }),
  url: new FormatConstraint({ format: "url" }),
  // "decimal" in Darwin Core schemas maps to "decimal-degrees" format validation
  // because all decimal fields in the schema are geographic coordinates.
  decimal: new FormatConstraint({ format: "decimal-degrees" }),
};

interface NormalizeFieldResult {
  readonly field: SpecField;
  readonly warnings: readonly string[];
}

export function normalizeField(jsonField: RawField): NormalizeFieldResult {
  const constraints: Constraint[] = [];
  const warnings: string[] = [];

  if (jsonField.validators) {
    for (const v of jsonField.validators) {
      if (typeof v === "object" && v !== null && "type" in v) {
        const obj = v as Record<string, unknown>;
        const params = (obj.params as Record<string, unknown>) || {};

        const raw: Record<string, unknown> = {
          ...params,
          ...obj,
        };
        delete raw.params;

        if (raw.type !== "required") {
          delete raw.level;
        }
        delete raw.requirement;
        const decoded = S.decodeUnknownResult(ConstraintSchema)(raw);
        if (Result.isFailure(decoded)) {
          warnings.push(
            `Invalid constraint object for field "${jsonField.name}" — skipping: ${decoded.failure.message}`,
          );
        } else {
          constraints.push(decoded.success);
        }
        continue;
      }

      if (typeof v === "string") {
        const mapped = STRING_VALIDATOR_MAP[v];
        if (mapped === undefined) {
          warnings.push(
            `Unknown validator string "${v}" for field "${jsonField.name}" — skipping`,
          );
        } else if (mapped !== null) {
          constraints.push(mapped);
        }
      }
    }
  }

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
    field: {
      name: jsonField.name,
      label: jsonField.label,
      constraints,
      dataType: mapJsonTypeToFieldDataType(jsonField.type),
      obligations: Object.keys(obligations).length > 0 ? obligations : undefined,
      comments: jsonField.comments,
      examples: jsonField.examples,
    },
    warnings,
  };
}

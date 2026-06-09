import * as S from "effect/Schema";
import * as Effect from "effect/Effect";
import * as SchemaGetter from "effect/SchemaGetter";
import * as SchemaIssue from "effect/SchemaIssue";
import { ConstraintSchema, RequirementLevel } from "../specs/constraints.ts";

const DEFAULT_NULL_VALUES = ["NA", "N/A", "", "NULL", "null"];
const DEFAULT_WORKSPACE_NAME = "Workspace";
const DEFAULT_VERSION = "1.0.0";
const DEFAULT_OUTPUT_DIR = "./output";

/**
 * The resolved form of the `standard` config field.
 *
 * Users can write:
 * - `standard: obis`          → { base: "darwin-core", variant: "obis" }   (backward compat)
 * - `standard: gbif`          → { base: "darwin-core", variant: "gbif" }   (backward compat)
 * - `standard: darwin-core`   → { base: "darwin-core" }                    (no variant)
 * - `standard: { base: "darwin-core", variant: "obis" }`                   (explicit form)
 */
export interface ResolvedStandard {
  readonly base: string;
  readonly variant?: string;
}

/**
 * Known variant names that should be normalized to { base: "darwin-core", variant: ... }
 * when provided as a bare string.
 */
export const KNOWN_VARIANTS = new Set(["obis", "gbif"]);

const ResolvedStandardStruct = S.Struct({
  base: S.String,
  variant: S.optional(S.String),
});

/**
 * Schema that accepts either a string or an object and normalizes to ResolvedStandard.
 *
 * String handling:
 * - Known variant names ("obis", "gbif") → { base: "darwin-core", variant: <name> }
 * - Other strings → { base: <string> }
 *
 * Object handling: passes through as-is.
 */
const ResolvedStandardSchema = S.Union([
  S.String.pipe(
    S.decodeTo(
      S.Struct({ base: S.String, variant: S.optional(S.String) }),
      {
        // decode: string -> { base, variant? }  (Stage 0 verified: NOT inverted)
        decode: SchemaGetter.transform(
          (s: string) => KNOWN_VARIANTS.has(s) ? { base: "darwin-core", variant: s } : { base: s },
        ),
        // encode: { base, variant? } -> string
        encode: SchemaGetter.transform(
          (obj: { base: string; variant?: string }) => obj.variant ?? obj.base,
        ),
      },
    ),
  ),
  ResolvedStandardStruct,
]);

/**
 * Maps source columns to Darwin Core fields with optional typed constraints.
 *
 * Two mechanisms control "required" behavior:
 * - `requirement` — profile-level field status (affects missing-field messages from profile check)
 * - `constraints[type="required"]` — runtime value validation (checks individual cell values)
 *
 * Config-specified fields are implicitly required — if a field is listed in
 * fieldMappings but missing from the CSV, it is always reported as an error.
 */
const workspaceFieldMappingSchema = S.Struct({
  originName: S.String.annotate({ description: "Source column name in the CSV file." }),
  targetName: S.String.annotate({ description: "Target Darwin Core field name." }),
  requirement: S.optional(RequirementLevel),
  constraints: S.optional(S.Array(ConstraintSchema)),
  preset: S.optional(S.String),
});

const whenConditionSchema = S.Union([
  S.String,
  S.Struct({ field: S.String, equals: S.String }),
  S.Struct({ field: S.String, in: S.NonEmptyArray(S.String) }),
]);

const dependencyRequireSchema = S.Union([
  S.NonEmptyArray(S.String),
  S.Struct({ oneOf: S.NonEmptyArray(S.String) }),
]);

const foreignKeyRuleSchema = S.Struct({
  ruleType: S.Literal("foreignKey").annotate({
    description: "Type of cross-dataset rule.",
  }),
  sourceDataset: S.String.annotate({ description: "Name of the source dataset." }),
  sourceField: S.String.annotate({ description: "Field name in the source dataset." }),
  targetDataset: S.String.annotate({ description: "Name of the target dataset." }),
  targetField: S.String.annotate({ description: "Field name in the target dataset." }),
  requirement: S.optional(RequirementLevel),
  description: S.optional(S.String),
});

const dependencyRuleSchema = S.Struct({
  ruleType: S.Literal("dependency").annotate({
    description: "Type of intra-dataset dependency rule.",
  }),
  sourceDataset: S.optional(
    S.String.annotate({ description: "Name of the dataset this rule applies to." }),
  ),
  when: S.optional(whenConditionSchema.annotate({
    description: "Condition that triggers this rule. Omit for unconditional rules.",
  })),
  require: dependencyRequireSchema.annotate({
    description:
      "Fields that must be present. Array means all required; { oneOf: [...] } means at least one.",
  }),
  level: S.optional(RequirementLevel),
  message: S.optional(S.String.annotate({ description: "Custom error message." })),
});

const datasetRuleSchema = S.Union([foreignKeyRuleSchema, dependencyRuleSchema]).annotate({
  title: "Dataset Rule",
  description: "Defines a cross-dataset foreign key or intra-dataset dependency rule.",
});

const datasetConfigSchema = S.Struct({
  name: S.String.annotate({ description: "Unique name for this dataset." }),
  class: S.String.annotate({
    description:
      "Darwin Core class: Event, Occurrence, Taxon, ExtendedMeasurementOrFact, dnaDerivedData, ResourceRelationship.",
  }),
  path: S.String.annotate({ description: "File path to the CSV data file." }),
  description: S.optional(S.String),
  fieldMappings: S.optional(
    S.Array(workspaceFieldMappingSchema).annotate({
      description: "Mappings from CSV columns to Darwin Core fields.",
    }),
  ),
}).annotate({
  title: "Dataset Configuration",
  description:
    "Configuration for a single dataset to validate against a Darwin Core specification.",
});

const transformDatasetConfigSchema = S.Struct({
  name: S.String.annotate({ description: "Unique name for this transform dataset." }),
  class: S.String.annotate({
    description: "Darwin Core class for the transform output.",
  }),
  source: S.optional(
    S.Record(S.String, S.String).annotate({
      description: "Named SQL sources: alias → table name or SQL query.",
    }),
  ),
  description: S.optional(S.String),
  fields: S.optional(
    S.Record(S.String, S.Union([S.String, S.Number, S.Null])).annotate({
      description: "Field mappings: Darwin Core field name → SQL expression, number, or null.",
    }),
  ),
}).annotate({
  title: "Transform Dataset Configuration",
  description: "Configuration for a dataset in a transform workflow.",
});

/**
 * Uses two default patterns for fields:
 * - `.pipe(S.withDecodingDefault(Effect.succeed(value)))` - Applies defaults during decoding
 * - `.pipe(S.withConstructorDefault(Effect.succeed(value)))` - Applies defaults when using schema.make()
 *
 * For per-call defaults (e.g. crypto.randomUUID(), fresh timestamps) use
 * `Effect.sync(() => ...)` instead of `Effect.succeed(...)` so each call produces a
 * fresh value rather than one shared cached value (see id/createdAt/updatedAt below).
 */
const validationSettingsSchema = S.Struct({
  nullValues: S.Array(S.String).annotate({
    description: "Values to treat as null during validation.",
    default: DEFAULT_NULL_VALUES,
  }).pipe(
    S.withDecodingDefault(Effect.succeed([...DEFAULT_NULL_VALUES])),
    S.withConstructorDefault(Effect.succeed([...DEFAULT_NULL_VALUES])),
  ),
  failFast: S.Boolean.annotate({ description: "Stop validation on first error. Default: false." })
    .pipe(
      S.withDecodingDefault(Effect.succeed(false)),
      S.withConstructorDefault(Effect.succeed(false)),
    ),
  debug: S.Boolean.annotate({ description: "Enable debug output. Default: false." })
    .pipe(
      S.withDecodingDefault(Effect.succeed(false)),
      S.withConstructorDefault(Effect.succeed(false)),
    ),
  outputDir: S.String.annotate({
    description: "Directory for validation output files. Default: './output'.",
  }).pipe(
    S.withDecodingDefault(Effect.succeed(DEFAULT_OUTPUT_DIR)),
    S.withConstructorDefault(Effect.succeed(DEFAULT_OUTPUT_DIR)),
  ),
  description: S.optional(S.String),
  maxViolationsPerField: S.optional(
    S.Number.check(S.isInt()).annotate({
      description: "Maximum number of violations to report per field.",
    }),
  ),
  enableSuggestions: S.Boolean.annotate({
    description: "Enable suggestion messages for violations. Default: true.",
  }).pipe(
    S.withDecodingDefault(Effect.succeed(true)),
    S.withConstructorDefault(Effect.succeed(true)),
  ),
  datasets: S.Array(datasetConfigSchema).annotate({ description: "Datasets to validate." })
    .pipe(
      S.withDecodingDefault(Effect.succeed([])),
      S.withConstructorDefault(Effect.succeed([])),
    ),
}).annotate({
  title: "Validation Settings",
  description: "Configuration for the validation workflow.",
});

const transformSettingsSchema = S.Struct({
  nullValues: S.Array(S.String).annotate({
    description: "Values to treat as null during transformation.",
    default: DEFAULT_NULL_VALUES,
  }).pipe(
    S.withDecodingDefault(Effect.succeed([...DEFAULT_NULL_VALUES])),
    S.withConstructorDefault(Effect.succeed(DEFAULT_NULL_VALUES)),
  ),
  inputs: S.Record(S.String, S.Unknown).annotate({
    description: "Input data source configuration.",
  }),
  postImportTransforms: S.optional(
    S.Array(S.String).annotate({ description: "SQL transforms to run after data import." }),
  ),
  datasets: S.Array(transformDatasetConfigSchema).annotate({
    description: "Datasets to transform.",
  }),
  output: S.Struct({
    outputDir: S.String.annotate({ description: "Directory for transform output files." }),
    outputFilesWithTimestamp: S.optional(
      S.Boolean.annotate({ description: "Append timestamp to output file names." }),
    ),
    exportDB: S.Boolean.annotate({
      description: "Whether to export the DuckDB database file.",
    }),
    exportDBFileName: S.optional(
      S.String.annotate({ description: "File name for the exported database." }),
    ),
    dropNullColumns: S.optional(
      S.Boolean.annotate({ description: "Drop columns that contain only null values." }),
    ),
  }).annotate({
    title: "Transform Output",
    description: "Output configuration for the transform workflow.",
  }),
}).annotate({
  title: "Transform Settings",
  description: "Configuration for the data transformation workflow.",
});

/** Filtered to ensure at least one of validation/transform is present. */
export const workspaceConfigSchema = S.Struct({
  id: S.String.annotate({
    description: "Unique workspace identifier (auto-generated UUID if omitted).",
  }).pipe(
    S.withDecodingDefault(Effect.sync(() => crypto.randomUUID())),
    S.withConstructorDefault(Effect.sync(() => crypto.randomUUID())),
  ),
  name: S.String.annotate({
    description: "Workspace name. Default: 'Workspace'.",
    default: DEFAULT_WORKSPACE_NAME,
  }).pipe(
    S.withDecodingDefault(Effect.succeed(DEFAULT_WORKSPACE_NAME)),
    S.withConstructorDefault(Effect.succeed(DEFAULT_WORKSPACE_NAME)),
  ),
  version: S.String.annotate({
    description: "Configuration version. Default: '1.0.0'.",
    default: DEFAULT_VERSION,
  }).pipe(
    S.withDecodingDefault(Effect.succeed(DEFAULT_VERSION)),
    S.withConstructorDefault(Effect.succeed(DEFAULT_VERSION)),
  ),
  description: S.optional(
    S.String.annotate({ description: "Human-readable workspace description." }),
  ),
  standard: ResolvedStandardSchema.annotate({
    description:
      "Target biodiversity standard. Accepts a string (e.g. 'obis') or object { base, variant }. " +
      "Known variants ('obis', 'gbif') are normalized to { base: 'darwin-core', variant: <name> }. " +
      "Default: { base: 'darwin-core', variant: 'obis' }.",
  }).pipe(
    S.withDecodingDefault(
      Effect.succeed({ base: "darwin-core", variant: "obis" } as ResolvedStandard),
    ),
    S.withConstructorDefault(
      Effect.succeed({ base: "darwin-core", variant: "obis" } as ResolvedStandard),
    ),
  ),
  datasetRules: S.optional(
    S.Array(datasetRuleSchema).annotate({
      description: "Foreign key and dependency rules across or within datasets.",
    }),
  ),
  createdAt: S.DateFromString.annotate({
    description: "Timestamp when the workspace was created.",
  }).pipe(
    S.annotateEncoded({ jsonSchema: { type: "string", format: "date-time" } }),
    S.withDecodingDefault(Effect.sync(() => new Date().toISOString())),
    S.withConstructorDefault(Effect.sync(() => new Date())),
  ),
  updatedAt: S.DateFromString.annotate({
    description: "Timestamp when the workspace was last updated.",
  }).pipe(
    S.annotateEncoded({ jsonSchema: { type: "string", format: "date-time" } }),
    S.withDecodingDefault(Effect.sync(() => new Date().toISOString())),
    S.withConstructorDefault(Effect.sync(() => new Date())),
  ),
  validation: S.optional(validationSettingsSchema),
  transform: S.optional(transformSettingsSchema),
}).annotate({
  title: "DarwinKit Workspace Configuration",
  description:
    "Top-level configuration for a DarwinKit workspace. Must include at least one of 'validation' or 'transform'.",
}).check(
  S.makeFilter((config) =>
    config.validation !== undefined || config.transform !== undefined ||
    "Workspace config must have 'validation' and/or 'transform' settings"
  ),
);

export type ValidationSettings = typeof validationSettingsSchema.Type;
export type ValidationSettingsInput = typeof validationSettingsSchema.Encoded;
export type TransformSettings = typeof transformSettingsSchema.Type;
export type WorkspaceFieldMapping = typeof workspaceFieldMappingSchema.Type;
export type DatasetRuleConfig = typeof datasetRuleSchema.Type;
export type DatasetConfig = typeof datasetConfigSchema.Type;
export type WorkspaceConfig = typeof workspaceConfigSchema.Type;

export interface ForeignKeyRuleMatch {
  readonly targetDataset: string;
  readonly targetField: string;
  readonly requirement: RequirementLevel;
}

export type ConfigWithValidation = WorkspaceConfig & { validation: ValidationSettings };

export type ConfigWithTransform = WorkspaceConfig & { transform: TransformSettings };

export const hasValidationConfig = (c: WorkspaceConfig): c is ConfigWithValidation =>
  c.validation !== undefined;

export const hasTransformationConfig = (c: WorkspaceConfig): c is ConfigWithTransform =>
  c.transform !== undefined;

/** Input type for makeWorkspaceConfig - allows partial settings with defaults applied */
export type WorkspaceConfigInput = typeof workspaceConfigSchema.Encoded;

/**
 * Create a WorkspaceConfig with defaults applied.
 *
 * Uses schema decoding to apply defaults to both workspace fields and nested
 * validation settings. All defaults are defined in the schema itself.
 *
 * @example
 * ```typescript
 * const config = makeWorkspaceConfig({
 *   validation: {
 *     datasets: [{ name: "events", class: "Event", path: "./events.csv", fieldMappings: [] }]
 *   }
 * });
 * // id, name, version, standard, createdAt, updatedAt are auto-generated
 * // validation.nullValues, failFast, debug, outputDir get defaults
 * ```
 */
export function makeWorkspaceConfig(input: WorkspaceConfigInput): WorkspaceConfig {
  return S.decodeUnknownSync(workspaceConfigSchema)(input);
}

/**
 * Decode unknown external data into a WorkspaceConfig. Use this when parsing configuration from YAML
 *
 * @param input - Unknown data to decode
 * @returns Decoded WorkspaceConfig with defaults applied
 * @throws ParseError if the input doesn't match the schema
 */
export const decodeWorkspaceConfig = (input: unknown): WorkspaceConfig => {
  return S.decodeUnknownSync(workspaceConfigSchema)(input);
};

/**
 * Decode unknown external data into a WorkspaceConfig, failing with a `SchemaError`
 * in the typed error channel instead of throwing.
 *
 * Prefer this over {@link decodeWorkspaceConfig} when composing inside an Effect
 * pipeline: the failure stays in the channel and carries the structured issue tree,
 * which {@link formatConfigValidationErrors} turns into path-qualified messages.
 */
export const decodeWorkspaceConfigEffect = (
  input: unknown,
): Effect.Effect<WorkspaceConfig, S.SchemaError> =>
  S.decodeUnknownEffect(workspaceConfigSchema)(input);

const configIssueFormatter = SchemaIssue.makeFormatterStandardSchemaV1();

/**
 * Flatten a config-decoding `SchemaError` into path-qualified validation messages.
 *
 * Each leaf issue becomes one entry: nested issues are prefixed with their dotted
 * field path (e.g. `"validation.datasets.0.class: Missing key"`), while top-level
 * failures (empty path) render the message alone. This preserves the structured
 * issue tree that stringifying the error would otherwise flatten and lose.
 */
export const formatConfigValidationErrors = (
  error: S.SchemaError,
): readonly string[] =>
  configIssueFormatter(error.issue).issues.map((issue) => {
    const path = (issue.path ?? []).map((segment) => String(segment)).join(".");
    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
  });

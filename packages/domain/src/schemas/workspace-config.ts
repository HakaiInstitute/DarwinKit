import * as S from "effect/Schema";
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
const ResolvedStandardSchema: S.Schema<
  ResolvedStandard,
  string | { base: string; variant?: string }
> = S.Union(
  S.transform(
    S.String,
    S.Struct({ base: S.String, variant: S.optional(S.String) }),
    {
      strict: true,
      decode: (s) => KNOWN_VARIANTS.has(s) ? { base: "darwin-core", variant: s } : { base: s },
      encode: (obj) => obj.variant ?? obj.base,
    },
  ),
  ResolvedStandardStruct,
);

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
export const workspaceFieldMappingSchema = S.Struct({
  originName: S.String.annotations({ description: "Source column name in the CSV file." }),
  targetName: S.String.annotations({ description: "Target Darwin Core field name." }),
  requirement: S.optional(RequirementLevel),
  constraints: S.optional(S.Array(ConstraintSchema)),
  preset: S.optional(S.String),
});

export const workspaceCrossDatasetRuleSchema = S.Struct({
  ruleType: S.Literal("foreignKey").annotations({
    description: "Type of cross-dataset rule.",
  }),
  sourceDataset: S.String.annotations({ description: "Name of the source dataset." }),
  sourceField: S.String.annotations({ description: "Field name in the source dataset." }),
  targetDataset: S.String.annotations({ description: "Name of the target dataset." }),
  targetField: S.String.annotations({ description: "Field name in the target dataset." }),
  requirement: S.optional(RequirementLevel),
  description: S.optional(S.String),
}).annotations({
  title: "Cross-Dataset Rule",
  description: "Defines a foreign key constraint between two datasets.",
});

export const datasetConfigSchema = S.Struct({
  name: S.String.annotations({ description: "Unique name for this dataset." }),
  class: S.String.annotations({
    description:
      "Darwin Core class: Event, Occurrence, Taxon, ExtendedMeasurementOrFact, dnaDerivedData, ResourceRelationship.",
  }),
  path: S.String.annotations({ description: "File path to the CSV data file." }),
  description: S.optional(S.String),
  fieldMappings: S.optional(
    S.Array(workspaceFieldMappingSchema).annotations({
      description: "Mappings from CSV columns to Darwin Core fields.",
    }),
  ),
}).annotations({
  title: "Dataset Configuration",
  description:
    "Configuration for a single dataset to validate against a Darwin Core specification.",
});

export const transformDatasetConfigSchema = S.Struct({
  name: S.String.annotations({ description: "Unique name for this transform dataset." }),
  class: S.String.annotations({
    description: "Darwin Core class for the transform output.",
  }),
  source: S.optional(S.Object),
  description: S.optional(S.String),
  fields: S.optional(S.Object),
}).annotations({
  title: "Transform Dataset Configuration",
  description: "Configuration for a dataset in a transform workflow.",
});

/**
 * Uses two default patterns for optional fields:
 * - `S.optionalWith(schema, { default: () => value })` - Applies defaults during decoding
 * - `.pipe(S.withConstructorDefault(() => value))` - Applies defaults when using schema.make()
 */
export const validationSettingsSchema = S.Struct({
  nullValues: S.optionalWith(
    S.Array(S.String).annotations({
      description: "Values to treat as null during validation.",
      default: DEFAULT_NULL_VALUES,
    }),
    { default: () => [...DEFAULT_NULL_VALUES] },
  ).pipe(S.withConstructorDefault(() => [...DEFAULT_NULL_VALUES])),
  failFast: S.optionalWith(
    S.Boolean.annotations({ description: "Stop validation on first error. Default: false." }),
    { default: () => false },
  ).pipe(S.withConstructorDefault(() => false)),
  debug: S.optionalWith(
    S.Boolean.annotations({ description: "Enable debug output. Default: false." }),
    { default: () => false },
  ).pipe(S.withConstructorDefault(() => false)),
  outputDir: S.optionalWith(
    S.String.annotations({
      description: "Directory for validation output files. Default: './output'.",
    }),
    { default: () => DEFAULT_OUTPUT_DIR },
  ).pipe(S.withConstructorDefault(() => DEFAULT_OUTPUT_DIR)),
  description: S.optional(S.String),
  maxViolationsPerField: S.optional(
    S.Number.pipe(S.int()).annotations({
      description: "Maximum number of violations to report per field.",
    }),
  ),
  enableSuggestions: S.optionalWith(
    S.Boolean.annotations({
      description: "Enable suggestion messages for violations. Default: true.",
    }),
    { default: () => true },
  ).pipe(S.withConstructorDefault(() => true)),
  datasets: S.optionalWith(
    S.Array(datasetConfigSchema).annotations({ description: "Datasets to validate." }),
    { default: () => [] },
  ).pipe(S.withConstructorDefault(() => [])),
}).annotations({
  title: "Validation Settings",
  description: "Configuration for the validation workflow.",
});

export const transformSettingsSchema = S.Struct({
  nullValues: S.optionalWith(
    S.Array(S.String).annotations({
      description: "Values to treat as null during transformation.",
      default: DEFAULT_NULL_VALUES,
    }),
    { default: () => [...DEFAULT_NULL_VALUES] },
  ).pipe(S.withConstructorDefault(() => DEFAULT_NULL_VALUES)),
  inputs: S.Object.annotations({ description: "Input data source configuration." }),
  postImportTransforms: S.optional(
    S.Array(S.String).annotations({ description: "SQL transforms to run after data import." }),
  ),
  datasets: S.Array(transformDatasetConfigSchema).annotations({
    description: "Datasets to transform.",
  }),
  output: S.Struct({
    outputDir: S.String.annotations({ description: "Directory for transform output files." }),
    outputFilesWithTimestamp: S.optional(
      S.Boolean.annotations({ description: "Append timestamp to output file names." }),
    ),
    exportDB: S.Boolean.annotations({
      description: "Whether to export the DuckDB database file.",
    }),
    exportDBFileName: S.optional(
      S.String.annotations({ description: "File name for the exported database." }),
    ),
    dropNullColumns: S.optional(
      S.Boolean.annotations({ description: "Drop columns that contain only null values." }),
    ),
  }).annotations({
    title: "Transform Output",
    description: "Output configuration for the transform workflow.",
  }),
}).annotations({
  title: "Transform Settings",
  description: "Configuration for the data transformation workflow.",
});

/** Filtered to ensure at least one of validation/transform is present. */
export const workspaceConfigSchema = S.Struct({
  id: S.optionalWith(
    S.String.annotations({
      description: "Unique workspace identifier (auto-generated UUID if omitted).",
    }),
    { default: () => crypto.randomUUID() },
  ).pipe(S.withConstructorDefault(() => crypto.randomUUID())),
  name: S.optionalWith(
    S.String.annotations({
      description: "Workspace name. Default: 'Workspace'.",
      default: DEFAULT_WORKSPACE_NAME,
    }),
    { default: () => DEFAULT_WORKSPACE_NAME },
  ).pipe(S.withConstructorDefault(() => DEFAULT_WORKSPACE_NAME)),
  version: S.optionalWith(
    S.String.annotations({
      description: "Configuration version. Default: '1.0.0'.",
      default: DEFAULT_VERSION,
    }),
    { default: () => DEFAULT_VERSION },
  ).pipe(S.withConstructorDefault(() => DEFAULT_VERSION)),
  description: S.optional(
    S.String.annotations({ description: "Human-readable workspace description." }),
  ),
  standard: S.optionalWith(
    ResolvedStandardSchema.annotations({
      description:
        "Target biodiversity standard. Accepts a string (e.g. 'obis') or object { base, variant }. " +
        "Known variants ('obis', 'gbif') are normalized to { base: 'darwin-core', variant: <name> }. " +
        "Default: { base: 'darwin-core', variant: 'obis' }.",
    }),
    { default: () => ({ base: "darwin-core", variant: "obis" }) as ResolvedStandard },
  ).pipe(
    S.withConstructorDefault(() => ({ base: "darwin-core", variant: "obis" }) as ResolvedStandard),
  ),
  crossDatasetRules: S.optional(
    S.Array(workspaceCrossDatasetRuleSchema).annotations({
      description: "Foreign key constraints between datasets.",
    }),
  ),
  createdAt: S.optionalWith(
    S.Date.annotations({
      jsonSchema: { type: "string", format: "date-time" },
      description: "Timestamp when the workspace was created.",
    }),
    { default: () => new Date() },
  ).pipe(S.withConstructorDefault(() => new Date())),
  updatedAt: S.optionalWith(
    S.Date.annotations({
      jsonSchema: { type: "string", format: "date-time" },
      description: "Timestamp when the workspace was last updated.",
    }),
    { default: () => new Date() },
  ).pipe(S.withConstructorDefault(() => new Date())),
  validation: S.optional(validationSettingsSchema),
  transform: S.optional(transformSettingsSchema),
}).annotations({
  title: "DarwinKit Workspace Configuration",
  description:
    "Top-level configuration for a DarwinKit workspace. Must include at least one of 'validation' or 'transform'.",
}).pipe(
  S.filter(
    (config) => config.validation !== undefined || config.transform !== undefined,
    { message: () => "Workspace config must have 'validation' and/or 'transform' settings" },
  ),
);

export type ValidationSettings = S.Schema.Type<typeof validationSettingsSchema>;
export type ValidationSettingsInput = S.Schema.Encoded<typeof validationSettingsSchema>;
export type TransformSettings = S.Schema.Type<typeof transformSettingsSchema>;
export type WorkspaceFieldMapping = S.Schema.Type<typeof workspaceFieldMappingSchema>;
export type WorkspaceCrossDatasetRule = S.Schema.Type<typeof workspaceCrossDatasetRuleSchema>;
export type DatasetConfig = S.Schema.Type<typeof datasetConfigSchema>;
export type WorkspaceConfig = S.Schema.Type<typeof workspaceConfigSchema>;

export type ForeignKeyRuleMatch =
  & Pick<WorkspaceCrossDatasetRule, "targetDataset" | "targetField">
  & Required<Pick<WorkspaceCrossDatasetRule, "requirement">>;

export type ConfigWithValidation = WorkspaceConfig & { validation: ValidationSettings };

export type ConfigWithTransform = WorkspaceConfig & { transform: TransformSettings };

export const hasValidationConfig = (c: WorkspaceConfig): c is ConfigWithValidation =>
  c.validation !== undefined;

export const hasTransformationConfig = (c: WorkspaceConfig): c is ConfigWithTransform =>
  c.transform !== undefined;

/** Input type for makeWorkspaceConfig - allows partial settings with defaults applied */
export type WorkspaceConfigInput = S.Schema.Encoded<typeof workspaceConfigSchema>;

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
export const decodeWorkspaceConfig = (input: unknown): WorkspaceConfig =>
  S.decodeUnknownSync(workspaceConfigSchema)(input);

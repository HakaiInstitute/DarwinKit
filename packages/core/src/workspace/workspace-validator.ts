/**
 * Workspace Validator - Config-based multi-dataset validation
 *
 * Validates multiple datasets within a workspace according to their specifications.
 * Uses field mappings to validate CSV columns against spec field definitions.
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBConnection as DuckDB } from "@duckdb/node-api";
import { dirname, resolve } from "@std/path";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

import type {
  CrossDatasetValidationResult,
  DatasetConfig,
  DatasetValidationResult,
  EnforcementLevel,
  FieldDefinition,
  ValidationProfile,
  ValidationSettings,
  ValidationViolation,
  ValidatorConfig,
  VocabularyEnforcement,
  VocabularyKey,
  WorkspaceFieldMapping,
  WorkspaceValidationResult,
} from "@dwkt/domain";
import {
  CrossDatasetViolation,
  enforcementToSeverity,
  ErrorCode,
  FieldRequirementLevel,
  getValidationProfile,
  getVocabularyValues,
  hasControlledVocabulary,
  isValidVocabularyValue,
  parseSpecIdentifier,
  RangeViolation,
  UniquenessViolation,
  VocabularyViolation,
} from "@dwkt/domain";
import { WorkspaceConfigService } from "./workspace-config-service.ts";

/**
 * Error classes for workspace validation
 */
const WorkspaceValidationErrorBase = Data.TaggedClass("WorkspaceValidationError")<{
  readonly message: string;
  readonly code: ErrorCode;
  readonly cause?: Error;
}>;

/**
 * Represents an error that occurs during the data importing process.
 */
export class WorkspaceImportError extends WorkspaceValidationErrorBase { }

export class WorkspaceValidationError extends WorkspaceValidationErrorBase {}


export function WorkspaceImportCSV(connection: DuckDBConnection, tableName: string, fullPath: any, nullStr: any, dropTable: boolean = false): Effect.Effect<void, WorkspaceImportError> {
  return Effect.gen(function* (_) {
    yield* _(Effect.tryPromise({
      try: () =>{
        if (dropTable){
          // Drop table if it exists, then create from CSV
          connection.run( `DROP TABLE IF EXISTS ${tableName}`);
        }
        // Create a table from the CSV file, using the specified null values.
        return connection.run(
          `CREATE TABLE IF NOT EXISTS ${tableName} AS SELECT * FROM read_csv_auto('${fullPath}', nullstr=[${nullStr}])`
        )
      },
      catch: (error) => {
        console.error(error);
        return new WorkspaceImportError({
          message: `Failed to create table '${tableName}' from CSV ${fullPath}`,
          code: ErrorCode.DATABASE_ERROR,
          cause: error instanceof Error ? error : new Error(String(error)),
        });
      },
    }));
  });
}


/**
 * Workspace validator for config-based validation
 */
export class WorkspaceValidator {
  private readonly workspacesDir: string;

  constructor({ workspacesDir = "./workspaces" }: { workspacesDir?: string } = {}) {
    this.workspacesDir = workspacesDir;
  }

  /**
   * Validate workspace from configuration file
   *
   * This is the main entry point for config-based validation.
   *
   * @param configPath - Optional path to configuration directory
   * @param options - Optional overrides for validation settings
   */
  validateFromConfig(
    configPath?: string,
    options?: {
      failFast?: boolean;
    },
  ): Effect.Effect<WorkspaceValidationResult, WorkspaceValidationError> {
    return Effect.gen(function* (_) {
      const startTime = Date.now();

      // Discover and load configuration (schema already validates structure)
      const { config: loadedConfig, configPath: resolvedConfigPath } = yield* _(
        WorkspaceConfigService.discoverAndLoad(configPath).pipe(
          Effect.mapError((error) =>
            new WorkspaceValidationError({
              message: `Failed to load workspace config: ${error.message}`,
              code: ErrorCode.VALIDATION_FAILED,
              cause: error instanceof Error ? error : new Error(String(error)),
            })
          ),
        ),
      );

      // Narrow the config type to ensure it has validation settings and datasets
      if (!("validation" in loadedConfig)) {
        return yield* _(
          Effect.fail(
            new WorkspaceValidationError({
              message: `Configuration '${resolvedConfigPath}' does not contain validation settings`,
              code: ErrorCode.INVALID_CONFIG,
            }),
          ),
        );
      }

      if (!("datasets" in loadedConfig.validation)) {
        return yield* _(
          Effect.fail(
            new WorkspaceValidationError({
              message: `Configuration '${resolvedConfigPath}' does not contain datasets`,
              code: ErrorCode.INVALID_CONFIG,
            }),
          ),
        );
      }

      // At this point TypeScript knows config has validation property and datasets
      const config = loadedConfig;

      // Override validation settings with CLI options if provided
      const validationSettings = options?.failFast !== undefined
        ? { ...config.validation, failFast: options.failFast }
        : config.validation;

      // Load validation profile if specified
      const validationProfile = config.validation.profile
        ? getValidationProfile(config.validation.profile)
        : undefined;

      // Create workspace and load all datasets
      const { workspaceId, connection } = yield* _(
        createWorkspaceFromConfig(
          config.id,
          config.validation.datasets,
          validationSettings,
          dirname(resolvedConfigPath),
        ),
      );

      // Perform validation with guaranteed connection cleanup
      return yield* _(
        Effect.gen(function* (_) {
          // Validate each dataset
          const datasetResults: DatasetValidationResult[] = [];

          for (const dataset of config.validation.datasets) {
            // Use dataset-level profile if specified, otherwise use validation-level profile,
            // otherwise derive from spec field
            let datasetProfile = dataset.profile
              ? getValidationProfile(dataset.profile)
              : validationProfile;

            // If still no profile, try to derive from spec field
            if (!datasetProfile && dataset.spec) {
              const parsed = parseSpecIdentifier(dataset.spec);
              if (parsed) {
                // Capitalize the type to match profile names (e.g., "event" -> "Event")
                const derivedProfileId = parsed.type.charAt(0).toUpperCase() + parsed.type.slice(1);
                datasetProfile = getValidationProfile(derivedProfileId);
              }
            }

            const result = yield* _(
              validateDataset(connection, dataset, datasetProfile),
            );

            datasetResults.push(result);

            // Fail-fast if enabled and we have critical errors
            if (validationSettings.failFast && result.status === "fail") {
              break;
            }
          }

          // Validate cross-dataset rules if provided
          const crossDatasetResults: CrossDatasetValidationResult[] = [];
          if (config.crossDatasetRules && !validationSettings.failFast) {
            for (const rule of config.crossDatasetRules) {
              const result = yield* _(
                validateCrossDatasetRule(connection, rule),
              );
              crossDatasetResults.push(result);
            }
          }

          // Calculate summary
          const summary = calculateSummary(datasetResults);
          const totalProcessingTimeMs = Date.now() - startTime;

          const overallStatus: "fail" | "warn" | "pass" = summary.datasetsFailedCount > 0
            ? "fail"
            : summary.datasetsWithWarningsCount > 0
            ? "warn"
            : "pass";

          return {
            workspaceId,
            configPath: resolvedConfigPath,
            validatedAt: new Date(),
            totalProcessingTimeMs,
            overallStatus,
            datasetResults,
            crossDatasetResults,
            summary,
          };
        }).pipe(
          // Ensure connection is closed even if validation fails (ignores any errors during cleanup)
          Effect.ensuring(Effect.try(() => connection.closeSync()).pipe(Effect.ignore)),
        ),
      );
    });
  }
}

/**
 * Create workspace and load all datasets from config
 */
function createWorkspaceFromConfig(
  workspaceId: string,
  datasets: readonly DatasetConfig[],
  validationSettings: ValidationSettings,
  basePath: string,
): Effect.Effect<
  { workspaceId: string; connection: DuckDBConnection },
  WorkspaceValidationError
> {
  return Effect.gen(function* (_) {
    // Create DuckDB connection - failure is a system defect
    const connection = yield* _(
      Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
    );

    // Load each dataset into DuckDB
    for (const dataset of datasets) {
      const filePath = resolve(basePath, dataset.path);
      const tableName = sanitizeTableName(dataset.name);

      // Build null values string for DuckDB
      const nullStr = validationSettings.nullValues.map((v: string) => `'${v}'`).join(", ");
      const dropTable = true;
      yield* _(WorkspaceImportCSV(connection, tableName, filePath, nullStr, dropTable));
    }

    return { workspaceId, connection };
  });
}

/**
 * Merge field definition with profile and field-level overrides
 *
 * Priority: field override > profile > base spec
 */
function mergeFieldDefinition(
  baseField: FieldDefinition | undefined,
  profile: ValidationProfile | undefined,
  fieldMapping: WorkspaceFieldMapping,
): FieldDefinition | undefined {
  if (!baseField) {
    return undefined;
  }

  // Start with base field
  let merged: FieldDefinition = { ...baseField };

  // Apply profile overrides if profile exists and has overrides for this field
  if (profile && profile.fieldOverrides[fieldMapping.targetName]) {
    const profileOverride = profile.fieldOverrides[fieldMapping.targetName];

    // Merge validators (append profile validators to base validators)
    if (profileOverride.validators) {
      merged = {
        ...merged,
        validators: [
          ...(merged.validators || []),
          ...(profileOverride.validators as ValidatorConfig[]),
        ],
      };
    }
  }

  // Apply field-level overrides from config (highest priority)
  if (fieldMapping.validators) {
    merged = {
      ...merged,
      validators: [
        ...(merged.validators || []),
        ...(fieldMapping.validators as ValidatorConfig[]),
      ],
    };
  }

  return merged;
}

/**
 * Validate a single dataset according to its spec
 */
function validateDataset(
  connection: DuckDBConnection,
  dataset: DatasetConfig,
  profile?: ValidationProfile,
): Effect.Effect<DatasetValidationResult, WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    const startTime = Date.now();
    const tableName = sanitizeTableName(dataset.name);

    // Get row count - infrastructure query should always work (defect if it fails)
    const countResult = yield* _(
      Effect.tryPromise(() =>
        connection.runAndReadAll(`SELECT COUNT(*) as count FROM ${tableName}`)
      ).pipe(Effect.orDie),
    );

    const rawCount = countResult.getRowObjects()[0].count;
    const rowsProcessed = typeof rawCount === "bigint" ? Number(rawCount) : rawCount as number;

    // Parse spec identifier
    const specInfo = parseSpecIdentifier(dataset.spec);
    if (!specInfo) {
      return yield* _(
        Effect.fail(
          new WorkspaceValidationError({
            message: `Invalid spec identifier: ${dataset.spec}`,
            code: ErrorCode.VALIDATION_FAILED,
          }),
        ),
      );
    }

    // Validate field mappings based on spec
    // NEW: Collect all violations as ValidationViolation[] for partitioning
    const allViolations: ValidationViolation[] = [];

    // OLD: Keep old structure for backward compatibility (will be deprecated)
    const typeErrors: Array<DatasetValidationResult["typeErrors"][number]> = [];
    const requiredFieldErrors: Array<DatasetValidationResult["requiredFieldErrors"][number]> = [];
    const warnings: Array<DatasetValidationResult["warnings"][number]> = [];
    const recommendations: Array<DatasetValidationResult["recommendations"][number]> = [];

    // Check profile field requirements based on requirement levels
    if (profile && profile.fieldOverrides && dataset.fieldMappings) {
      const mappedSpecFields = new Set(dataset.fieldMappings.map((m) => m.targetName));

      for (const [fieldName, fieldOverride] of Object.entries(profile.fieldOverrides)) {
        if (!fieldOverride.requirement) continue;

        const isMapped = mappedSpecFields.has(fieldName);

        if (!isMapped) {
          // Handle missing fields based on requirement level
          if (fieldOverride.requirement === FieldRequirementLevel.Required) {
            requiredFieldErrors.push({
              fieldName,
              targetName: fieldName,
              message:
                `Profile '${profile.name}' requires field '${fieldName}' but it is not mapped in the dataset`,
            });
          } else if (fieldOverride.requirement === FieldRequirementLevel.StronglyRecommended) {
            warnings.push({
              fieldName,
              targetName: fieldName,
              requirementLevel: "strongly-recommended",
              message:
                `Profile '${profile.name}' strongly recommends field '${fieldName}' but it is not mapped`,
            });
          } else if (fieldOverride.requirement === FieldRequirementLevel.Recommended) {
            recommendations.push({
              fieldName,
              targetName: fieldName,
              requirementLevel: "recommended",
              message:
                `Profile '${profile.name}' recommends field '${fieldName}' for better data quality`,
            });
          }
          // RequiredIfExists and Optional don't generate messages when missing
        }
      }
    }

    // Validate each field mapping
    for (const mapping of dataset?.fieldMappings || []) {
      // Require profile for validation - normalized fields are the source of truth
      if (!profile?.normalizedFields) {
        requiredFieldErrors.push({
          fieldName: mapping.originName,
          targetName: mapping.targetName,
          message:
            `No validation profile specified for dataset '${dataset.name}'. Please add a 'profile' property to the dataset configuration.`,
        });
        continue;
      }

      // Get field from normalized profile (already normalized at load time)
      // Use normalizedFields for validation (keeps raw fields for transformation)
      const baseField = profile.normalizedFields?.[mapping.targetName] as
        | FieldDefinition
        | undefined;

      // Validate that mapped fields exist in profile
      if (!baseField) {
        // Unknown field in profile
        requiredFieldErrors.push({
          fieldName: mapping.originName,
          targetName: mapping.targetName,
          message:
            `Unknown field '${mapping.targetName}' in profile '${profile.name}'. Please confirm the schema definition is up to date and that the fieldMappings in config file are correct.`,
        });
        continue;
      }

      // Merge with profile and field-level overrides
      const specField = mergeFieldDefinition(baseField, profile, mapping);

      // Check if CSV field exists
      const fieldExistsQuery = `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = '${tableName}' AND column_name = '${mapping.originName}'
      `;

      // Querying information_schema is infrastructure - should always work (defect if it fails)
      const fieldExistsResult = yield* _(
        Effect.tryPromise(() => connection.runAndReadAll(fieldExistsQuery)).pipe(
          Effect.orDie,
        ),
      );

      const fieldExists = fieldExistsResult.getRowObjects().length > 0;

      if (!fieldExists) {
        if (mapping.isRequired) {
          requiredFieldErrors.push({
            fieldName: mapping.originName,
            targetName: mapping.targetName,
            message: `Required field '${mapping.originName}' not found in CSV`,
          });
        } else {
          warnings.push({
            fieldName: mapping.originName,
            targetName: mapping.targetName,
            requirementLevel: "optional",
            message:
              `Mapped field '${mapping.originName}' not found in CSV. Please check the fieldMappings in the config file`,
          });
        }
        continue;
      }

      // Validate field using spec validators
      if (specField) {
        // Range/constraint validation
        const rangeViolations = yield* _(
          validateRangeConstraints(
            connection,
            tableName,
            mapping.originName,
            specField,
          ),
        );

        if (rangeViolations.length > 0) {
          // NEW: Add to allViolations for partitioning
          allViolations.push(...rangeViolations);
        }

        // Vocabulary validation
        const hasVocab = hasControlledVocabulary(specField);
        if (hasVocab) {
          const vocabResult = yield* _(
            validateVocabulary(
              connection,
              tableName,
              mapping.originName,
              specField,
            ),
          );

          // NEW: Add enriched violations to allViolations for partitioning
          if (vocabResult.enriched.length > 0) {
            allViolations.push(...vocabResult.enriched);
          }
        }

        // Uniqueness validation for fields with explicit unique validators
        const hasUniqueValidator = specField.validators
          ? (specField.validators.some((v) =>
            typeof v === "string" ? v === "uniqueIdentifier" : v.type === "unique"
          ))
          : false;
        if (hasUniqueValidator) {
          const uniqueResult = yield* _(
            validateUniqueness(
              connection,
              tableName,
              mapping.originName,
              specField,
            ),
          );

          // NEW: Add enriched violations to allViolations for partitioning
          if (uniqueResult.enriched.length > 0) {
            allViolations.push(...uniqueResult.enriched);
          }
        }
      }
    }

    const processingTimeMs = Date.now() - startTime;

    // NEW: Partition violations by enforcement level
    const partitioned = partitionViolations(allViolations);

    // Determine status based on errors (required violations) only
    const hasErrors = typeErrors.length > 0 ||
      requiredFieldErrors.length > 0 ||
      partitioned.errors.length > 0;

    const hasWarnings = warnings.length > 0 || partitioned.warnings.length > 0;

    const status = hasErrors ? "fail" : hasWarnings ? "warn" : "pass";

    return {
      datasetName: dataset.name,
      spec: dataset.spec ?? "",
      filePath: dataset.path ?? "",
      rowsProcessed,
      processingTimeMs,
      status,

      // NEW: Partitioned violations by enforcement level
      violations: partitioned,

      // OLD: Deprecated fields for backward compatibility
      typeErrors,
      requiredFieldErrors,
      warnings,
      recommendations,
    };
  });
}

/**
 * Validate cross-dataset rule
 */
/**
 * Find cross-dataset foreign key violations
 *
 * Returns fully-formed CrossDatasetViolation objects with all metadata.
 */
function findCrossDatasetViolations(
  connection: DuckDBConnection,
  rule: {
    ruleType?: string;
    sourceDataset: string;
    sourceField: string;
    targetDataset: string;
    targetField: string;
    enforcement?: EnforcementLevel;
  },
): Effect.Effect<CrossDatasetViolation[], never> {
  return Effect.gen(function* (_) {
    const sourceTable = sanitizeTableName(rule.sourceDataset);
    const targetTable = sanitizeTableName(rule.targetDataset);

    // Find values in source that don't exist in target
    const violationsQuery = `
      SELECT
        row_number() OVER() as row_num,
        s."${rule.sourceField}" as source_value
      FROM ${sourceTable} s
      LEFT JOIN ${targetTable} t ON s."${rule.sourceField}" = t."${rule.targetField}"
      WHERE s."${rule.sourceField}" IS NOT NULL
        AND t."${rule.targetField}" IS NULL
    `;

    // SQL query execution should work - query failure is a defect
    const violationsResult = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(violationsQuery)).pipe(Effect.orDie),
    );

    const rows = violationsResult.getRowObjects();
    const enforcement = rule.enforcement ?? "required";

    // Return fully-formed CrossDatasetViolation objects
    return rows.map((row) =>
      new CrossDatasetViolation({
        enforcement,
        severity: enforcementToSeverity(enforcement),
        fieldName: rule.sourceField,
        targetName: rule.targetField,
        rowNumber: Number(row.row_num),
        value: String(row.source_value),
        errorMessage:
          `Value '${row.source_value}' in ${rule.sourceDataset}.${rule.sourceField} does not exist in ${rule.targetDataset}.${rule.targetField}`,
        validatorType: rule.ruleType || "foreignKey",
        params: {
          sourceDataset: rule.sourceDataset,
          targetDataset: rule.targetDataset,
          targetField: rule.targetField,
        },
      })
    );
  });
}

/**
 * Validate cross-dataset rule
 *
 * Returns cross-dataset violations with enforcement level.
 */
function validateCrossDatasetRule(
  connection: DuckDBConnection,
  rule: {
    ruleType: string;
    sourceDataset: string;
    sourceField: string;
    targetDataset: string;
    targetField: string;
    enforcement?: string;
    description?: string;
  },
): Effect.Effect<CrossDatasetValidationResult, WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    // Map string enforcement to EnforcementLevel
    const enforcement: EnforcementLevel = rule.enforcement === "recommended"
      ? "recommended"
      : rule.enforcement === "optional"
      ? "optional"
      : "required";

    // Get fully-formed violations
    const crossDatasetViolations = yield* _(
      findCrossDatasetViolations(connection, { ...rule, enforcement }),
    );

    // Convert to old format for compatibility
    // TODO: Update CrossDatasetValidationResult to use ValidationViolation[]
    const violations = crossDatasetViolations.map((v) => ({
      rowNumber: v.rowNumber,
      sourceValue: v.value,
      errorMessage: v.errorMessage,
    }));

    return {
      ruleType: rule.ruleType as "foreignKey" | "referentialIntegrity",
      sourceDataset: rule.sourceDataset,
      sourceField: rule.sourceField,
      targetDataset: rule.targetDataset,
      targetField: rule.targetField,
      violations,
    };
  });
}

/**
 * Partition violations by enforcement level
 *
 * Separates ValidationViolation[] into errors, warnings, and info
 * based on enforcement level. This is the core routing logic that
 * enables fail-fast and severity-aware output.
 *
 * @param violations - Array of enriched violations
 * @returns Partitioned violations by enforcement level
 *
 * @example
 * ```typescript
 * const allViolations: ValidationViolation[] = [
 *   { enforcement: "required", ... },
 *   { enforcement: "recommended", ... },
 *   { enforcement: "optional", ... },
 * ];
 *
 * const partitioned = partitionViolations(allViolations);
 * // => {
 * //   errors: [...],     // required violations
 * //   warnings: [...],   // recommended violations
 * //   info: [...],       // optional violations
 * // }
 * ```
 */
function partitionViolations(
  violations: ReadonlyArray<ValidationViolation>,
): {
  readonly errors: ValidationViolation[];
  readonly warnings: ValidationViolation[];
  readonly info: ValidationViolation[];
} {
  const errors: ValidationViolation[] = [];
  const warnings: ValidationViolation[] = [];
  const info: ValidationViolation[] = [];

  for (const violation of violations) {
    switch (violation.enforcement) {
      case "required":
        errors.push(violation);
        break;
      case "recommended":
        warnings.push(violation);
        break;
      case "optional":
        info.push(violation);
        break;
    }
  }

  return { errors, warnings, info };
}

/**
 * Calculate summary statistics across all dataset results
 */
function calculateSummary(datasetResults: readonly DatasetValidationResult[]): {
  readonly totalDatasets: number;
  readonly datasetsPassedCount: number;
  readonly datasetsWithWarningsCount: number;
  readonly datasetsFailedCount: number;
  readonly totalErrors: number;
  readonly totalWarnings: number;
  readonly totalInfo: number;
  readonly totalRowsProcessed: number;
} {
  let datasetsPassedCount = 0;
  let datasetsWithWarningsCount = 0;
  let datasetsFailedCount = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalInfo = 0;
  let totalRowsProcessed = 0;

  for (const result of datasetResults) {
    totalRowsProcessed += result.rowsProcessed;

    // NEW: Count violations by severity from partitioned structure
    totalErrors += result.violations.errors.length;
    totalWarnings += result.violations.warnings.length;
    totalInfo += result.violations.info.length;

    // Also count old-style errors for backward compatibility
    totalErrors += result.typeErrors.length + result.requiredFieldErrors.length;
    totalWarnings += result.warnings.length;

    if (result.status === "pass") {
      datasetsPassedCount++;
    } else if (result.status === "warn") {
      datasetsWithWarningsCount++;
    } else {
      datasetsFailedCount++;
    }
  }

  return {
    totalDatasets: datasetResults.length,
    datasetsPassedCount,
    datasetsWithWarningsCount,
    datasetsFailedCount,
    totalErrors,
    totalWarnings,
    totalInfo,
    totalRowsProcessed,
  };
}

/**
 * Validate range constraints for a field
 */
/**
 * Find range violations for a single validator
 *
 * Returns fully-formed RangeViolation objects with all metadata.
 */
function findRangeViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  validator: ValidatorConfig,
  specField: FieldDefinition,
): Effect.Effect<RangeViolation[], never> {
  return Effect.gen(function* (_) {
    const { min, max, inclusive = true } = validator.params || {};

    if (min === undefined && max === undefined) return [];

    // Build range condition
    const conditions: string[] = [];
    if (min !== undefined) {
      conditions.push(
        inclusive ? `"${fieldName}" < ${min}` : `"${fieldName}" <= ${min}`,
      );
    }
    if (max !== undefined) {
      conditions.push(
        inclusive ? `"${fieldName}" > ${max}` : `"${fieldName}" >= ${max}`,
      );
    }

    const rangeCondition = conditions.join(" OR ");

    // Use CTE to assign row numbers before filtering (ensures row numbers match original table)
    const query = `
      WITH numbered_rows AS (
        SELECT
          "${fieldName}",
          row_number() OVER() as row_num
        FROM ${tableName}
        WHERE "${fieldName}" IS NOT NULL
      )
      SELECT
        row_num,
        "${fieldName}" as value
      FROM numbered_rows
      WHERE (${rangeCondition})
      LIMIT 100
    `;

    // SQL query execution should work - query failure is a defect
    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(Effect.orDie),
    );

    const rows = result.getRowObjects();

    // Return fully-formed RangeViolation objects
    return rows.map((row) =>
      new RangeViolation({
        enforcement: validator.enforcement,
        severity: enforcementToSeverity(validator.enforcement),
        fieldName,
        targetName: specField.name,
        rowNumber: Number(row.row_num),
        value: String(row.value),
        errorMessage: validator.message || `Value out of range`,
        validatorType: validator.type,
        params: validator.params,
      })
    );
  });
}

/**
 * Validate range constraints for a field
 *
 * Calls findRangeViolations() for each range validator.
 */
function validateRangeConstraints(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): Effect.Effect<ValidationViolation[], WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    const violations: ValidationViolation[] = [];

    if (!specField.validators || !Array.isArray(specField.validators)) {
      return violations;
    }

    // Get range validators (now always ValidatorConfig[] after normalization)
    const rangeValidators = specField.validators.filter((v) => v.type === "range");

    for (const validator of rangeValidators) {
      // Normalize validator format: JSON schema may have min/max at top level,
      // but ValidatorConfig expects them under params
      // Treat validator as unknown to safely check for legacy top-level properties
      const validatorUnknown = validator as unknown as Record<string, unknown>;
      const normalizedValidator = {
        type: validator.type,
        enforcement: validator.enforcement || "required",
        message: validator.message,
        params: validator.params || {
          min: typeof validatorUnknown.min === "number" ? validatorUnknown.min : undefined,
          max: typeof validatorUnknown.max === "number" ? validatorUnknown.max : undefined,
          inclusive: typeof validatorUnknown.inclusive === "boolean"
            ? validatorUnknown.inclusive
            : true,
        },
      };

      const rangeViolations = yield* _(
        findRangeViolations(connection, tableName, fieldName, normalizedValidator, specField),
      );

      violations.push(...rangeViolations);
    }

    return violations;
  });
}

/**
 * Validate controlled vocabulary for a field
 */
/**
 * Map VocabularyEnforcement to EnforcementLevel
 *
 * Converts vocabulary-specific enforcement to standard enforcement levels:
 * - strict → required (ERROR)
 * - recommended → recommended (WARNING)
 * - loose → (no violations generated - any value accepted)
 *
 * Note: This mapping is only used for strict/recommended enforcement.
 * Loose enforcement is handled separately by skipping validation entirely.
 */
function vocabularyEnforcementToStandard(
  vocabEnforcement: VocabularyEnforcement,
): EnforcementLevel {
  switch (vocabEnforcement) {
    case "strict":
      return "required";
    case "recommended":
      return "recommended";
    case "loose":
      return "optional"; // Not actually used - loose enforcement skips validation
  }
}

/**
 * Find vocabulary violations using vocabulary key
 *
 * Returns fully-formed VocabularyViolation objects with all metadata.
 */
function findVocabularyViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  vocabularyKey: VocabularyKey,
  specField: FieldDefinition,
  enforcement: EnforcementLevel,
  caseSensitive = false,
): Effect.Effect<VocabularyViolation[], WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    // Get distinct values from the field with row numbers
    const query = `
      WITH numbered_rows AS (
        SELECT
          "${fieldName}",
          row_number() OVER() as row_num
        FROM ${tableName}
        WHERE "${fieldName}" IS NOT NULL
      )
      SELECT
        "${fieldName}" as value,
        list(row_num) as row_numbers
      FROM numbered_rows
      GROUP BY "${fieldName}"
    `;

    // SQL query execution should work - query failure is a defect
    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(Effect.orDie),
    );

    const rows = result.getRowObjects();
    const violations: VocabularyViolation[] = [];

    for (const row of rows) {
      const value = String(row.value);
      const rawRowNumbers = row.row_numbers;

      let rowNumbers: number[] = [];
      if (Array.isArray(rawRowNumbers)) {
        rowNumbers = rawRowNumbers.map((n) => Number(n));
      } else if (rawRowNumbers && typeof rawRowNumbers === "object" && "items" in rawRowNumbers) {
        rowNumbers = rawRowNumbers.items.map((n) => Number(n));
      }

      // Check if value is valid in vocabulary
      let isValid = false;
      if (caseSensitive) {
        isValid = isValidVocabularyValue(vocabularyKey, value);
      } else {
        const vocabValues = yield* _(
          getVocabularyValues(vocabularyKey).pipe(
            Effect.catchAll(() => Effect.succeed([] as readonly string[])),
          ),
        );
        const lowerValue = value.toLowerCase();
        isValid = (vocabValues as readonly string[]).some((v) => v.toLowerCase() === lowerValue);
      }

      if (!isValid) {
        // Add violation for each row with this invalid value
        for (const rowNum of rowNumbers) {
          violations.push(
            new VocabularyViolation({
              enforcement,
              severity: enforcementToSeverity(enforcement),
              fieldName,
              targetName: specField.name,
              rowNumber: Number(rowNum),
              value,
              errorMessage: `Invalid vocabulary value: "${value}"`,
              validatorType: "vocabulary",
              // TODO: Add fuzzy matching for suggestions
            }),
          );
        }
      }
    }

    return violations;
  });
}

/**
 * Validate controlled vocabulary for a field
 *
 * Returns ValidationViolation[] for new enforcement-aware infrastructure.
 * Also returns old format for backward compatibility.
 */
function validateVocabulary(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): Effect.Effect<
  {
    enriched: ValidationViolation[];
    legacy: Array<{ rowNumber: number; value: string; suggestedValues?: string[] }>;
  },
  WorkspaceValidationError
> {
  return Effect.gen(function* (_) {
    // After normalization, vocabulary config is always present if field has controlled vocabulary
    if (!specField.vocabulary) {
      return { enriched: [], legacy: [] };
    }

    const { vocabularyKey, caseSensitive = false, enforcement = "strict" } = specField.vocabulary;

    // Skip validation for loose enforcement - any value is accepted
    if (enforcement === "loose") {
      return { enriched: [], legacy: [] };
    }

    // Map vocabulary enforcement to standard enforcement level
    const standardEnforcement = vocabularyEnforcementToStandard(enforcement);

    // Get fully-formed violations
    const enriched = yield* _(
      findVocabularyViolations(
        connection,
        tableName,
        fieldName,
        vocabularyKey as VocabularyKey,
        specField,
        standardEnforcement,
        caseSensitive,
      ),
    );

    // Also return legacy format for backward compatibility
    const legacy = enriched.map((v) => ({
      rowNumber: v.rowNumber,
      value: v.value,
      suggestedValues: v.suggestedValues ? [...v.suggestedValues] : undefined,
    }));

    return { enriched, legacy };
  });
}

/**
 * Find uniqueness violations
 *
 * Returns fully-formed UniquenessViolation objects with all metadata.
 *
 * Note: This "explodes" duplicate values into individual violations,
 * so a value duplicated 3 times creates 3 UniquenessViolations.
 */
function findUniquenessViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
  enforcement: EnforcementLevel,
): Effect.Effect<UniquenessViolation[], WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    // Query to find duplicate values using a CTE to assign row numbers first
    const query = `
      WITH numbered_rows AS (
        SELECT
          "${fieldName}",
          row_number() OVER() as row_num
        FROM ${tableName}
        WHERE "${fieldName}" IS NOT NULL
      )
      SELECT
        "${fieldName}" as duplicate_value,
        COUNT(*) as occurrence_count,
        array_agg(row_num) as affected_rows
      FROM numbered_rows
      GROUP BY "${fieldName}"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 100
    `;

    // SQL query execution should work - query failure is a defect
    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(Effect.orDie),
    );

    const rows = result.getRowObjects();
    const violations: UniquenessViolation[] = [];

    // Explode each duplicate value into individual violations (one per row)
    for (const row of rows) {
      const value = String(row.duplicate_value);

      // Handle DuckDB LIST type for affected_rows
      let affectedRows: number[] = [];
      const raw = row.affected_rows;
      if (Array.isArray(raw)) {
        affectedRows = raw.map((n) => Number(n));
      } else if (raw && typeof raw === "object" && "items" in raw) {
        affectedRows = raw.items.map((n) => Number(n));
      }

      // Create one violation per affected row
      for (const rowNum of affectedRows) {
        violations.push(
          new UniquenessViolation({
            enforcement,
            severity: enforcementToSeverity(enforcement),
            fieldName,
            targetName: specField.name,
            rowNumber: Number(rowNum),
            value,
            errorMessage: `Duplicate value: "${value}"`,
            validatorType: "unique",
          }),
        );
      }
    }

    return violations;
  });
}

/**
 * Validate uniqueness for a field
 *
 * Returns ValidationViolation[] for new enforcement-aware infrastructure.
 * Also returns old format for backward compatibility.
 */
function validateUniqueness(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): Effect.Effect<
  {
    enriched: ValidationViolation[];
    legacy: Array<{
      duplicateValue: string;
      occurrenceCount: number;
      affectedRows: number[];
    }>;
  },
  WorkspaceValidationError
> {
  return Effect.gen(function* (_) {
    // Check if field has explicit uniqueness validator (already normalized)
    const uniqueValidator = specField.validators?.find((v) => v.type === "unique");
    const enforcement = uniqueValidator?.enforcement ?? "required";

    // Get fully-formed violations
    const enriched = yield* _(
      findUniquenessViolations(connection, tableName, fieldName, specField, enforcement),
    );

    // Also return legacy format for backward compatibility
    // Group violations by duplicate value for old structure
    const duplicateGroups = new Map<
      string,
      { count: number; rows: number[] }
    >();

    for (const violation of enriched) {
      const value = violation.value;
      if (!duplicateGroups.has(value)) {
        duplicateGroups.set(value, { count: 0, rows: [] });
      }
      const group = duplicateGroups.get(value)!;
      group.count++;
      group.rows.push(violation.rowNumber);
    }

    const legacy = Array.from(duplicateGroups.entries()).map(([value, group]) => ({
      duplicateValue: value,
      occurrenceCount: group.count,
      affectedRows: group.rows.sort((a, b) => a - b),
    }));

    return { enriched, legacy };
  });
}

/**
 * Sanitize dataset name for use as SQL table name
 */
function sanitizeTableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

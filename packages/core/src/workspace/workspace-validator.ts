/**
 * Workspace Validator - Config-based multi-dataset validation
 *
 * Validates multiple datasets within a workspace according to their specifications.
 * Uses field mappings to validate CSV columns against spec field definitions.
 */

import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import { dirname, resolve } from "@std/path";
import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBConnection as DuckDB } from "@duckdb/node-api";

import type {
  CrossDatasetValidationResult,
  DatasetConfig,
  DatasetValidationResult,
  FieldDefinition,
  RawViolation,
  ValidationProfile,
  ValidationViolation,
  ValidatorConfig,
  WorkspaceConfig,
  WorkspaceValidationResult,
} from "@dwkt/domain";
import {
  enforcementToSeverity,
  enrichCrossDatasetViolation,
  enrichViolation,
  ErrorCode,
  FieldRequirementLevel,
  getDWCField,
  getValidationProfile,
  getVocabularyValues,
  hasControlledVocabulary,
  isIdentifierField,
  isValidVocabularyValue,
  parseSpecIdentifier,
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
export class WorkspaceValidationError extends WorkspaceValidationErrorBase {}

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

      // Discover and load configuration
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

      // Override validation settings with CLI options
      const config: WorkspaceConfig = options?.failFast !== undefined
        ? {
          ...loadedConfig,
          validation: {
            ...loadedConfig.validation,
            failFast: options.failFast,
          },
        }
        : loadedConfig;

      // Load validation profile if specified
      const validationProfile = config.validation.profile
        ? getValidationProfile(config.validation.profile)
        : undefined;

      // Create workspace and load all datasets
      const { workspaceId, connection } = yield* _(
        createWorkspaceFromConfig(config, dirname(resolvedConfigPath)),
      );

      // Perform validation with guaranteed connection cleanup
      return yield* _(
        Effect.gen(function* (_) {
          // Validate each dataset
          const datasetResults: DatasetValidationResult[] = [];

          for (const dataset of config.datasets) {
            const result = yield* _(
              validateDataset(connection, dataset, validationProfile),
            );

            datasetResults.push(result);

            // Fail-fast if enabled and we have critical errors
            if (config.validation.failFast && result.status === "fail") {
              break;
            }
          }

          // Validate cross-dataset rules if provided
          const crossDatasetResults: CrossDatasetValidationResult[] = [];
          if (config.crossDatasetRules && !config.validation.failFast) {
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
  config: WorkspaceConfig,
  basePath: string,
): Effect.Effect<
  { workspaceId: string; connection: DuckDBConnection },
  WorkspaceValidationError
> {
  return Effect.gen(function* (_) {
    const workspaceId = config.id;

    // Create DuckDB connection - failure is a system defect
    const connection = yield* _(
      Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
    );

    // Load each dataset into DuckDB
    for (const dataset of config.datasets) {
      const filePath = resolve(basePath, dataset.path);
      const tableName = sanitizeTableName(dataset.name);

      // Build null values string for DuckDB
      const nullStr = config.validation.nullValues.map((v) => `'${v}'`).join(", ");

      // Drop table if it exists, then create from CSV
      const dropTableQuery = `DROP TABLE IF EXISTS ${tableName}`;
      const createTableQuery = `
        CREATE TABLE ${tableName} AS
        SELECT * FROM read_csv_auto('${filePath}', nullstr=[${nullStr}])
      `;

      // Drop existing table first - DDL operations should always work (defect if they fail)
      yield* _(
        Effect.tryPromise(() => connection.runAndReadAll(dropTableQuery)).pipe(
          Effect.orDie,
        ),
      );

      // Create table from CSV - this can fail with invalid user data (expected error)
      yield* _(
        Effect.tryPromise({
          try: () => connection.runAndReadAll(createTableQuery),
          catch: (error) =>
            new WorkspaceValidationError({
              message: `Failed to load dataset '${dataset.name}' from ${filePath}: ${error}`,
              code: ErrorCode.VALIDATION_FAILED,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );
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
  fieldMapping: import("@dwkt/domain").WorkspaceFieldMapping,
): FieldDefinition | undefined {
  if (!baseField) {
    return undefined;
  }

  // Start with base field
  let merged = { ...baseField };

  // Apply profile overrides if profile exists and has overrides for this field
  if (profile && profile.fieldOverrides[fieldMapping.targetName]) {
    const profileOverride = profile.fieldOverrides[fieldMapping.targetName];

    // Merge validators (append profile validators to base validators)
    if (profileOverride.validators) {
      merged = {
        ...merged,
        validators: [
          ...merged.validators,
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
        ...merged.validators,
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
    const vocabularyErrors: Array<DatasetValidationResult["vocabularyErrors"][number]> = [];
    const uniquenessViolations: Array<DatasetValidationResult["uniquenessViolations"][number]> = [];
    const constraintViolations: Array<DatasetValidationResult["constraintViolations"][number]> = [];
    const warnings: Array<DatasetValidationResult["warnings"][number]> = [];
    const recommendations: Array<DatasetValidationResult["recommendations"][number]> = [];

    // Check profile field requirements based on requirement levels
    if (profile) {
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
                `Profile '${profile.id}' requires field '${fieldName}' but it is not mapped in the dataset`,
            });
          } else if (fieldOverride.requirement === FieldRequirementLevel.StronglyRecommended) {
            warnings.push({
              fieldName,
              targetName: fieldName,
              requirementLevel: "strongly-recommended",
              message:
                `Profile '${profile.id}' strongly recommends field '${fieldName}' but it is not mapped`,
            });
          } else if (fieldOverride.requirement === FieldRequirementLevel.Recommended) {
            recommendations.push({
              fieldName,
              targetName: fieldName,
              requirementLevel: "recommended",
              message:
                `Profile '${profile.id}' recommends field '${fieldName}' for better data quality`,
            });
          }
          // RequiredIfExists and Optional don't generate messages when missing
        }
      }
    }

    // Validate each field mapping
    for (const mapping of dataset.fieldMappings) {
      // Get base spec field definition
      const baseField = getDWCField(mapping.targetName);

      if (!baseField && specInfo.spec === "dwc") {
        // Unknown Darwin Core field
        requiredFieldErrors.push({
          fieldName: mapping.originName,
          targetName: mapping.targetName,
          message: `Unknown Darwin Core field: ${mapping.targetName}`,
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

          // OLD: Convert to old format for backward compatibility (deprecated)
          constraintViolations.push({
            fieldName: mapping.originName,
            targetName: mapping.targetName,
            constraintType: "range",
            violations: rangeViolations.map((v) => ({
              rowNumber: v.rowNumber,
              value: v.value,
              csvValue: v.csvValue,
              transformedValue: v.transformedValue,
              transformationChain: v.transformationChain,
              errorMessage: v.errorMessage,
            })),
          });
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

          // OLD: Also populate legacy format for backward compatibility
          if (vocabResult.legacy.length > 0) {
            vocabularyErrors.push({
              fieldName: mapping.originName,
              targetName: mapping.targetName,
              violations: vocabResult.legacy,
            });
          }
        }

        // Uniqueness validation for identifier fields
        if (isIdentifierField(specField)) {
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

          // OLD: Also populate legacy format for backward compatibility
          if (uniqueResult.legacy.length > 0) {
            uniquenessViolations.push(...uniqueResult.legacy.map((v) => ({
              fieldName: mapping.originName,
              targetName: mapping.targetName,
              duplicateValue: v.duplicateValue,
              occurrenceCount: v.occurrenceCount,
              affectedRows: v.affectedRows,
            })));
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
      spec: dataset.spec,
      filePath: dataset.path,
      rowsProcessed,
      processingTimeMs,
      status,

      // NEW: Partitioned violations by enforcement level
      violations: partitioned,

      // OLD: Deprecated fields for backward compatibility
      typeErrors,
      requiredFieldErrors,
      vocabularyErrors,
      uniquenessViolations,
      constraintViolations,
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
 * Helper function that returns minimal violation data (RawViolation).
 * Infrastructure enriches this with metadata to create ValidationViolation.
 */
function findCrossDatasetViolations(
  connection: DuckDBConnection,
  rule: {
    sourceDataset: string;
    sourceField: string;
    targetDataset: string;
    targetField: string;
  },
): Effect.Effect<RawViolation[], never> {
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

    // Return minimal violations (just rowNumber and value)
    return rows.map((row) => ({
      rowNumber: Number(row.row_num),
      value: row.source_value,
    }));
  });
}

/**
 * Validate cross-dataset rule using enrichment pattern
 *
 * Calls findCrossDatasetViolations() and enriches the minimal data
 * with full metadata including enforcement level.
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
    // Get minimal violations
    const rawViolations = yield* _(
      findCrossDatasetViolations(connection, rule),
    );

    // For now, convert to old format for compatibility
    // TODO: Update CrossDatasetValidationResult to use ValidationViolation[]
    const violations = rawViolations.map((raw) => ({
      rowNumber: raw.rowNumber,
      sourceValue: String(raw.value),
      errorMessage:
        `Value '${raw.value}' in ${rule.sourceDataset}.${rule.sourceField} does not exist in ${rule.targetDataset}.${rule.targetField}`,
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
 * Helper function that returns minimal violation data (RawViolation).
 * Infrastructure enriches this with metadata to create ValidationViolation.
 */
function findRangeViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  validator: import("@dwkt/domain").ValidatorConfig,
): Effect.Effect<RawViolation[], never> {
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

    // Return minimal violations (just rowNumber and value)
    return rows.map((row) => ({
      rowNumber: Number(row.row_num),
      value: row.value,
    }));
  });
}

/**
 * Validate range constraints using enrichment pattern
 *
 * Calls findRangeViolations() for each validator and enriches
 * the minimal data with full metadata.
 */
function validateRangeConstraints(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): Effect.Effect<ValidationViolation[], WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    const violations: ValidationViolation[] = [];

    // Get range validators from field definition
    const rangeValidators = specField.validators.filter((v) => v.type === "range");

    for (const validator of rangeValidators) {
      // Get minimal violations
      const rawViolations = yield* _(
        findRangeViolations(connection, tableName, fieldName, validator),
      );

      // Enrich with metadata
      const enriched = rawViolations.map((raw) =>
        enrichViolation(raw, validator, specField, fieldName)
      );

      violations.push(...enriched);
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
 * - loose → optional (INFO)
 */
function vocabularyEnforcementToStandard(
  vocabEnforcement: import("@dwkt/domain").VocabularyEnforcement,
): import("@dwkt/domain").EnforcementLevel {
  switch (vocabEnforcement) {
    case "strict":
      return "required";
    case "recommended":
      return "recommended";
    case "loose":
      return "optional";
  }
}

/**
 * Find vocabulary violations
 *
 * Returns minimal violation data (RawViolation).
 * Infrastructure enriches with metadata.
 */
function findVocabularyViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  vocabularyKey: import("@dwkt/domain").VocabularyKey,
  caseSensitive = false,
): Effect.Effect<RawViolation[], WorkspaceValidationError> {
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
    const violations: RawViolation[] = [];

    for (const row of rows) {
      const value = String(row.value);
      const rawRowNumbers = row.row_numbers;

      // DuckDB LIST types are returned as { items: [...] } objects
      let rowNumbers: number[] = [];
      if (Array.isArray(rawRowNumbers)) {
        rowNumbers = (rawRowNumbers as Array<unknown>).map((n) => Number(n));
      } else if (rawRowNumbers && typeof rawRowNumbers === "object" && "items" in rawRowNumbers) {
        const items = (rawRowNumbers as { items: unknown[] }).items;
        rowNumbers = items.map((n) => Number(n));
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
          violations.push({
            rowNumber: Number(rowNum),
            value,
            // TODO: Add fuzzy matching for suggestions
          });
        }
      }
    }

    return violations;
  });
}

/**
 * Validate controlled vocabulary using enrichment pattern
 *
 * Calls findVocabularyViolations() and enriches the minimal data
 * with full metadata including enforcement level from vocabulary config.
 *
 * Returns ValidationViolation[] for new enforcement-aware infrastructure.
 * Also returns old format for backward compatibility.
 */
function validateVocabulary(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: import("@dwkt/domain").FieldDefinition,
): Effect.Effect<
  {
    enriched: ValidationViolation[];
    legacy: Array<{ rowNumber: number; value: string; suggestedValues?: string[] }>;
  },
  WorkspaceValidationError
> {
  return Effect.gen(function* (_) {
    if (!specField.vocabulary) {
      return { enriched: [], legacy: [] };
    }

    const { vocabularyKey, caseSensitive = false, enforcement = "strict" } = specField.vocabulary;

    // Get minimal violations using helper
    const rawViolations = yield* _(
      findVocabularyViolations(connection, tableName, fieldName, vocabularyKey, caseSensitive),
    );

    // Map vocabulary enforcement to standard enforcement level
    const standardEnforcement = vocabularyEnforcementToStandard(enforcement);

    // Enrich violations with metadata
    const enriched: ValidationViolation[] = rawViolations.map((raw) => ({
      // Enforcement (from vocabulary config)
      enforcement: standardEnforcement,
      severity: enforcementToSeverity(standardEnforcement),

      // Location
      fieldName,
      targetName: specField.name,
      rowNumber: raw.rowNumber,

      // Violation details
      violationType: "vocabulary" as const,
      value: String(raw.value),
      csvValue: raw.csvValue,
      transformedValue: raw.transformedValue,
      transformationChain: raw.transformationChain,
      errorMessage: `Value '${raw.value}' is not in controlled vocabulary '${vocabularyKey}'`,
      suggestedValues: raw.suggestedValues,

      // Validator metadata
      validatorType: "vocabulary",
      params: {
        vocabularyKey,
        enforcement,
        caseSensitive,
      },
    }));

    // Also return legacy format for backward compatibility
    const legacy = rawViolations.map((raw) => ({
      rowNumber: raw.rowNumber,
      value: String(raw.value),
      suggestedValues: raw.suggestedValues ? [...raw.suggestedValues] : undefined,
    }));

    return { enriched, legacy };
  });
}

/**
 * Find uniqueness violations
 *
 * Returns minimal violation data (RawViolation), one per affected row.
 * Infrastructure enriches with metadata.
 *
 * Note: This "explodes" duplicate values into individual violations,
 * so a value duplicated 3 times creates 3 RawViolations.
 */
function findUniquenessViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
): Effect.Effect<RawViolation[], WorkspaceValidationError> {
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
    const violations: RawViolation[] = [];

    // Explode each duplicate value into individual violations (one per row)
    for (const row of rows) {
      const value = String(row.duplicate_value);

      // Handle DuckDB LIST type for affected_rows
      let affectedRows: number[] = [];
      const raw = row.affected_rows;
      if (Array.isArray(raw)) {
        affectedRows = (raw as Array<unknown>).map((n) => Number(n));
      } else if (raw && typeof raw === "object" && "items" in raw) {
        const items = (raw as { items: unknown[] }).items;
        affectedRows = items.map((n) => Number(n));
      }

      // Create one violation per affected row
      for (const rowNum of affectedRows) {
        violations.push({
          rowNumber: Number(rowNum),
          value,
        });
      }
    }

    return violations;
  });
}

/**
 * Validate uniqueness using enrichment pattern
 *
 * Calls findUniquenessViolations() and enriches the minimal data
 * with full metadata including enforcement level.
 *
 * Returns ValidationViolation[] for new enforcement-aware infrastructure.
 * Also returns old format for backward compatibility.
 */
function validateUniqueness(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: import("@dwkt/domain").FieldDefinition,
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
    // Get minimal violations using helper
    const rawViolations = yield* _(
      findUniquenessViolations(connection, tableName, fieldName),
    );

    // Check if field has explicit uniqueness validator with enforcement
    const uniqueValidator = specField.validators.find((v) => v.type === "unique");
    const enforcement = uniqueValidator?.enforcement ?? "required";

    // Enrich violations with metadata
    const enriched: ValidationViolation[] = rawViolations.map((raw) => ({
      // Enforcement (from unique validator or default to required)
      enforcement,
      severity: enforcementToSeverity(enforcement),

      // Location
      fieldName,
      targetName: specField.name,
      rowNumber: raw.rowNumber,

      // Violation details
      violationType: "uniqueness" as const,
      value: String(raw.value),
      csvValue: raw.csvValue,
      transformedValue: raw.transformedValue,
      transformationChain: raw.transformationChain,
      errorMessage: `Duplicate value '${raw.value}' in identifier field`,
      suggestedValues: raw.suggestedValues,

      // Validator metadata
      validatorType: "unique",
      params: uniqueValidator?.params as Record<string, unknown> | undefined,
    }));

    // Also return legacy format for backward compatibility
    // Group violations by duplicate value for old structure
    const duplicateGroups = new Map<
      string,
      { count: number; rows: number[] }
    >();

    for (const raw of rawViolations) {
      const value = String(raw.value);
      if (!duplicateGroups.has(value)) {
        duplicateGroups.set(value, { count: 0, rows: [] });
      }
      const group = duplicateGroups.get(value)!;
      group.count++;
      group.rows.push(raw.rowNumber);
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

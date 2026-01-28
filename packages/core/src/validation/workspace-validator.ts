/**
 * Workspace Validator - Config-based multi-dataset validation
 *
 * Validates multiple datasets within a workspace according to their specifications.
 * Uses field mappings to validate CSV columns against spec field definitions.
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBInstance } from "@duckdb/node-api";
import { resolve } from "@std/path";
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
  WorkspaceFieldMapping,
  WorkspaceValidationResult,
} from "@dwkt/domain";
import {
  CrossDatasetViolation,
  enforcementToSeverity,
  FieldRequirementLevel,
  getValidationProfile,
  parseSpecIdentifier,
} from "@dwkt/domain";
import { importCsv } from "../loading/csv-import.ts";
import { sanitizeTableName } from "../loading/sql.ts";
import { Workspace } from "../workspace/workspace.ts";

// Import from modular validation files
import { insertRowByRow } from "./data-loader.ts";
import {
  validateRangeConstraints,
  validateUniqueness,
  validateVocabulary,
} from "./field-validators.ts";
import {
  calculateSummary,
  hasControlledVocabulary,
  partitionViolations,
  resolveSchemaTableName,
} from "./summary.ts";

// Re-export error classes from errors.ts
export { WorkspaceImportError, WorkspaceValidationError } from "./errors.ts";

// Import error classes for internal use
import { importSchema } from "../loading/schema.ts";
import { WorkspaceImportError, WorkspaceValidationError } from "./errors.ts";

/**
 * Workspace validator for config-based validation
 */
export class WorkspaceValidator {
  /**
   * Validate datasets directly from in-memory configuration
   *
   * This is the preferred method for programmatic validation as it
   * operates on already-loaded configuration without file I/O.
   *
   * @param datasets - Dataset configurations to validate
   * @param settings - Validation settings (null values, fail-fast, etc.)
   * @param basePath - Base directory for resolving relative dataset paths
   * @param workspaceId - Optional workspace ID for result tracking
   * @param crossDatasetRules - Optional cross-dataset validation rules
   */
  validateDatasets(
    datasets: readonly DatasetConfig[],
    settings: ValidationSettings,
    basePath: string,
    workspaceId?: string,
    crossDatasetRules?: readonly {
      ruleType: string;
      sourceDataset: string;
      sourceField: string;
      targetDataset: string;
      targetField: string;
      enforcement?: string;
      description?: string;
    }[],
  ): Effect.Effect<WorkspaceValidationResult, WorkspaceValidationError> {
    return Effect.gen(function* (_) {
      const startTime = Date.now();
      const resolvedWorkspaceId = workspaceId ?? `validation-${Date.now()}`;

      // Create workspace and load all datasets
      const { workspaceId: wsId, connection, instance } = yield* _(
        createWorkspaceFromConfig(
          resolvedWorkspaceId,
          datasets,
          settings,
          basePath,
        ),
      );

      // Perform validation with guaranteed connection cleanup
      return yield* _(
        Effect.gen(function* (_) {
          // Validate each dataset
          const datasetResults: DatasetValidationResult[] = [];

          for (const dataset of datasets) {
            // Use dataset-level profile if specified, otherwise derive from spec field
            let datasetProfile = dataset.profile
              ? getValidationProfile(dataset.profile)
              : undefined;

            // If still no profile, try to derive from spec field
            if (!datasetProfile && dataset.spec) {
              const parsed = parseSpecIdentifier(dataset.spec);
              if (parsed) {
                const derivedProfileId = parsed.type.charAt(0).toUpperCase() +
                  parsed.type.slice(1);
                datasetProfile = getValidationProfile(derivedProfileId);
              }
            }

            const result = yield* _(
              validateDataset(connection, dataset, datasetProfile, settings),
            );

            datasetResults.push(result);

            // Fail-fast if enabled and we have critical errors
            if (settings.failFast && result.status === "fail") {
              break;
            }
          }

          // Validate cross-dataset rules if provided
          const crossDatasetResults: CrossDatasetValidationResult[] = [];
          if (crossDatasetRules && !settings.failFast) {
            for (const rule of crossDatasetRules) {
              const result = yield* _(
                validateCrossDatasetRule(connection, rule, datasets),
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
            workspaceId: wsId,
            configPath: basePath,
            validatedAt: new Date(),
            totalProcessingTimeMs,
            overallStatus,
            datasetResults,
            crossDatasetResults,
            summary,
          };
        }).pipe(
          // Ensure connection and instance are closed even if validation fails
          Effect.ensuring(
            Effect.all([
              Effect.try(() => connection.closeSync()).pipe(Effect.ignore),
              Effect.try(() => instance.closeSync()).pipe(Effect.ignore),
            ]),
          ),
        ),
      );
    });
  }

  /**
   * Validate datasets using a provided DuckDB connection
   *
   * Unlike validateDatasets(), this method does NOT create or close
   * the connection. It's designed for use with an Effect-managed
   * Workspace that owns the connection lifecycle.
   *
   * @param connection - An existing DuckDB connection to use
   * @param datasets - Dataset configurations to validate
   * @param settings - Validation settings (null values, fail-fast, etc.)
   * @param basePath - Base directory for resolving relative dataset paths
   * @param workspaceId - Optional workspace ID for result tracking
   * @param crossDatasetRules - Optional cross-dataset validation rules
   */
  validateDatasetsWithConnection(
    connection: DuckDBConnection,
    datasets: readonly DatasetConfig[],
    settings: ValidationSettings,
    basePath: string,
    workspaceId?: string,
    crossDatasetRules?: readonly {
      ruleType: string;
      sourceDataset: string;
      sourceField: string;
      targetDataset: string;
      targetField: string;
      enforcement?: string;
      description?: string;
    }[],
  ): Effect.Effect<WorkspaceValidationResult, WorkspaceValidationError> {
    return Effect.gen(function* (_) {
      const startTime = Date.now();
      const resolvedWorkspaceId = workspaceId ?? `validation-${Date.now()}`;

      // Load each dataset into DuckDB (using the provided connection)
      for (const dataset of datasets) {
        const filePath = resolve(basePath, dataset.path);
        const tableName = `raw_${sanitizeTableName(dataset.name)}`;

        // Import CSV with row numbers
        yield* _(
          importCsv(connection, tableName, filePath, settings.nullValues).pipe(
            Effect.mapError((e) =>
              new WorkspaceImportError({ message: e.message, cause: e.cause })
            ),
          ),
        );
        yield* _(importSchema(connection, dataset, datasets));
      }

      // Validate each dataset
      const datasetResults: DatasetValidationResult[] = [];

      for (const dataset of datasets) {
        // Use dataset-level profile if specified, otherwise derive from spec field
        let datasetProfile = dataset.profile ? getValidationProfile(dataset.profile) : undefined;

        // If still no profile, try to derive from spec field
        if (!datasetProfile && dataset.spec) {
          const parsed = parseSpecIdentifier(dataset.spec);
          if (parsed) {
            const derivedProfileId = parsed.type.charAt(0).toUpperCase() +
              parsed.type.slice(1);
            datasetProfile = getValidationProfile(derivedProfileId);
          }
        }

        const result = yield* _(
          validateDataset(connection, dataset, datasetProfile, settings),
        );

        datasetResults.push(result);

        // Fail-fast if enabled and we have critical errors
        if (settings.failFast && result.status === "fail") {
          break;
        }
      }

      // Validate cross-dataset rules if provided
      const crossDatasetResults: CrossDatasetValidationResult[] = [];
      if (crossDatasetRules && !settings.failFast) {
        for (const rule of crossDatasetRules) {
          const result = yield* _(
            validateCrossDatasetRule(connection, rule, datasets),
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
        workspaceId: resolvedWorkspaceId,
        configPath: basePath,
        validatedAt: new Date(),
        totalProcessingTimeMs,
        overallStatus,
        datasetResults,
        crossDatasetResults,
        summary,
      };
    });
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
    return Effect.scoped(
      Effect.gen(function* (_) {
        // Open workspace (handles config loading, validation, and cleanup)
        const workspace = yield* _(
          Workspace.open(configPath).pipe(
            Effect.mapError((error) =>
              new WorkspaceValidationError({
                message: `Failed to load workspace config: ${error.message}`,
                cause: error instanceof Error ? error : new Error(String(error)),
              })
            ),
          ),
        );

        // Run validation using the workspace's managed connection
        // Workspace.validate() handles failFast option merging
        return yield* _(
          workspace.validate(options).pipe(
            Effect.mapError((error) =>
              new WorkspaceValidationError({
                message: error.message,
                cause: error instanceof Error ? error : new Error(String(error)),
              })
            ),
          ),
        );
      }),
    );
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
  {
    workspaceId: string;
    connection: DuckDBConnection;
    instance: DuckDBInstance;
  },
  WorkspaceValidationError
> {
  return Effect.gen(function* (_) {
    // Create isolated DuckDB instance - each workspace gets its own in-memory database
    // This prevents test contamination where tables from one test persist into another
    const instance = yield* _(
      Effect.tryPromise(() => DuckDBInstance.create(":memory:")).pipe(
        Effect.orDie,
      ),
    );

    // Create connection from isolated instance - failure is a system defect
    const connection = yield* _(
      Effect.tryPromise(() => instance.connect()).pipe(Effect.orDie),
    );

    // Load each dataset into DuckDB
    for (const dataset of datasets) {
      const filePath = resolve(basePath, dataset.path);
      // prepend'raw_' to table name because dataset.name and spec/profile can not be the same name otherwise the tables conflict
      const tableName = `raw_${sanitizeTableName(dataset.name)}`;

      // Import CSV with row numbers
      yield* _(
        importCsv(connection, tableName, filePath, validationSettings.nullValues).pipe(
          Effect.mapError((e) => new WorkspaceImportError({ message: e.message, cause: e.cause })),
        ),
      );
      yield* _(importSchema(connection, dataset, datasets));
    }

    return { workspaceId, connection, instance };
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
  validationSettings?: ValidationSettings,
): Effect.Effect<DatasetValidationResult, WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    const startTime = Date.now();
    const tableName = `raw_${sanitizeTableName(dataset.name)}`;

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
          }),
        ),
      );
    }

    const originTableColumnsResult = yield* _(
      Effect.tryPromise({
        try: () =>
          connection.runAndReadAll(
            `SELECT column_name FROM (DESCRIBE '${tableName}')`,
          ),
        catch: (error) =>
          new WorkspaceValidationError({
            message: `Failed to describe table '${tableName}'`,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }),
    );

    // Exclude _row_number; it's only used internally
    const originTableColumns = originTableColumnsResult.getRowObjects()
      .map((row) => String(row.column_name))
      .filter((col) => col !== "_row_number");

    // Derive profile name - use profile.name if available (this is the actual table name),
    // otherwise use dataset.profile, or derive from spec
    let profileName: string | undefined;
    if (profile) {
      // Use the profile's name property (e.g., "OBIS Event Core")
      // This must match what importSchema uses to create the table
      profileName = profile.name;
    } else if (dataset.profile) {
      // Fallback to profile ID from config (may not match actual profile name)
      profileName = dataset.profile;
    } else if (dataset.spec) {
      // Derive from spec if neither profile nor profile ID available
      const parsed = parseSpecIdentifier(dataset.spec);
      if (parsed) {
        profileName = parsed.type.charAt(0).toUpperCase() +
          parsed.type.slice(1);
      }
    }

    const schemaTableName = profileName
      ? sanitizeTableName(profileName).toLowerCase()
      : dataset.name.toLowerCase();

    // Detect field mapping issues
    const mappedOriginFields = dataset.fieldMappings.map((m) => m.originName);
    const missingSourceFields = mappedOriginFields.filter(
      (f) => !originTableColumns.includes(f),
    );
    const unmappedSourceColumns = originTableColumns.filter(
      (f) => !mappedOriginFields.includes(f),
    );

    // Filter out mappings that reference missing source fields
    const validMappings = dataset.fieldMappings.filter(
      (mapping) => originTableColumns.includes(mapping.originName),
    );

    // Build column lists from valid mappings only
    const targetColumnNames = validMappings.map((field) => `"${field.targetName}"`);
    const originColumnNames = validMappings.map((field) => `"${field.originName}"`);

    // Collect all violations as ValidationViolation[] for partitioning
    const allViolations: ValidationViolation[] = [];

    // Build column mappings for INSERT (using valid mappings only)
    const columnMappings = validMappings.map((m) => ({
      origin: m.originName,
      target: m.targetName,
    }));

    // Prepare bulk INSERT SQL
    const insertSQL = `INSERT INTO ${schemaTableName} (${targetColumnNames.join(", ")}) SELECT ${
      originColumnNames.join(", ")
    } FROM ${tableName};`;

    // STRATEGY: Try bulk INSERT first (fast path)
    // If it fails, fall back to row-by-row INSERT (correctness path)
    const bulkInsertResult = yield* _(
      Effect.tryPromise({
        try: () => connection.run(insertSQL),
        catch: (error) => error,
      }).pipe(Effect.either),
    );

    if (bulkInsertResult._tag === "Left") {
      // Bulk INSERT failed - fall back to row-by-row insertion to collect detailed violations
      // TODO: When implementing issue #64 (https://github.com/HakaiInstitute/DarwinKit/issues/64):
      // Use Effect.log to allow surfacing warnings in cases like this if developers choose
      if (profile) {
        const constraintViolations = yield* _(
          insertRowByRow(
            connection,
            tableName,
            schemaTableName,
            columnMappings,
            profile,
            validationSettings,
          ),
        );
        allViolations.push(...constraintViolations);
      }
    }

    // Validate field mappings based on spec

    // OLD: Keep old structure for backward compatibility (will be deprecated)
    const typeErrors: Array<DatasetValidationResult["typeErrors"][number]> = [];
    const requiredFieldErrors: Array<
      DatasetValidationResult["requiredFieldErrors"][number]
    > = [];
    const warnings: Array<DatasetValidationResult["warnings"][number]> = [];
    const recommendations: Array<
      DatasetValidationResult["recommendations"][number]
    > = [];

    // Add warnings for field mapping issues
    for (const fieldName of missingSourceFields) {
      warnings.push({
        fieldName,
        targetName: fieldName,
        requirementLevel: "configuration",
        message:
          `Field '${fieldName}' is mapped in configuration but not found in source CSV. This mapping will be skipped.`,
      });
    }

    // Add recommendations for unmapped source columns (informational)
    for (const columnName of unmappedSourceColumns) {
      recommendations.push({
        fieldName: columnName,
        targetName: columnName,
        requirementLevel: "optional",
        message:
          `Source column '${columnName}' is not mapped to any Darwin Core field and will be ignored.`,
      });
    }

    // Check profile field requirements based on requirement levels
    if (profile && profile.fieldOverrides && dataset.fieldMappings) {
      const mappedSpecFields = new Set(
        dataset.fieldMappings.map((m) => m.targetName),
      );

      for (
        const [fieldName, fieldOverride] of Object.entries(
          profile.fieldOverrides,
        )
      ) {
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
          } else if (
            fieldOverride.requirement ===
              FieldRequirementLevel.StronglyRecommended
          ) {
            warnings.push({
              fieldName,
              targetName: fieldName,
              requirementLevel: "strongly-recommended",
              message:
                `Profile '${profile.name}' strongly recommends field '${fieldName}' but it is not mapped`,
            });
          } else if (
            fieldOverride.requirement === FieldRequirementLevel.Recommended
          ) {
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

    // Validate each field mapping (only valid mappings with source fields that exist)
    for (const mapping of validMappings) {
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
        Effect.tryPromise(() => connection.runAndReadAll(fieldExistsQuery))
          .pipe(
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
        // Skip if this field was already validated as an ENUM constraint
        const hasVocab = hasControlledVocabulary(specField);
        // Check raw field for values property
        const rawFieldForVocab = profile.fields?.[mapping.targetName];
        const hasEnumConstraint = rawFieldForVocab?.type === "controlled-vocabulary" &&
          rawFieldForVocab?.values;

        if (hasVocab && !hasEnumConstraint) {
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
        // Skip PKs because row-by-row INSERT queries for ALL duplicate rows
        const rawFieldForUnique = profile.fields?.[mapping.targetName];
        const isPrimaryKeyField = mapping.targetName === schemaTableName + "ID" ||
          (mapping.targetName.endsWith("ID") &&
            rawFieldForUnique?.unique === "true");

        const hasUniqueValidator = specField.validators
          ? (specField.validators.some((v) =>
            typeof v === "string" ? v === "uniqueIdentifier" : v.type === "unique"
          ))
          : false;

        if (hasUniqueValidator && !isPrimaryKeyField) {
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
  datasets: readonly DatasetConfig[],
): Effect.Effect<CrossDatasetViolation[], never> {
  return Effect.gen(function* (_) {
    // Resolve dataset names to schema table names
    const sourceTable = resolveSchemaTableName(rule.sourceDataset, datasets);
    const targetTable = resolveSchemaTableName(rule.targetDataset, datasets);

    // Find values in source that don't exist in target
    const violationsQuery = `
      SELECT
        s._row_number,
        s."${rule.sourceField}" as source_value
      FROM ${sourceTable} s
      LEFT JOIN ${targetTable} t ON s."${rule.sourceField}" = t."${rule.targetField}"
      WHERE s."${rule.sourceField}" IS NOT NULL
        AND t."${rule.targetField}" IS NULL
    `;

    // SQL query execution should work - query failure is a defect
    const violationsResult = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(violationsQuery)).pipe(
        Effect.orDie,
      ),
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
        rowNumber: Number(row._row_number),
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
  datasets: readonly DatasetConfig[],
): Effect.Effect<CrossDatasetValidationResult, WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    // Map string enforcement to EnforcementLevel
    const enforcement: EnforcementLevel = rule.enforcement === "recommended"
      ? "recommended"
      : rule.enforcement === "optional"
      ? "optional"
      : "required";

    // Get fully-formed CrossDatasetViolation objects
    const violations = yield* _(
      findCrossDatasetViolations(
        connection,
        { ...rule, enforcement },
        datasets,
      ),
    );

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

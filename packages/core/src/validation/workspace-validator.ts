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
  DatasetValidationResult,
  FieldViolation,
  SchemaViolation,
  WorkspaceValidationResult,
} from "@dwkt/domain/types";
import {
  calculateSummary,
  CrossDatasetViolation,
  enforcementToSeverity,
  MissingFieldViolation,
  MissingMappingViolation,
  partitionFieldViolations,
  partitionSchemaViolations,
  UnknownFieldViolation,
  UnknownProfileViolation,
  UnmappedColumnViolation,
} from "@dwkt/domain/types";
import type {
  DatasetConfig,
  ValidationProfile,
  ValidationSettings,
  WorkspaceCrossDatasetRule,
  WorkspaceFieldMapping,
} from "@dwkt/domain/schemas";
import { FieldRequirementLevel, parseSpecIdentifier } from "@dwkt/domain/schemas";
import type { EnforcementLevel, FieldDefinition, ValidatorConfig } from "@dwkt/domain/specs";
import { getValidationProfile, hasControlledVocabulary } from "@dwkt/domain/specs";
import type { WorkspaceOperationError } from "@dwkt/domain/errors";
import { WorkspaceImportError, WorkspaceValidationError } from "@dwkt/domain/errors";
import { importCsv } from "../loading/csv-import.ts";
import { sanitizeTableName } from "../loading/sql.ts";
import { Workspace } from "../workspace/workspace.ts";

// Import from modular validation files
import { insertRowByRow } from "./data-loader.ts";
import { validateField } from "./field-validators.ts";
import { resolveSchemaTableName } from "./summary.ts";
import { importSchema } from "../loading/schema.ts";

import { findSuggestedValue } from "../validation/string-matching.ts";

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
    crossDatasetRules?: readonly WorkspaceCrossDatasetRule[],
  ): Effect.Effect<WorkspaceValidationResult, WorkspaceOperationError> {
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
          crossDatasetRules,
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
              validateDataset(connection, dataset, datasetProfile, settings, crossDatasetRules),
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

          // Calculate summary (including cross-dataset violations)
          const summary = calculateSummary(datasetResults, crossDatasetResults);
          const totalProcessingTimeMs = Date.now() - startTime;

          const overallStatus: "fail" | "warn" | "pass" = summary.datasetsFailedCount > 0 ||
              summary.totalErrors > 0
            ? "fail"
            : summary.datasetsWithWarningsCount > 0 || summary.totalWarnings > 0
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
    crossDatasetRules?: readonly WorkspaceCrossDatasetRule[],
  ): Effect.Effect<WorkspaceValidationResult, WorkspaceOperationError> {
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
        yield* _(importSchema(connection, dataset, datasets, crossDatasetRules));
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
          validateDataset(connection, dataset, datasetProfile, settings, crossDatasetRules),
        );

        datasetResults.push(result);

        // Print result object as you go if in debug mode, report first occurrence of each error
        if (settings.debug) {
          const earlyResult = {
            ...result,
            schemaViolations: {
              errors: result.schemaViolations.errors.filter((obj1, i, arr) =>
                arr.findIndex((obj2) => (obj2.errorMessage === obj1.errorMessage)) === i
              ),
              warnings: result.schemaViolations.warnings.filter((obj1, i, arr) =>
                arr.findIndex((obj2) => (obj2.errorMessage === obj1.errorMessage)) === i
              ),
              info: result.schemaViolations.info.filter((obj1, i, arr) =>
                arr.findIndex((obj2) => (obj2.errorMessage === obj1.errorMessage)) === i
              ),
            },
            fieldViolations: {
              errors: result.fieldViolations.errors.filter((obj1, i, arr) =>
                arr.findIndex((obj2) => (obj2.errorMessage === obj1.errorMessage)) === i
              ),
              warnings: result.fieldViolations.warnings.filter((obj1, i, arr) =>
                arr.findIndex((obj2) => (obj2.errorMessage === obj1.errorMessage)) === i
              ),
              info: result.fieldViolations.info.filter((obj1, i, arr) =>
                arr.findIndex((obj2) => (obj2.errorMessage === obj1.errorMessage)) === i
              ),
            },
          };

          console.debug(JSON.stringify(earlyResult, null, 4));
        }

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

      // Calculate summary (including cross-dataset violations)
      const summary = calculateSummary(datasetResults, crossDatasetResults);
      const totalProcessingTimeMs = Date.now() - startTime;

      const overallStatus: "fail" | "warn" | "pass" = summary.datasetsFailedCount > 0 ||
          summary.totalErrors > 0
        ? "fail"
        : summary.datasetsWithWarningsCount > 0 || summary.totalWarnings > 0
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
  ): Effect.Effect<WorkspaceValidationResult, WorkspaceOperationError> {
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
  crossDatasetRules?: readonly WorkspaceCrossDatasetRule[],
): Effect.Effect<
  {
    workspaceId: string;
    connection: DuckDBConnection;
    instance: DuckDBInstance;
  },
  WorkspaceOperationError
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
      yield* _(importSchema(connection, dataset, datasets, crossDatasetRules));
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
  crossDatasetRules?: readonly WorkspaceCrossDatasetRule[],
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

    const schemaProfile = getValidationProfile(profileName || "");
    if (schemaProfile === undefined) {
      return yield* _(
        Effect.fail(
          new WorkspaceValidationError({
            message: `Invalid profile identifier: ${profileName}`,
          }),
        ),
      );
    }
    const schemaColumnsObj = Object.keys(schemaProfile?.fields || {}).map((fieldName: string) =>
      <WorkspaceFieldMapping> {
        originName: fieldName,
        targetName: fieldName,
      }
    ).reduce((obj, item) => {
      obj[item.targetName] = item;
      return obj;
    }, {} as Record<string, WorkspaceFieldMapping>) as Record<string, WorkspaceFieldMapping>;

    // Detect field mapping issues
    const configFieldMappings = dataset?.fieldMappings || [];
    const mappedOriginFields = configFieldMappings.map((m) => m.originName);

    const missingSourceFields = mappedOriginFields.filter(
      (f) => !originTableColumns.includes(f),
    ).map((f) => ({
      fieldName: f,
      alternatives: findSuggestedValue(f, originTableColumns) || "",
    }));

    // override with fieldMappings from config
    configFieldMappings.forEach((field) => {
      schemaColumnsObj[field.targetName] = <WorkspaceFieldMapping> {
        ...field,
      };
    });
    const allFieldMappings = Object.values(schemaColumnsObj).map((m: WorkspaceFieldMapping) =>
      m.originName
    );

    const unmappedSourceColumns = originTableColumns.filter(
      (f) => !allFieldMappings.includes(f),
    ).map((f) => ({
      fieldName: f,
      alternatives: findSuggestedValue(f, mappedOriginFields) || "",
    }));

    // Filter out mappings that reference missing source fields
    const validMappings = Object.values(schemaColumnsObj).filter(
      (mapping) => originTableColumns.includes(mapping.originName),
    );

    // Build column lists from valid mappings only
    const targetColumnNames = validMappings.map((field) => `"${field.targetName}"`);
    const originColumnNames = validMappings.map((field) => `"${field.originName}"`);

    // Collect all field violations as FieldViolation[]
    const allFieldViolations: FieldViolation[] = [];

    // Collect all schema violations as SchemaViolation[]
    const schemaViolations: SchemaViolation[] = [];

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
      if (profile) {
        // insertRowByRow uses error channel for violations - catch and collect them
        yield* _(
          insertRowByRow(
            connection,
            tableName,
            schemaTableName,
            columnMappings,
            profile,
            dataset.name,
            crossDatasetRules ?? [],
            validationSettings,
          ).pipe(
            Effect.catchAll((violations) => {
              allFieldViolations.push(...violations);
              return Effect.succeed(undefined);
            }),
          ),
        );
      }
    }

    // Generate schema violations for field mapping issues
    // When a mapped field is missing from CSV, it's always a warning (recommended enforcement)
    // because we can't validate data that doesn't exist - we just skip the mapping
    for (const missingSourceField of missingSourceFields) {
      const mapping = (dataset.fieldMappings || []).find((m) =>
        m.originName === missingSourceField.fieldName
      );
      const altMsg = missingSourceField.alternatives
        ? `Possible alternative fields: ${missingSourceField.alternatives}`
        : "";
      schemaViolations.push(
        new MissingMappingViolation({
          enforcement: "recommended",
          severity: enforcementToSeverity("recommended"),
          fieldName: missingSourceField.fieldName,
          targetName: mapping?.targetName ?? missingSourceField.fieldName,
          errorMessage:
            `Field '${missingSourceField.fieldName}' is mapped in configuration but not found in source CSV. This mapping will be skipped.` +
            (altMsg ? ` ${altMsg}` : ""),
          validatorType: "schema",
          datasetName: dataset.name,
        }),
      );
    }

    // Generate schema violations for unmapped source columns (informational)
    for (const unmappedSourceColumn of unmappedSourceColumns) {
      const altMsg = unmappedSourceColumn.alternatives
        ? `Possible alternative columns: ${unmappedSourceColumn.alternatives}`
        : "";
      schemaViolations.push(
        new UnmappedColumnViolation({
          enforcement: "optional",
          severity: enforcementToSeverity("optional"),
          fieldName: unmappedSourceColumn.fieldName,
          targetName: unmappedSourceColumn.fieldName,
          errorMessage:
            `Source column '${unmappedSourceColumn.fieldName}' is not mapped to any Darwin Core field and will be ignored.` +
            (altMsg ? ` ${altMsg}` : ""),
          validatorType: "schema",
          datasetName: dataset.name,
        }),
      );
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
            schemaViolations.push(
              new MissingFieldViolation({
                enforcement: "required",
                severity: enforcementToSeverity("required"),
                fieldName,
                targetName: fieldName,
                errorMessage:
                  `Profile '${profile.name}' requires field '${fieldName}' but it is not mapped in the dataset`,
                validatorType: "schema",
                reason: "not_mapped",
              }),
            );
          } else if (
            fieldOverride.requirement ===
              FieldRequirementLevel.StronglyRecommended
          ) {
            schemaViolations.push(
              new MissingFieldViolation({
                enforcement: "recommended",
                severity: enforcementToSeverity("recommended"),
                fieldName,
                targetName: fieldName,
                errorMessage:
                  `Profile '${profile.name}' strongly recommends field '${fieldName}' but it is not mapped`,
                validatorType: "schema",
                reason: "not_mapped",
              }),
            );
          } else if (
            fieldOverride.requirement === FieldRequirementLevel.Recommended
          ) {
            schemaViolations.push(
              new MissingFieldViolation({
                enforcement: "optional",
                severity: enforcementToSeverity("optional"),
                fieldName,
                targetName: fieldName,
                errorMessage:
                  `Profile '${profile.name}' recommends field '${fieldName}' for better data quality`,
                validatorType: "schema",
                reason: "not_mapped",
              }),
            );
          }
          // RequiredIfExists and Optional don't generate messages when missing
        }
      }
    }

    // Phase 1: Pre-validation checks and build list of field validation effects
    // These checks are fast (schema lookups, column existence checks)
    const fieldValidationEffects: Effect.Effect<
      { fieldName: string; status: "valid" },
      FieldViolation[]
    >[] = [];

    for (const mapping of validMappings) {
      // Require profile for validation - normalized fields are the source of truth
      if (!profile?.normalizedFields) {
        schemaViolations.push(
          new UnknownProfileViolation({
            enforcement: "required",
            severity: enforcementToSeverity("required"),
            fieldName: mapping.originName,
            targetName: mapping.targetName,
            errorMessage:
              `No validation profile specified for dataset '${dataset.name}'. Please add a 'profile' property to the dataset configuration.`,
            validatorType: "schema",
            profileId: dataset.spec ?? "unknown",
            reason: "not_found",
          }),
        );
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
        schemaViolations.push(
          new UnknownFieldViolation({
            enforcement: "required",
            severity: enforcementToSeverity("required"),
            fieldName: mapping.originName,
            targetName: mapping.targetName,
            errorMessage:
              `Unknown field '${mapping.targetName}' in profile '${profile.name}'. Please confirm the schema definition is up to date and that the fieldMappings in config file are correct.`,
            validatorType: "schema",
            profileId: profile.id,
          }),
        );
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
        schemaViolations.push(
          new MissingFieldViolation({
            enforcement: mapping.isRequired ? "required" : "recommended",
            severity: enforcementToSeverity(mapping.isRequired ? "required" : "recommended"),
            fieldName: mapping.originName,
            targetName: mapping.targetName,
            errorMessage: mapping.isRequired
              ? `Required field '${mapping.originName}' not found in CSV`
              : `Mapped field '${mapping.originName}' not found in CSV. Please check the fieldMappings in the config file`,
            validatorType: "schema",
            reason: "not_in_csv",
          }),
        );
        continue;
      }

      // Add field validation effect to the list (will be run in parallel later)
      if (specField) {
        const rawField = profile.fields?.[mapping.targetName];

        fieldValidationEffects.push(
          validateField(
            connection,
            tableName,
            mapping.originName,
            mapping.targetName,
            specField,
            {
              rawField,
              schemaTableName,
              hasControlledVocabulary: hasControlledVocabulary(specField),
            },
          ),
        );
      }
    }

    // Phase 2: Run all field validations concurrently across all fields
    if (fieldValidationEffects.length > 0) {
      const results = yield* _(
        Effect.all(fieldValidationEffects, { mode: "either", concurrency: "unbounded" }),
      );

      // Extract violations from Left results (failures)
      for (const result of results) {
        if (result._tag === "Left") {
          allFieldViolations.push(...result.left);
        }
      }
    }

    const processingTimeMs = Date.now() - startTime;

    // Partition violations by enforcement level
    const partitionedSchemaViolations = partitionSchemaViolations(schemaViolations);
    const partitionedFieldViolations = partitionFieldViolations(allFieldViolations);

    // Determine status based on errors (required violations) only
    const hasErrors = partitionedSchemaViolations.errors.length > 0 ||
      partitionedFieldViolations.errors.length > 0;

    const hasWarnings = partitionedSchemaViolations.warnings.length > 0 ||
      partitionedFieldViolations.warnings.length > 0;

    let status: "fail" | "warn" | "pass";
    if (hasErrors) {
      status = "fail";
    } else if (hasWarnings) {
      status = "warn";
    } else {
      status = "pass";
    }

    return {
      datasetName: dataset.name,
      spec: dataset.spec ?? "",
      filePath: dataset.path ?? "",
      rowsProcessed,
      processingTimeMs,
      status,

      // Partitioned violations by enforcement level
      schemaViolations: partitionedSchemaViolations,
      fieldViolations: partitionedFieldViolations,
    };
  });
}

/**
 * Find cross-dataset foreign key violations
 *
 * Uses the error channel pattern for violations:
 * - Success: No foreign key violations found
 * - Failure: Contains array of CrossDatasetViolation objects
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
): Effect.Effect<void, CrossDatasetViolation[]> {
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

    // No violations - succeed with void
    if (rows.length === 0) {
      return;
    }

    const enforcement = rule.enforcement ?? "required";

    // Build CrossDatasetViolation objects and fail with them
    const violations = rows.map((row) =>
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

    return yield* _(Effect.fail(violations));
  });
}

/**
 * Validate cross-dataset rule
 *
 * Returns cross-dataset validation result with any violations found.
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

    // findCrossDatasetViolations uses error channel - catch violations
    let violations: CrossDatasetViolation[] = [];
    yield* _(
      findCrossDatasetViolations(
        connection,
        { ...rule, enforcement },
        datasets,
      ).pipe(
        Effect.catchAll((v) => {
          violations = v;
          return Effect.succeed(undefined);
        }),
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

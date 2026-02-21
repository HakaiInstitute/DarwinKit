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

import type { WorkspaceOperationError } from "@dwkt/domain/errors";
import { WorkspaceImportError, WorkspaceValidationError } from "@dwkt/domain/errors";
import type {
  DatasetConfig,
  ResolvedSpec,
  ResolvedStandard,
  ValidationSettings,
  WorkspaceCrossDatasetRule,
} from "@dwkt/domain/schemas";
import { classToProfileKey } from "@dwkt/domain/schemas";
import type { SpecField } from "@dwkt/domain/specs";
import {
  getPreset,
  getPresetNames,
  getValidationProfile,
  resolveProfile,
} from "@dwkt/domain/specs";
import type {
  CrossDatasetValidationResult,
  DatasetValidationResult,
  FieldViolation,
  SchemaViolation,
  WorkspaceValidationResult,
} from "@dwkt/domain/types";
import {
  calculateSummary,
  MissingFieldViolation,
  MissingMappingViolation,
  partitionFieldViolations,
  partitionSchemaViolations,
  requirementToSeverity,
  UnknownFieldViolation,
  UnknownProfileViolation,
  UnmappedColumnViolation,
} from "@dwkt/domain/types";
import { importCsv } from "../loading/csv-import.ts";
import { sanitizeTableName } from "../loading/sql.ts";
import { Workspace } from "../workspace/workspace.ts";

// Import from modular validation files
import { importSchema } from "../loading/schema.ts";
import { insertRowByRow } from "./data-loader.ts";
import { validateField } from "./field-validators.ts";

import type { WorkspaceFieldMapping } from "@dwkt/domain/schemas";
import { findSuggestedValue } from "../validation/string-matching.ts";
import type { ResolutionDiagnostic } from "./field-resolution.ts";
import {
  deriveRequirementFromConstraints,
  resolveActiveStandard,
  resolveSpecFields,
  withResolvedConstraints,
} from "./field-resolution.ts";

/** Deduplicate violations by validator type + field name composite key */
function deduplicateByTypeAndField<T extends { validatorType: string; fieldName: string }>(
  arr: readonly T[],
): T[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const key = `${item.validatorType}:${item.fieldName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Workspace validator for config-based validation
 */
export class WorkspaceValidator {
  /**
   * Validate datasets directly from in-memory configuration
   *
   * Creates an isolated DuckDB instance, loads datasets, validates, then cleans up.
   */
  validateDatasets(
    datasets: readonly DatasetConfig[],
    settings: ValidationSettings,
    basePath: string,
    standard: ResolvedStandard,
    workspaceId?: string,
    crossDatasetRules?: readonly WorkspaceCrossDatasetRule[],
  ): Effect.Effect<WorkspaceValidationResult, WorkspaceOperationError> {
    return Effect.gen(function* (_) {
      const resolvedWorkspaceId = workspaceId ?? `validation-${Date.now()}`;

      // Create workspace and load all datasets
      const { workspaceId: wsId, connection, instance } = yield* _(
        createWorkspaceFromConfig(
          resolvedWorkspaceId,
          datasets,
          settings,
          basePath,
          standard,
          crossDatasetRules,
        ),
      );

      // Perform validation with guaranteed connection cleanup
      return yield* _(
        _validateDatasetsCore(
          connection,
          datasets,
          settings,
          basePath,
          standard,
          wsId,
          crossDatasetRules,
        )
          .pipe(
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
   */
  validateDatasetsWithConnection(
    connection: DuckDBConnection,
    datasets: readonly DatasetConfig[],
    settings: ValidationSettings,
    basePath: string,
    standard: ResolvedStandard,
    workspaceId?: string,
    crossDatasetRules?: readonly WorkspaceCrossDatasetRule[],
  ): Effect.Effect<WorkspaceValidationResult, WorkspaceOperationError> {
    return Effect.gen(function* (_) {
      const resolvedWorkspaceId = workspaceId ?? `validation-${Date.now()}`;

      // Resolve constraints for all datasets upfront so importSchema can use them for NOT NULL.
      // Only include fields with explicit config mappings — unmapped spec fields would cause
      // spurious NOT NULL failures since their columns are created but no data is inserted.
      const activeStandard = resolveActiveStandard(standard);
      const resolvedFieldsMap = new Map<string, Record<string, WorkspaceFieldMapping>>();
      for (const dataset of datasets) {
        const datasetProfile = resolveProfile(standard.variant, dataset.class);
        if (datasetProfile) {
          const configMappings = dataset.fieldMappings || [];
          const allResolved = resolveSpecFields(
            datasetProfile,
            activeStandard,
            configMappings,
          );
          const mappedNames = new Set(configMappings.map((m) => m.targetName));
          const mapped: Record<string, WorkspaceFieldMapping> = {};
          for (const [name, field] of Object.entries(allResolved)) {
            if (mappedNames.has(name)) mapped[name] = field;
          }
          resolvedFieldsMap.set(dataset.name, mapped);
        }
      }

      // Load each dataset into DuckDB (using the provided connection)
      for (const dataset of datasets) {
        const filePath = resolve(basePath, dataset.path);
        const tableName = `raw_${sanitizeTableName(dataset.name)}`;

        yield* _(
          importCsv(connection, tableName, filePath, settings.nullValues).pipe(
            Effect.mapError((e) =>
              new WorkspaceImportError({ message: e.message, cause: e.cause })
            ),
          ),
        );
        yield* _(
          importSchema(
            connection,
            dataset,
            datasets,
            standard,
            crossDatasetRules,
            resolvedFieldsMap.get(dataset.name),
          ),
        );
      }

      return yield* _(
        _validateDatasetsCore(
          connection,
          datasets,
          settings,
          basePath,
          standard,
          resolvedWorkspaceId,
          crossDatasetRules,
        ),
      );
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
 * Shared validation loop used by both validateDatasets() and validateDatasetsWithConnection()
 */
function _validateDatasetsCore(
  connection: DuckDBConnection,
  datasets: readonly DatasetConfig[],
  settings: ValidationSettings,
  basePath: string,
  standard: ResolvedStandard,
  workspaceId: string,
  crossDatasetRules?: readonly WorkspaceCrossDatasetRule[],
): Effect.Effect<WorkspaceValidationResult, WorkspaceOperationError> {
  return Effect.gen(function* (_) {
    const startTime = Date.now();
    const datasetResults: DatasetValidationResult[] = [];

    for (const dataset of datasets) {
      const datasetProfile = resolveProfile(standard.variant, dataset.class);

      const result = yield* _(
        validateDataset(connection, dataset, datasetProfile, standard, settings, crossDatasetRules),
      );

      datasetResults.push(result);

      if (settings.debug) {
        const earlyResult = {
          ...result,
          schemaViolations: {
            errors: deduplicateByTypeAndField(result.schemaViolations.errors),
            warnings: deduplicateByTypeAndField(result.schemaViolations.warnings),
            info: deduplicateByTypeAndField(result.schemaViolations.info),
          },
          fieldViolations: {
            errors: deduplicateByTypeAndField(result.fieldViolations.errors),
            warnings: deduplicateByTypeAndField(result.fieldViolations.warnings),
            info: deduplicateByTypeAndField(result.fieldViolations.info),
          },
        };
        console.debug(JSON.stringify(earlyResult, null, 4));
      }

      if (settings.failFast && result.status === "fail") {
        break;
      }
    }

    const crossDatasetResults: CrossDatasetValidationResult[] = [];
    // FK violations are caught at INSERT time via DuckDB FK constraints.
    // crossDatasetRules drives FK constraint creation in importSchema().

    const summary = calculateSummary(datasetResults, crossDatasetResults);
    const totalProcessingTimeMs = Date.now() - startTime;

    const overallStatus: "fail" | "warn" | "pass" = summary.datasetsFailedCount > 0 ||
        summary.totalErrors > 0
      ? "fail"
      : summary.datasetsWithWarningsCount > 0 || summary.totalWarnings > 0
      ? "warn"
      : "pass";

    return {
      workspaceId,
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
 * Create workspace and load all datasets from config
 */
function createWorkspaceFromConfig(
  workspaceId: string,
  datasets: readonly DatasetConfig[],
  validationSettings: ValidationSettings,
  basePath: string,
  standard: ResolvedStandard,
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

    // Resolve constraints for all datasets upfront so importSchema can use them for NOT NULL.
    // Only include fields with explicit config mappings — unmapped spec fields would cause
    // spurious NOT NULL failures since their columns are created but no data is inserted.
    const activeStandard = resolveActiveStandard(standard);
    const resolvedFieldsMap = new Map<string, Record<string, WorkspaceFieldMapping>>();
    for (const dataset of datasets) {
      const datasetProfile = resolveProfile(standard.variant, dataset.class);
      if (datasetProfile) {
        const configMappings = dataset.fieldMappings || [];
        const allResolved = resolveSpecFields(datasetProfile, activeStandard, configMappings);
        const mappedNames = new Set(configMappings.map((m) => m.targetName));
        const mapped: Record<string, WorkspaceFieldMapping> = {};
        for (const [name, field] of Object.entries(allResolved)) {
          if (mappedNames.has(name)) mapped[name] = field;
        }
        resolvedFieldsMap.set(dataset.name, mapped);
      }
    }

    // Load each dataset into DuckDB
    for (const dataset of datasets) {
      const filePath = resolve(basePath, dataset.path);
      // prepend 'raw_' to table name because dataset.name and the schema table can not be the same name otherwise the tables conflict
      const tableName = `raw_${sanitizeTableName(dataset.name)}`;

      // Import CSV with row numbers
      yield* _(
        importCsv(connection, tableName, filePath, validationSettings.nullValues).pipe(
          Effect.mapError((e) => new WorkspaceImportError({ message: e.message, cause: e.cause })),
        ),
      );
      yield* _(
        importSchema(
          connection,
          dataset,
          datasets,
          standard,
          crossDatasetRules,
          resolvedFieldsMap.get(dataset.name),
        ),
      );
    }

    return { workspaceId, connection, instance };
  });
}

/**
 * Validate a single dataset according to its spec
 */
function validateDataset(
  connection: DuckDBConnection,
  dataset: DatasetConfig,
  profile: ResolvedSpec | undefined,
  standard: ResolvedStandard,
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

    // Use base type profile for DuckDB table naming (matches importSchema which uses base profiles)
    const baseProfileKey = classToProfileKey(dataset.class);
    const baseProfile = getValidationProfile(baseProfileKey);

    const schemaTableName = baseProfile
      ? sanitizeTableName(baseProfile.name).toLowerCase()
      : dataset.name.toLowerCase();
    if (baseProfile === undefined) {
      return yield* _(
        Effect.fail(
          new WorkspaceValidationError({
            message: `Invalid profile identifier: ${baseProfileKey}`,
          }),
        ),
      );
    }
    // Resolve field definitions through 3-tier merge pipeline:
    // spec (obligations) → profile (fieldOverrides) → config (additive-only)
    const activeStandard = resolveActiveStandard(standard);
    const configFieldMappings = dataset?.fieldMappings || [];
    const resolutionDiagnostics: ResolutionDiagnostic[] | undefined = validationSettings?.debug
      ? []
      : undefined;
    const schemaColumnsObj = resolveSpecFields(
      profile ?? baseProfile,
      activeStandard,
      configFieldMappings,
      resolutionDiagnostics,
    );

    if (resolutionDiagnostics?.length) {
      for (const diag of resolutionDiagnostics) {
        console.debug(`[${dataset.name}] ${diag.message}`);
      }
    }

    // Detect field mapping issues
    const mappedOriginFields = configFieldMappings.map((m) => m.originName);
    const missingSourceFields = mappedOriginFields.filter(
      (f) => !originTableColumns.includes(f),
    ).map((f) => ({
      fieldName: f,
      alternatives: findSuggestedValue(f, originTableColumns) || "",
    }));

    const allFieldMappings = Object.values(schemaColumnsObj).map((m) => m.originName);

    const unmappedSourceColumns = originTableColumns.filter(
      (f) => !allFieldMappings.includes(f),
    ).map((f) => ({
      fieldName: f,
      alternatives: findSuggestedValue(f, mappedOriginFields) || "",
    }));

    // Collect all field violations as FieldViolation[]
    const allFieldViolations: FieldViolation[] = [];

    // Collect all schema violations as SchemaViolation[]
    const schemaViolations: SchemaViolation[] = [];

    // Filter out mappings that reference missing source fields
    const validMappings = Object.values(schemaColumnsObj).filter(
      (mapping) => originTableColumns.includes(mapping.originName),
    );

    // Check for invalid preset names in raw config mappings
    // (resolved mappings have already expanded presets into constraints)
    for (const mapping of configFieldMappings) {
      if (
        mapping.preset && getPreset(mapping.preset) === undefined &&
        originTableColumns.includes(mapping.originName)
      ) {
        const suggestion = findSuggestedValue(mapping.preset, getPresetNames());
        const suggestionMsg = suggestion ? ` Did you mean "${suggestion}"?` : "";
        schemaViolations.push(
          new MissingMappingViolation({
            severity: requirementToSeverity("required"),
            fieldName: mapping.originName,
            targetName: mapping.targetName,
            errorMessage:
              `Unknown preset "${mapping.preset}" for field '${mapping.targetName}'.${suggestionMsg}`,
            validatorType: "schema",
            datasetName: dataset.name,
          }),
        );
      }
    }

    // Build column lists from valid mappings only
    const targetColumnNames = validMappings.map((field) => `"${field.targetName}"`);
    const originColumnNames = validMappings.map((field) => `"${field.originName}"`);

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
            activeStandard,
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
    // Config-specified fields missing from CSV are always errors
    for (const missingSourceField of missingSourceFields) {
      const mapping = (dataset.fieldMappings || []).find((m) =>
        m.originName === missingSourceField.fieldName
      );
      const altMsg = missingSourceField.alternatives
        ? `Possible alternative fields: ${missingSourceField.alternatives}`
        : "";
      schemaViolations.push(
        new MissingMappingViolation({
          severity: requirementToSeverity("required"),
          fieldName: missingSourceField.fieldName,
          targetName: mapping?.targetName ?? missingSourceField.fieldName,
          errorMessage:
            `Field '${missingSourceField.fieldName}' is specified in config but not found in CSV.${
              altMsg ? ` ${altMsg}` : ""
            }`,
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
          severity: requirementToSeverity("optional"),
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

    // Check field requirements based on constraints (derived from obligations + overrides).
    // Config-specified fields missing from CSV are always errors.
    // Schema-populated fields use constraint-driven detection:
    //   Required → error, StronglyRecommended → warning, everything else → suppressed
    if (profile && schemaColumnsObj && validMappings) {
      const mappedSpecFields = new Set(
        validMappings.map((m) => m.targetName),
      );
      const configSpecifiedFields = new Set(
        configFieldMappings.map((m) => m.targetName),
      );

      for (
        const [fieldName, fieldMapping] of Object.entries(
          schemaColumnsObj,
        )
      ) {
        const isMapped = mappedSpecFields.has(fieldName);
        if (isMapped) continue;

        const isConfigField = configSpecifiedFields.has(fieldName);

        if (isConfigField) {
          // Config-specified field missing from CSV is always an error
          schemaViolations.push(
            new MissingFieldViolation({
              severity: requirementToSeverity("required"),
              fieldName,
              targetName: fieldName,
              errorMessage:
                `Field '${fieldName}' is specified in config fieldMappings but not found in the dataset`,
              validatorType: "schema",
              reason: "not_mapped",
            }),
          );
          continue;
        }

        // Derive requirement from constraints (single source of truth)
        const requirement = deriveRequirementFromConstraints(fieldMapping.constraints);
        if (!requirement) {
          // No requirement constraint — skip silently
          continue;
        }

        const messageVerb = requirement === "required"
          ? "requires"
          : requirement === "recommended"
          ? "strongly recommends"
          : "recommends";

        schemaViolations.push(
          new MissingFieldViolation({
            severity: requirementToSeverity(requirement),
            fieldName,
            targetName: fieldName,
            errorMessage:
              `Profile '${profile.name}' ${messageVerb} field '${fieldName}' but it is not mapped in the dataset`,
            validatorType: "schema",
            reason: "not_mapped",
          }),
        );
      }
    }

    // Phase 1: Pre-validation checks and build list of field validation effects
    // These checks are fast (schema lookups, column existence checks)
    const fieldValidationEffects: Effect.Effect<
      { fieldName: string; status: "valid" },
      FieldViolation[]
    >[] = [];

    for (const mapping of validMappings) {
      // Require profile for validation - spec fields are the source of truth
      if (!profile?.specFields) {
        schemaViolations.push(
          new UnknownProfileViolation({
            severity: requirementToSeverity("required"),
            fieldName: mapping.originName,
            targetName: mapping.targetName,
            errorMessage:
              `No validation profile specified for dataset '${dataset.name}'. Please add a 'class' property to the dataset configuration.`,
            validatorType: "schema",
            profileId: dataset.class ?? "unknown",
            reason: "not_found",
          }),
        );
        continue;
      }

      // Get field from spec-level fields (preserves obligations for downstream use)
      const baseField = profile.specFields?.[mapping.targetName] as
        | SpecField
        | undefined;

      // Validate that mapped fields exist in profile
      if (!baseField) {
        // Unknown field in profile
        schemaViolations.push(
          new UnknownFieldViolation({
            severity: requirementToSeverity("required"),
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

      // Apply resolved constraints from the 3-tier merge pipeline
      const specField = withResolvedConstraints(baseField, mapping);

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
            severity: requirementToSeverity("required"),
            fieldName: mapping.originName,
            targetName: mapping.targetName,
            errorMessage:
              `Field '${mapping.originName}' not found in CSV. Please check the fieldMappings in the config file`,
            validatorType: "schema",
            reason: "not_in_csv",
          }),
        );
        continue;
      }

      // Add field validation effect to the list (will be run in parallel later)
      if (specField) {
        // Determine if DuckDB schema already enforces uniqueness
        const rawField = profile.rawFields?.[mapping.targetName];
        const isDbPrimaryKey = mapping.targetName === schemaTableName + "ID" ||
          (mapping.targetName.endsWith("ID") && String(rawField?.unique) === "true");

        fieldValidationEffects.push(
          validateField(
            connection,
            tableName,
            mapping.originName,
            mapping.targetName,
            specField,
            {
              isDbPrimaryKey,
              maxViolations: validationSettings?.maxViolationsPerField,
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

    // Partition violations by severity
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
      class: dataset.class,
      filePath: dataset.path ?? "",
      rowsProcessed,
      processingTimeMs,
      status,

      // Partitioned violations by severity
      schemaViolations: partitionedSchemaViolations,
      fieldViolations: partitionedFieldViolations,
    };
  });
}

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
import { getPreset, getPresetNames, getResolvedSpec, getSpecNames } from "@dwkt/domain/specs";
import type {
  DatasetValidationResult,
  FieldViolation,
  SchemaViolation,
  WorkspaceValidationResult,
} from "@dwkt/domain/types";
import {
  calculateSummary,
  determineOverallStatus,
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

import { importSchema } from "../loading/schema.ts";
import { insertRowByRow } from "./data-loader.ts";
import { validateField } from "./field-validators.ts";

import { findSuggestedValue } from "../validation/string-matching.ts";
import type { ResolvedFieldsEntry } from "./field-resolution.ts";
import {
  applyResolvedConstraints,
  deriveRequirementFromConstraints,
  resolveActiveStandard,
  resolveFieldsForDatasets,
} from "./field-resolution.ts";

function deduplicateByTypeAndField<T extends { _tag: string; fieldName: string }>(
  arr: readonly T[],
): T[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const key = `${item._tag}:${item.fieldName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class WorkspaceValidator {
  validateDatasets(
    datasets: readonly DatasetConfig[],
    settings: ValidationSettings,
    basePath: string,
    standard: ResolvedStandard,
    workspaceId?: string,
    crossDatasetRules?: readonly WorkspaceCrossDatasetRule[],
    configPath?: string,
  ): Effect.Effect<WorkspaceValidationResult, WorkspaceOperationError> {
    return Effect.gen(function* (_) {
      const resolvedWorkspaceId = workspaceId ?? `validation-${Date.now()}`;

      // Resolve constraints once — shared by both schema creation and validation
      const resolvedFieldsMap = resolveFieldsForDatasets(datasets, standard);

      const { workspaceId: wsId, connection, instance } = yield* _(
        createWorkspaceFromConfig(
          resolvedWorkspaceId,
          datasets,
          settings,
          basePath,
          standard,
          resolvedFieldsMap,
          crossDatasetRules,
        ),
      );

      return yield* _(
        _validateDatasetsCore(
          connection,
          datasets,
          settings,
          basePath,
          standard,
          wsId,
          resolvedFieldsMap,
          crossDatasetRules,
          configPath,
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
   * Validate datasets using a provided DuckDB connection (does not own the connection lifecycle).
   */
  validateDatasetsWithConnection(
    connection: DuckDBConnection,
    datasets: readonly DatasetConfig[],
    settings: ValidationSettings,
    basePath: string,
    standard: ResolvedStandard,
    workspaceId?: string,
    crossDatasetRules?: readonly WorkspaceCrossDatasetRule[],
    configPath?: string,
  ): Effect.Effect<WorkspaceValidationResult, WorkspaceOperationError> {
    return Effect.gen(function* (_) {
      const resolvedWorkspaceId = workspaceId ?? `validation-${Date.now()}`;

      // Resolve constraints once — shared by both schema creation and validation
      const resolvedFieldsMap = resolveFieldsForDatasets(datasets, standard);

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
        const entry = resolvedFieldsMap.get(dataset.name);
        if (entry) {
          yield* _(
            importSchema(
              connection,
              dataset,
              datasets,
              standard,
              entry.resolvedSpec,
              crossDatasetRules,
              entry.mapped,
            ),
          );
        }
      }

      return yield* _(
        _validateDatasetsCore(
          connection,
          datasets,
          settings,
          basePath,
          standard,
          resolvedWorkspaceId,
          resolvedFieldsMap,
          crossDatasetRules,
          configPath,
        ),
      );
    });
  }

  validateFromConfig(
    configPath?: string,
    options?: {
      failFast?: boolean;
    },
  ): Effect.Effect<WorkspaceValidationResult, WorkspaceOperationError> {
    return Effect.scoped(
      Effect.gen(function* (_) {
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

function _validateDatasetsCore(
  connection: DuckDBConnection,
  datasets: readonly DatasetConfig[],
  settings: ValidationSettings,
  basePath: string,
  standard: ResolvedStandard,
  workspaceId: string,
  resolvedFieldsMap: Map<string, ResolvedFieldsEntry>,
  crossDatasetRules?: readonly WorkspaceCrossDatasetRule[],
  configPath?: string,
): Effect.Effect<WorkspaceValidationResult, WorkspaceOperationError> {
  return Effect.gen(function* (_) {
    const startTime = Date.now();
    const datasetResults: DatasetValidationResult[] = [];

    for (const dataset of datasets) {
      const preResolved = resolvedFieldsMap.get(dataset.name);
      const datasetProfile = preResolved?.resolvedSpec;

      const result = yield* _(
        validateDataset(
          connection,
          dataset,
          datasetProfile,
          standard,
          settings,
          preResolved,
          crossDatasetRules,
        ),
      );

      datasetResults.push(result);

      // Debug-only: deduplicate and log intermediate results for troubleshooting.
      // Not part of the validation output — kept as a diagnostic aid during development.
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

    const summary = calculateSummary(datasetResults);
    const totalProcessingTimeMs = Date.now() - startTime;

    const overallStatus = determineOverallStatus(summary);

    return {
      workspaceId,
      configPath: configPath ?? basePath,
      validatedAt: new Date(),
      totalProcessingTimeMs,
      overallStatus,
      datasetResults,
      summary,
    };
  });
}

function createWorkspaceFromConfig(
  workspaceId: string,
  datasets: readonly DatasetConfig[],
  validationSettings: ValidationSettings,
  basePath: string,
  standard: ResolvedStandard,
  resolvedFieldsMap: Map<string, ResolvedFieldsEntry>,
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

    const connection = yield* _(
      Effect.tryPromise(() => instance.connect()).pipe(Effect.orDie),
    );

    for (const dataset of datasets) {
      const filePath = resolve(basePath, dataset.path);
      // Prefix with 'raw_' to avoid name collision with the schema table
      const tableName = `raw_${sanitizeTableName(dataset.name)}`;

      yield* _(
        importCsv(connection, tableName, filePath, validationSettings.nullValues).pipe(
          Effect.mapError((e) => new WorkspaceImportError({ message: e.message, cause: e.cause })),
        ),
      );
      const entry = resolvedFieldsMap.get(dataset.name);
      if (entry) {
        yield* _(
          importSchema(
            connection,
            dataset,
            datasets,
            standard,
            entry.resolvedSpec,
            crossDatasetRules,
            entry.mapped,
          ),
        );
      }
    }

    return { workspaceId, connection, instance };
  });
}

function validateDataset(
  connection: DuckDBConnection,
  dataset: DatasetConfig,
  profile: ResolvedSpec | undefined,
  standard: ResolvedStandard,
  validationSettings?: ValidationSettings,
  preResolved?: ResolvedFieldsEntry,
  crossDatasetRules?: readonly WorkspaceCrossDatasetRule[],
): Effect.Effect<DatasetValidationResult, WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    const startTime = Date.now();
    const tableName = `raw_${sanitizeTableName(dataset.name)}`;

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
    const baseProfile = getResolvedSpec(dataset.class);

    const schemaTableName = baseProfile
      ? sanitizeTableName(baseProfile.name).toLowerCase()
      : dataset.name.toLowerCase();
    if (baseProfile === undefined) {
      const suggestion = findSuggestedValue(dataset.class, getSpecNames());
      const suggestionMsg = suggestion ? ` Did you mean '${suggestion}'?` : "";
      return yield* _(
        Effect.fail(
          new WorkspaceValidationError({
            message: `'${dataset.class}' is not a valid class.${suggestionMsg}`,
          }),
        ),
      );
    }

    const configFieldMappings = dataset?.fieldMappings || [];
    const schemaColumnsObj = preResolved?.all ?? {};

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

    const allFieldViolations: FieldViolation[] = [];
    const schemaViolations: SchemaViolation[] = [];

    const validMappings = Object.values(schemaColumnsObj).filter(
      (mapping) => originTableColumns.includes(mapping.originName),
    );

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

            datasetName: dataset.name,
          }),
        );
      }
    }

    const targetColumnNames = validMappings.map((field) => `"${field.targetName}"`);
    const originColumnNames = validMappings.map((field) => `"${field.originName}"`);
    const columnMappings = validMappings.map((m) => ({
      origin: m.originName,
      target: m.targetName,
    }));

    const insertSQL = `INSERT INTO ${schemaTableName} (${targetColumnNames.join(", ")}) SELECT ${
      originColumnNames.join(", ")
    } FROM ${tableName};`;

    // Try bulk INSERT first; fall back to row-by-row on constraint failures
    const bulkInsertResult = yield* _(
      Effect.tryPromise({
        try: () => connection.run(insertSQL),
        catch: (error) => error,
      }).pipe(Effect.either),
    );

    if (bulkInsertResult._tag === "Left") {
      if (profile) {
        const { standard: activeStandard } = resolveActiveStandard(standard);
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
          datasetName: dataset.name,
        }),
      );
    }

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
          datasetName: dataset.name,
        }),
      );
    }

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
          schemaViolations.push(
            new MissingFieldViolation({
              severity: requirementToSeverity("required"),
              fieldName,
              targetName: fieldName,
              errorMessage:
                `Field '${fieldName}' is specified in config fieldMappings but not found in the dataset`,

              reason: "not_mapped",
            }),
          );
          continue;
        }

        const requirement = deriveRequirementFromConstraints(fieldMapping.constraints);
        if (!requirement) {
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

            reason: "not_mapped",
          }),
        );
      }
    }

    const fieldValidationEffects: Effect.Effect<
      { fieldName: string; status: "valid" },
      FieldViolation[]
    >[] = [];

    for (const mapping of validMappings) {
      if (!profile?.specFields) {
        schemaViolations.push(
          new UnknownProfileViolation({
            severity: requirementToSeverity("required"),
            fieldName: mapping.originName,
            targetName: mapping.targetName,
            errorMessage:
              `No validation profile specified for dataset '${dataset.name}'. Please add a 'class' property to the dataset configuration.`,

            profileId: dataset.class ?? "unknown",
            reason: "not_found",
          }),
        );
        continue;
      }

      const baseField = profile.specFields?.[mapping.targetName];

      if (!baseField) {
        schemaViolations.push(
          new UnknownFieldViolation({
            severity: requirementToSeverity("required"),
            fieldName: mapping.originName,
            targetName: mapping.targetName,
            errorMessage:
              `Unknown field '${mapping.targetName}' in profile '${profile.name}'. Please confirm the schema definition is up to date and that the fieldMappings in config file are correct.`,

            profileId: profile.id,
          }),
        );
        continue;
      }

      const specField = applyResolvedConstraints(baseField, mapping);

      if (specField) {
        const rawField = profile.rawFields?.[mapping.targetName];
        const isDbPrimaryKey = mapping.targetName === schemaTableName + "ID" ||
          (mapping.targetName.endsWith("ID") && String(rawField?.unique) === "true");

        fieldValidationEffects.push(
          validateField(
            connection,
            tableName,
            mapping.originName,
            specField,
            {
              isDbPrimaryKey,
              maxViolations: validationSettings?.maxViolationsPerField,
            },
          ),
        );
      }
    }

    if (fieldValidationEffects.length > 0) {
      const results = yield* _(
        Effect.all(fieldValidationEffects, { mode: "either", concurrency: "unbounded" }),
      );

      for (const result of results) {
        if (result._tag === "Left") {
          allFieldViolations.push(...result.left);
        }
      }
    }

    const processingTimeMs = Date.now() - startTime;

    const partitionedSchemaViolations = partitionSchemaViolations(schemaViolations);
    const partitionedFieldViolations = partitionFieldViolations(allFieldViolations);

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

      schemaViolations: partitionedSchemaViolations,
      fieldViolations: partitionedFieldViolations,
    };
  });
}

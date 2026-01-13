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
  DatasetConfig,
  DatasetValidationResult,
  FieldDefinition,
  ValidationProfile,
  ValidationSettings,
  ValidationViolation,
  ValidatorConfig,
  WorkspaceFieldMapping,
} from "@dwkt/domain";
import {
  ErrorCode,
  FieldRequirementLevel,
  hasControlledVocabulary,
  parseSpecIdentifier,
  resolveDatasetProfile,
} from "@dwkt/domain";
import {
  insertRowByRow,
  sanitizeTableName,
  WorkspaceImportCSV,
  WorkspaceImportSchema,
} from "./database-operations.ts";
import {
  partitionViolations,
  WorkspaceImportError,
  WorkspaceValidationError,
} from "./validation-utils.ts";
import { validateRangeConstraints, validateUniqueness, validateVocabulary } from "./validators.ts";

// Re-export for backward compatibility
export { WorkspaceImportError, WorkspaceValidationError };

// Re-export database operations for package consumers
export { WorkspaceImportCSV, WorkspaceImportSchema } from "./database-operations.ts";

/**
 * Create workspace and load all datasets from config
 *
 * @internal Exported for use by Workspace class
 */
export function createWorkspaceFromConfig(
  workspaceId: string,
  datasets: readonly DatasetConfig[],
  validationSettings: ValidationSettings,
  basePath: string,
): Effect.Effect<
  { workspaceId: string; connection: DuckDBConnection; instance: DuckDBInstance },
  WorkspaceValidationError
> {
  return Effect.gen(function* (_) {
    // Create isolated DuckDB instance - each workspace gets its own in-memory database
    // This prevents test contamination where tables from one test persist into another
    const instance = yield* _(
      Effect.tryPromise(() => DuckDBInstance.create(":memory:")).pipe(Effect.orDie),
    );

    // Create connection from isolated instance - failure is a system defect
    const connection = yield* _(
      Effect.tryPromise(() => instance.connect()).pipe(Effect.orDie),
    );

    // Load each dataset into DuckDB
    for (const dataset of datasets) {
      const filePath = resolve(basePath, dataset.path);
      // prepend'raw_' to table name becouse dataset.name and spec/profile can not be the same name otherwise the tables conflict
      const tableName = `raw_${sanitizeTableName(dataset.name)}`;

      // Build null values string for DuckDB
      const nullStr = validationSettings.nullValues.map((v: string) => `'${v}'`).join(", ");
      const dropTable = true;
      yield* _(WorkspaceImportCSV(connection, tableName, filePath, nullStr, dropTable));
      yield* _(WorkspaceImportSchema(connection, dataset, datasets));
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
 *
 * @internal Exported for use by Workspace class
 */
export function validateDataset(
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
            code: ErrorCode.VALIDATION_FAILED,
          }),
        ),
      );
    }

    const originTableColumnsResult = yield* _(
      Effect.tryPromise({
        try: () => connection.runAndReadAll(`SELECT column_name FROM (DESCRIBE '${tableName}')`),
        catch: (error) => {
          console.error(error);
          return new WorkspaceValidationError({
            message: `Failed to Describe table: ${error}`,
            code: ErrorCode.DATABASE_ERROR,
            cause: error instanceof Error ? error : new Error(String(error)),
          });
        },
      }),
    );

    // Exclude _row_number; it's only used internally
    const originTableColumns = originTableColumnsResult.getRowObjects()
      .map((row) => String(row.column_name))
      .filter((col) => col !== "_row_number");

    // Derive profile name - use profile.name if available (this is the actual table name),
    // otherwise resolve profile from dataset config
    const resolvedProfile = profile || resolveDatasetProfile(dataset);
    const profileName = resolvedProfile?.name;

    const schemaTableName = profileName
      ? sanitizeTableName(profileName).toLowerCase()
      : dataset.name.toLowerCase();
    const originFileColumns = dataset.fieldMappings.map((field) => `${field.originName}`);
    const targetColumnNames = dataset.fieldMappings.map((field) => `"${field.targetName}"`);
    const originColumnNames = dataset.fieldMappings.map((field) => `"${field.originName}"`);

    const missingSourceFields = originFileColumns.filter((f: string) =>
      !originTableColumns.includes(f)
    );
    const missingMappedFields = originTableColumns.filter((f: string) =>
      !originFileColumns.includes(f)
    );

    // TODO: this check should generate a warning not an error
    if (missingSourceFields.length) {
      return yield* _(
        Effect.fail(
          new WorkspaceValidationError({
            message:
              `The data source for dataset '${dataset.name}' does not contain the mapped fields ['${
                missingSourceFields.join("','")
              }']. Please check the dataset config.`,
            code: ErrorCode.INVALID_CONFIG,
            cause: Error(String("Dataset mapped field missing from source database table")),
          }),
        ),
      );
    }

    // TODO: this check should generate a warning not an error
    if (missingMappedFields.length) {
      // Log warning but don't fail - unmapped columns are acceptable
      console.warn(
        `Warning: The dataset '${dataset.name}' has unmapped source columns: ['${
          missingMappedFields.join("','")
        }']. These columns will be ignored during validation.`,
      );
    }

    // Collect all violations as ValidationViolation[] for partitioning
    const allViolations: ValidationViolation[] = [];

    // Build column mappings for INSERT
    const columnMappings = dataset.fieldMappings.map((m) => ({
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
      // Bulk INSERT failed - fall back to row-by-row insertion
      const error = bulkInsertResult.left;
      // console.log(
      //   `Bulk INSERT failed for dataset '${dataset.name}' - falling back to row-by-row insertion to collect detailed violations`,
      // );

      if (error instanceof Error) {
        //console.log(`Bulk INSERT error: ${error.message}`);
      }

      // Insert rows one-by-one and collect violations
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
    } else {
      // Bulk INSERT succeeded - no constraint violations
      // console.log(`Bulk INSERT succeeded for dataset '${dataset.name}' - no constraint violations`);
    }

    // Validate field mappings based on spec

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
          (mapping.targetName.endsWith("ID") && rawFieldForUnique?.unique === "true");

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

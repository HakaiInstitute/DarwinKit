/**
 * Dataset Validator - Either-based validation with parallel field validation
 *
 * Uses Either-based field validators for automatic violation accumulation.
 * Key features:
 * - Validates all fields in parallel using Effect.all with mode: "either"
 * - Accumulates violations automatically from error channel
 * - Eliminates imperative for-loop with manual `.push()` operations
 * - Maintains consistent result structure
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import * as Effect from "effect/Effect";

import { WorkspaceValidationError } from "@dwkt/core";
import type {
  DatasetConfig,
  DatasetValidationResult,
  FieldDefinition,
  FieldViolation,
  SchemaViolation,
  ValidationConfig,
  ValidationProfile,
  ValidatorConfig,
  WorkspaceFieldMapping,
} from "@dwkt/domain";
import {
  hasControlledVocabulary,
  MissingFieldViolation,
  parseSpecIdentifier,
  partitionSchemaViolations,
  resolveDatasetProfile,
  UnknownFieldViolation,
  UnknownProfileViolation,
  UnmappedColumnViolation,
} from "@dwkt/domain";
import { sanitizeTableName } from "../database/index.ts";
import { insertRowByRow } from "./data-loader.ts";
import { partitionFieldViolations } from "./utils.ts";
import {
  validateField,
  validateRangeConstraints,
  validateUniqueness,
  validateVocabulary,
} from "./field-validators.ts";

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
 * Field validation context - all info needed to validate a single field
 */
interface FieldValidationContext {
  mapping: WorkspaceFieldMapping;
  specField: FieldDefinition;
  tableName: string;
  schemaTableName: string;
  profile: ValidationProfile;
}

/**
 * Validate a single field mapping
 *
 * Returns violations in error channel, succeeds if field is valid.
 * This function composes all field validators for a single field.
 */
function validateFieldMapping(
  connection: DuckDBConnection,
  context: FieldValidationContext,
): Effect.Effect<{ fieldName: string; status: "valid" }, FieldViolation[]> {
  return Effect.gen(function* (_) {
    const { mapping, specField, tableName, profile } = context;

    // Build list of validations to run for this field
    const validations: Effect.Effect<
      { fieldName: string; status: "valid" },
      FieldViolation[]
    >[] = [];

    // Range/constraint validation
    if (
      specField.validators?.some((v) => {
        const vConfig = v as ValidatorConfig;
        return vConfig.type === "range";
      })
    ) {
      validations.push(
        validateRangeConstraints(connection, tableName, mapping.originName, specField),
      );
    }

    // Vocabulary validation
    // Skip if this field was already validated as an ENUM constraint
    const hasVocab = hasControlledVocabulary(specField);
    const rawFieldForVocab = profile.fields?.[mapping.targetName];
    const hasEnumConstraint = rawFieldForVocab?.type === "controlled-vocabulary" &&
      rawFieldForVocab?.values;

    if (hasVocab && !hasEnumConstraint) {
      validations.push(
        validateVocabulary(connection, tableName, mapping.originName, specField),
      );
    }

    // Uniqueness validation for fields with explicit unique validators
    // Skip PKs because row-by-row INSERT queries for ALL duplicate rows
    const rawFieldForUnique = profile.fields?.[mapping.targetName];
    const schemaTableName = context.schemaTableName;
    const isPrimaryKeyField = mapping.targetName === schemaTableName + "ID" ||
      (mapping.targetName.endsWith("ID") && rawFieldForUnique?.unique === "true");

    const hasUniqueValidator = specField.validators
      ? (specField.validators.some((v) => {
        const vConfig = v as ValidatorConfig;
        return vConfig.type === "unique";
      }))
      : false;

    if (hasUniqueValidator && !isPrimaryKeyField) {
      validations.push(
        validateUniqueness(connection, tableName, mapping.originName, specField),
      );
    }

    // If no validations, field is valid
    if (validations.length === 0) {
      return { fieldName: mapping.originName, status: "valid" as const };
    }

    // Run all validations for this field, accumulating violations
    return yield* _(validateField(connection, tableName, mapping.originName, specField));
  });
}

/**
 * Validate a single dataset according to its spec
 *
 * Uses Either-based field validators with parallel execution.
 * Returns DatasetValidationResult with comprehensive violation details.
 *
 * @internal Exported for use by Workspace class
 */
export function validateDataset(
  connection: DuckDBConnection,
  dataset: DatasetConfig,
  profile?: ValidationProfile,
  validationSettings?: ValidationConfig,
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
        try: () => connection.runAndReadAll(`SELECT column_name FROM (DESCRIBE '${tableName}')`),
        catch: (error) =>
          new WorkspaceValidationError({
            message: `Failed to Describe table: ${error}`,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
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

    if (missingSourceFields.length) {
      return yield* _(
        Effect.fail(
          new WorkspaceValidationError({
            message:
              `The data source for dataset '${dataset.name}' does not contain the mapped fields ['${
                missingSourceFields.join("','")
              }']. Please check the dataset config.`,
            cause: Error(String("Dataset mapped field missing from source database table")),
          }),
        ),
      );
    }

    // Collect all violations - will accumulate from Either error channels
    const allViolations: FieldViolation[] = [];

    // Collect schema violations
    const schemaViolations: SchemaViolation[] = [];

    // Report unmapped CSV columns as INFO-level notifications
    for (const unmappedColumn of missingMappedFields) {
      schemaViolations.push(
        new UnmappedColumnViolation({
          enforcement: "optional",
          severity: "info",
          fieldName: unmappedColumn,
          targetName: "",
          errorMessage:
            `CSV column '${unmappedColumn}' has no field mapping and will be ignored during validation`,
          validatorType: "schema",
          datasetName: dataset.name,
        }),
      );
    }

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
    }

    // Check profile field requirements based on requirement levels
    if (profile && profile.fieldOverrides && dataset.fieldMappings) {
      const mappedSpecFields = new Set(dataset.fieldMappings.map((m) => m.targetName));

      for (const [fieldName, fieldOverride] of Object.entries(profile.fieldOverrides)) {
        if (!fieldOverride.requirement) continue;

        const isMapped = mappedSpecFields.has(fieldName);

        if (!isMapped) {
          // Handle missing fields based on requirement level
          if (fieldOverride.requirement === "required") {
            schemaViolations.push(
              new MissingFieldViolation({
                enforcement: "required",
                severity: "error",
                fieldName,
                targetName: fieldName,
                errorMessage:
                  `Profile '${profile.name}' requires field '${fieldName}' but it is not mapped in the dataset`,
                validatorType: "schema",
                reason: "not_mapped",
              }),
            );
          } else if (fieldOverride.requirement === "strongly-recommended") {
            schemaViolations.push(
              new MissingFieldViolation({
                enforcement: "recommended",
                severity: "warning",
                fieldName,
                targetName: fieldName,
                errorMessage:
                  `Profile '${profile.name}' strongly recommends field '${fieldName}' but it is not mapped`,
                validatorType: "schema",
                reason: "not_mapped",
              }),
            );
          } else if (fieldOverride.requirement === "recommended") {
            schemaViolations.push(
              new MissingFieldViolation({
                enforcement: "optional",
                severity: "info",
                fieldName,
                targetName: fieldName,
                errorMessage:
                  `Profile '${profile.name}' recommends field '${fieldName}' for better data quality`,
                validatorType: "schema",
                reason: "not_mapped",
              }),
            );
          }
        }
      }
    }

    // ======================================================================
    // V2 DIFFERENCE: Parallel field validation using Either pattern
    // ======================================================================

    // Build validation contexts for all valid field mappings
    const fieldValidationContexts: FieldValidationContext[] = [];

    for (const mapping of dataset?.fieldMappings || []) {
      // Require profile for validation - normalized fields are the source of truth
      if (!profile?.normalizedFields) {
        schemaViolations.push(
          new UnknownProfileViolation({
            enforcement: "required",
            severity: "error",
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

      // Get field from normalized profile
      const baseField = profile.normalizedFields?.[mapping.targetName] as
        | FieldDefinition
        | undefined;

      // Validate that mapped fields exist in profile
      if (!baseField) {
        schemaViolations.push(
          new UnknownFieldViolation({
            enforcement: "required",
            severity: "error",
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
        Effect.tryPromise(() => connection.runAndReadAll(fieldExistsQuery)).pipe(
          Effect.orDie,
        ),
      );

      const fieldExists = fieldExistsResult.getRowObjects().length > 0;

      if (!fieldExists) {
        if (mapping.isRequired) {
          const message = `Required field '${mapping.originName}' not found in CSV`;
          schemaViolations.push(
            new MissingFieldViolation({
              enforcement: "required",
              severity: "error",
              fieldName: mapping.originName,
              targetName: mapping.targetName,
              errorMessage: message,
              validatorType: "schema",
              reason: "not_in_csv",
            }),
          );
        } else {
          const message =
            `Mapped field '${mapping.originName}' not found in CSV. Please check the fieldMappings in the config file`;
          schemaViolations.push(
            new MissingFieldViolation({
              enforcement: "recommended",
              severity: "warning",
              fieldName: mapping.originName,
              targetName: mapping.targetName,
              errorMessage: message,
              validatorType: "schema",
              reason: "not_in_csv",
            }),
          );
        }
        continue;
      }

      // Add to validation contexts if we have a valid spec field
      if (specField) {
        fieldValidationContexts.push({
          mapping,
          specField,
          tableName,
          schemaTableName,
          profile,
        });
      }
    }

    // V2: Validate all fields in parallel using Either pattern
    if (fieldValidationContexts.length > 0) {
      const fieldValidations = fieldValidationContexts.map((context) =>
        validateFieldMapping(connection, context)
      );

      // Run all field validations in parallel, accumulating violations
      const results = yield* _(
        Effect.all(fieldValidations, {
          mode: "either",
          concurrency: "unbounded", // Parallel execution
        }),
      );

      // Accumulate violations from error channel
      for (const result of results) {
        if (result._tag === "Left") {
          allViolations.push(...result.left);
        }
      }
    }

    const processingTimeMs = Date.now() - startTime;

    // Partition violations by enforcement level
    const partitioned = partitionFieldViolations(allViolations);

    // Partition schema violations by enforcement level
    const partitionedSchema = partitionSchemaViolations(schemaViolations);

    // Determine status based on errors and warnings
    const hasErrors = partitionedSchema.errors.length > 0 || partitioned.errors.length > 0;
    const hasWarnings = partitionedSchema.warnings.length > 0 || partitioned.warnings.length > 0;

    const status = hasErrors ? "fail" : hasWarnings ? "warn" : "pass";

    return {
      datasetName: dataset.name,
      spec: dataset.spec ?? "",
      filePath: dataset.path ?? "",
      rowsProcessed,
      processingTimeMs,
      status,
      schemaViolations: partitionedSchema,
      fieldViolations: partitioned,
    };
  });
}

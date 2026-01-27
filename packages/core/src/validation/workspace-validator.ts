/**
 * Workspace Validator - Config-based multi-dataset validation
 *
 * Validates multiple datasets within a workspace according to their specifications.
 * Uses field mappings to validate CSV columns against spec field definitions.
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBInstance } from "@duckdb/node-api";
import { dirname, resolve } from "@std/path";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

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
  EnumViolation,
  FieldRequirementLevel,
  getValidationProfile,
  getVocabularyValues,
  hasControlledVocabulary,
  isValidVocabularyValue,
  NotNullViolation,
  parseSpecIdentifier,
  PrimaryKeyViolation,
  RangeViolation,
  UniquenessViolation,
  VocabularyViolation,
} from "@dwkt/domain";
import { levenshteinDistance } from "../utils/string-utils.ts";
import { ValidationService } from "./validation-service.ts";
import { WorkspaceService } from "../workspace/workspace-service.ts";

/**
 * Error classes for workspace validation
 */
const WorkspaceValidationErrorBase = Data.TaggedClass(
  "WorkspaceValidationError",
)<{
  readonly message: string;
  readonly cause?: Error;
}>;

/**
 * Represents an error that occurs during the data importing process.
 */
export class WorkspaceImportError extends WorkspaceValidationErrorBase {}

export class WorkspaceValidationError extends WorkspaceValidationErrorBase {}

/**
 * Imports a CSV file into a DuckDB table with a _row_number column.
 *
 * @param connection - The DuckDB connection to use for the import
 * @param tableName - The name of the table to create or import into
 * @param fullPath - The full file path to the CSV file to import
 * @param nullStr - The string value(s) to treat as NULL in the CSV
 * @param dropTable - If true, drops the table if it exists before creating it. Defaults to false
 * @returns An Effect that completes when the CSV has been successfully imported, or fails with a WorkspaceImportError
 * @throws WorkspaceImportError - If the table creation or CSV import fails
 */
export function WorkspaceImportCSV(
  connection: DuckDBConnection,
  tableName: string,
  fullPath: string,
  nullStr: string,
  dropTable: boolean = false,
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.gen(function* (_) {
    yield* _(Effect.tryPromise({
      try: async () => {
        const sequenceName = `${tableName}_seq`;

        if (dropTable) {
          connection.run(`DROP TABLE IF EXISTS ${tableName}`);
          connection.run(`DROP SEQUENCE IF EXISTS ${sequenceName}`);
        }

        // Create sequence for deterministic row numbering
        await connection.run(
          `CREATE SEQUENCE IF NOT EXISTS ${sequenceName} START 1`,
        );

        await connection.run(
          `CREATE TABLE IF NOT EXISTS ${tableName} AS
           SELECT *, nextval('${sequenceName}') as _row_number
           FROM read_csv_auto('${fullPath}', nullstr=[${nullStr}])`,
        );
      },
      catch: (error) => {
        console.error(error);
        return new WorkspaceImportError({
          message: `Failed to create table '${tableName}' from CSV ${fullPath}`,
          cause: error instanceof Error ? error : new Error(String(error)),
        });
      },
    }));
  });
}

/**
 * Minimal dataset interface for schema import
 * Works with both validation and transform dataset configs
 */
type DatasetWithProfile = {
  readonly name: string;
  readonly profile?: string;
  readonly spec?: string;
};

/**
 * Generates and applies a database schema for a dataset based on its validation profile.
 *
 * This function:
 * - Loads a validation profile for `dataset` using `getValidationProfile(dataset.profile)`.
 *   If no profile is found the function logs a warning and returns early (no DB changes).
 * - Derives a table name from the profile's `name` (lowercased).
 * - Creates ENUM types for any profile fields declared as controlled vocabularies
 *   (profile field shape: `type === "controlled-vocabulary"` and having `values`).
 *   - Enum type name format: `${tableName}_${fieldName}_enum`
 *   - Enum members are derived from the keys of `field.values` and are quoted.
 *   - ENUMs are created with `CREATE TYPE IF NOT EXISTS ... AS ENUM (...)`.
 * - Builds a CREATE TABLE statement for the table:
 *   - Column SQL type mapping:
 *     - `IDENTIFIER` -> `TEXT`
 *     - `CONTROLLED-VOCABULARY` -> `${tableName}_${fieldName}_enum`
 *     - `URI` -> `TEXT`
 *     - default -> `TEXT`
 *   - Column names are quoted (`"fieldName"`).
 *   - A column is marked PRIMARY KEY when either:
 *     - its name equals `${tableName}ID`, or
 *     - it ends with `ID` and the profile field has `unique === "true"`.
 *   - A column is marked NOT NULL if `spec.fieldOverrides?.[fieldName]?.requirement === "required"`.
 *   - Foreign key constraints:
 *     - For any column ending with `ID` that is not treated as the table's primary key,
 *       the code attempts to add `REFERENCES referencedTable(fieldName)` where
 *       `referencedTable` = `fieldName.slice(0, -2).toLowerCase()` — only if a dataset
 *       with that validation profile name exists in the provided `datasets` array.
 * - Executes DDL against the given `connection` using Effect-wrapped promises:
 *   - ENUM creation and table creation are executed via `connection.run(...)`
 *     wrapped in `Effect.tryPromise`.
 *   - SQL uses `IF NOT EXISTS` so repeated runs are safe (idempotent in typical cases).
 * - Error handling:
 *   - Database execution failures are converted into `WorkspaceImportError` values
 *     with the original error attached as `cause`.
 *   - The returned Effect fails with that `WorkspaceImportError` on DB errors.
 *
 * Side effects:
 * - Mutates the target database by creating types and tables.
 * - Logs a warning (console.warn) if the dataset has no validation profile.
 * - Logs the failing SQL to console.error if table creation fails.
 *
 * Parameters:
 * - connection: DuckDBConnection used to execute DDL statements.
 * - dataset: Dataset config with name and profile/spec (works with both validation and transform configs).
 * - datasets: readonly array of datasets used to resolve referenced tables for foreign keys.
 *
 * Returns:
 * - Effect.Effect<void, WorkspaceImportError> — an Effect which completes successfully
 *   when DDL statements have been applied, or fails with WorkspaceImportError on error.
 *
 * Notes / caveats:
 * - The function assumes profile field shapes and keys (e.g., `type`, `values`, `unique`,
 *   and `fieldOverrides`) conform to the expected validation profile format.
 * - ENUM member values are taken directly from the keys of `field.values` and quoted
 *   without additional escaping; if enum keys contain characters that require escaping
 *   for the SQL dialect in use, that may need additional handling.
 */

export function WorkspaceImportSchema(
  connection: DuckDBConnection,
  dataset: DatasetWithProfile,
  datasets: readonly DatasetWithProfile[],
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.gen(function* (_) {
    // Load validation profile - use profile if specified, otherwise derive from spec
    let profileId = dataset.profile;
    if (!profileId && dataset.spec) {
      const parsed = parseSpecIdentifier(dataset.spec);
      if (parsed) {
        profileId = parsed.type.charAt(0).toUpperCase() + parsed.type.slice(1);
      }
    }

    if (!profileId) {
      console.warn(
        `No profile or spec specified for dataset ${dataset.name}, skipping table creation.`,
      );
      return;
    }

    const spec = getValidationProfile(profileId);
    if (!spec) {
      console.warn(
        `No validation profile found for ${profileId}, skipping table creation.`,
      );
      return;
    }
    // Convert profile name to valid SQL table name using sanitizeTableName
    const tableName = sanitizeTableName(spec.name).toLowerCase();

    // 1. Create ENUM types for controlled vocabularies
    const enums = Object.entries(spec.fields || {}).map(
      ([fieldName, field]) => {
        // Check if this is a controlled vocabulary field
        // Profile fields use `type === "controlled-vocabulary"` and may have `values`
        if (field.type === "controlled-vocabulary" && field.values) {
          const enumName = `${tableName}_${fieldName.toLowerCase()}_enum`;
          const enumValues = Object.keys(field.values).map((v: string) => `'${v}'`).join(", ");
          return `CREATE TYPE IF NOT EXISTS ${enumName} AS ENUM (${enumValues});`;
        }
        return null;
      },
    );

    // 2. Generate Column Definition SQL
    const columns = Object.keys(spec.fields || {}).map((fieldName) => {
      const field = spec.fields![fieldName];
      const fieldType = (field.type?.toUpperCase() || "TEXT")
        .replace("IDENTIFIER", "TEXT")
        .replace(
          "CONTROLLED-VOCABULARY",
          `${tableName}_${fieldName.toLowerCase()}_enum`,
        )
        .replace("URI", "TEXT");
      let fieldStr = `"${fieldName}" ${fieldType}`;
      // Check if this field is the primary identifier for this table
      // Profile fields use simple name matching (e.g., occurrenceID for Occurrence table)
      // or check if field is marked as unique identifier
      const isUniqueIdentifier = field.unique === "true";

      if (
        fieldName === tableName + "ID" ||
        (fieldName.endsWith("ID") && isUniqueIdentifier)
      ) {
        fieldStr += " PRIMARY KEY";
      } else if (
        spec.fieldOverrides?.[fieldName]?.requirement === "required"
      ) {
        // Only apply NOT NULL if this specific profile marks the field as required
        fieldStr += " NOT NULL";
      }
      // add foreign key constraints for fields
      // Skip FK for this table's PK, but include it for other ID fields
      const isPrimaryKey = fieldName === tableName + "ID" ||
        (fieldName.endsWith("ID") && isUniqueIdentifier);
      if (fieldName.endsWith("ID") && !isPrimaryKey) {
        const referencedTable = fieldName.slice(0, -2).toLowerCase();
        // check if referenced table exists in config
        if (
          datasets.find((ds) => {
            const profileName = ds.profile ||
              (ds.spec
                ? parseSpecIdentifier(ds.spec)?.type.charAt(0).toUpperCase() +
                  ds.spec.slice(ds.spec.indexOf("-") + 1)
                : undefined);
            return profileName &&
              getValidationProfile(profileName)?.name.toLowerCase() ===
                referencedTable;
          })
        ) {
          fieldStr += ` REFERENCES ${referencedTable}(${fieldName})`;
        }
      }
      return fieldStr;
    });

    // Add _row_number column to track original CSV row numbers
    columns.push("_row_number INTEGER");

    // 3. Create ENUM Types
    const enumSql = enums.filter((e) => e !== null).join("\n");
    if (enumSql) {
      yield* _(Effect.tryPromise({
        try: () => connection.run(enumSql),
        catch: (error) =>
          new WorkspaceImportError({
            message: `Failed to create ENUM types for table '${tableName}'`,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }));
    }

    // 4. Create Tables
    // Drop table first to ensure clean state (handles cross-test contamination)
    yield* _(Effect.tryPromise({
      try: () => connection.run(`DROP TABLE IF EXISTS ${tableName}`),
      catch: (error) =>
        new WorkspaceImportError({
          message: `Failed to drop table '${tableName}'`,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    }));

    const tableSql = `CREATE TABLE ${tableName} (${columns.join(", ")})`;
    yield* _(Effect.tryPromise({
      try: () => connection.run(tableSql),
      catch: (error) => {
        console.error(error);
        console.error(`Failing SQL: ${tableSql}`);
        return new WorkspaceImportError({
          message: `Failed to create table '${tableName}'`,
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

      // Load workspace using WorkspaceService
      // Note: This requires ValidationService but we don't use it here
      // We only use the config loading, not the validation
      const workspace = yield* _(
        Effect.gen(function* (_) {
          const service = yield* _(WorkspaceService);
          return yield* _(service.loadFromDirectory(configPath));
        }).pipe(
          Effect.provide(WorkspaceService.layer),
          // Provide a no-op ValidationService since we don't use it
          Effect.provide(
            Layer.succeed(
              ValidationService,
              ValidationService.of({
                validateDatasets: () =>
                  Effect.die("ValidationService should not be called during config loading"),
              }),
            ),
          ),
          Effect.mapError((error) => {
            return new WorkspaceValidationError({
              message: `Failed to load workspace config: ${error.message}`,
              cause: error instanceof Error ? error : new Error(String(error)),
            });
          }),
        ),
      );

      const loadedConfig = workspace.config;
      const resolvedConfigPath = workspace.configPath;

      // Narrow the config type to ensure it has validation settings and datasets
      if (!("validation" in loadedConfig)) {
        return yield* _(
          Effect.fail(
            new WorkspaceValidationError({
              message: `Configuration '${resolvedConfigPath}' does not contain validation settings`,
            }),
          ),
        );
      }

      if (!("datasets" in loadedConfig.validation)) {
        return yield* _(
          Effect.fail(
            new WorkspaceValidationError({
              message: `Configuration '${resolvedConfigPath}' does not contain datasets`,
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

      // Get datasets from root level
      const datasets = "datasets" in validationSettings && validationSettings.datasets
        ? validationSettings.datasets
        : [];

      // Create workspace and load all datasets
      const { workspaceId, connection, instance } = yield* _(
        createWorkspaceFromConfig(
          config.id,
          datasets,
          validationSettings,
          dirname(resolvedConfigPath),
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
                // Capitalize the type to match profile names (e.g., "event" -> "Event")
                const derivedProfileId = parsed.type.charAt(0).toUpperCase() +
                  parsed.type.slice(1);
                datasetProfile = getValidationProfile(derivedProfileId);
              }
            }

            const result = yield* _(
              validateDataset(
                connection,
                dataset,
                datasetProfile,
                validationSettings,
              ),
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
      // prepend'raw_' to table name becouse dataset.name and spec/profile can not be the same name otherwise the tables conflict
      const tableName = `raw_${sanitizeTableName(dataset.name)}`;

      // Build null values string for DuckDB
      const nullStr = validationSettings.nullValues.map((v: string) => `'${v}'`)
        .join(", ");
      const dropTable = true;
      yield* _(
        WorkspaceImportCSV(connection, tableName, filePath, nullStr, dropTable),
      );
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
        catch: (error) => {
          console.error(error);
          return new WorkspaceValidationError({
            message: `Failed to Describe table: ${error}`,
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
    // otherwise use dataset.profile, or derive from spec
    let profileName: string | undefined;
    if (profile) {
      // Use the profile's name property (e.g., "OBIS Event Core")
      // This must match what WorkspaceImportSchema uses to create the table
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
            cause: Error(
              String("Dataset mapped field missing from source database table"),
            ),
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
      console.log(
        `Bulk INSERT failed for dataset '${dataset.name}' - falling back to row-by-row insertion to collect detailed violations`,
      );
      if (error instanceof Error) {
        console.log(`Bulk INSERT error: ${error.message}`);
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
      console.log(
        `Bulk INSERT succeeded for dataset '${dataset.name}' - no constraint violations`,
      );
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
 * Resolve dataset name to its schema table name
 *
 * Schema tables are named after profiles, not dataset names.
 * For example, dataset "occurrences" with spec "dwc-occurrence" → table "occurrence"
 */
function resolveSchemaTableName(
  datasetName: string,
  datasets: readonly DatasetConfig[],
): string {
  const dataset = datasets.find((ds) => ds.name === datasetName);
  if (!dataset) {
    // Fallback to sanitized dataset name if not found
    return sanitizeTableName(datasetName).toLowerCase();
  }

  // Derive profile name - same logic as in validateDataset
  let profileName = dataset.profile;
  if (!profileName && dataset.spec) {
    const parsed = parseSpecIdentifier(dataset.spec);
    if (parsed) {
      profileName = parsed.type.charAt(0).toUpperCase() + parsed.type.slice(1);
    }
  }

  return profileName
    ? sanitizeTableName(profileName).toLowerCase()
    : sanitizeTableName(dataset.name).toLowerCase();
}

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

    // Get fully-formed violations
    const crossDatasetViolations = yield* _(
      findCrossDatasetViolations(
        connection,
        { ...rule, enforcement },
        datasets,
      ),
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

    const query = `
      SELECT
        _row_number,
        "${fieldName}" as value
      FROM ${tableName}
      WHERE "${fieldName}" IS NOT NULL
        AND (${rangeCondition})
      LIMIT 100
    `;

    // SQL query execution should work - query failure is a defect
    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(
        Effect.orDie,
      ),
    );

    const rows = result.getRowObjects();

    // Return fully-formed RangeViolation objects
    return rows.map((row) =>
      new RangeViolation({
        enforcement: validator.enforcement,
        severity: enforcementToSeverity(validator.enforcement),
        fieldName,
        targetName: specField.name,
        rowNumber: Number(row._row_number),
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
    // TODO: Add parsing here; we need to ensure the range validator is valid before trying to apply it
    // Also ensures type sagety within the loop below
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
        findRangeViolations(
          connection,
          tableName,
          fieldName,
          normalizedValidator,
          specField,
        ),
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
    // Get distinct values from the field with ordered row numbers
    const query = `
      SELECT
        "${fieldName}" as value,
        list(_row_number ORDER BY _row_number) as row_numbers
      FROM ${tableName}
      WHERE "${fieldName}" IS NOT NULL
      GROUP BY "${fieldName}"
    `;

    // SQL query execution should work - query failure is a defect
    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(
        Effect.orDie,
      ),
    );

    const rows = result.getRowObjects();
    const violations: VocabularyViolation[] = [];

    for (const row of rows) {
      const value = String(row.value);
      const rawRowNumbers = row.row_numbers;

      let rowNumbers: number[] = [];
      if (Array.isArray(rawRowNumbers)) {
        rowNumbers = rawRowNumbers.map((n) => Number(n));
      } else if (
        rawRowNumbers && typeof rawRowNumbers === "object" &&
        "items" in rawRowNumbers
      ) {
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
    legacy: Array<
      { rowNumber: number; value: string; suggestedValues?: string[] }
    >;
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
    // Query to find duplicate values with ordered row numbers
    const query = `
      SELECT
        "${fieldName}" as duplicate_value,
        COUNT(*) as occurrence_count,
        list(_row_number ORDER BY _row_number) as affected_rows
      FROM ${tableName}
      WHERE "${fieldName}" IS NOT NULL
      GROUP BY "${fieldName}"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 100
    `;

    // SQL query execution should work - query failure is a defect
    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(
        Effect.orDie,
      ),
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
      findUniquenessViolations(
        connection,
        tableName,
        fieldName,
        specField,
        enforcement,
      ),
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

    const legacy = Array.from(duplicateGroups.entries()).map((
      [value, group],
    ) => ({
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

/**
 * Parse DuckDB error into structured violation information
 */
interface ParsedErrorInfo {
  readonly type:
    | "primary-key"
    | "not-null"
    | "enum"
    | "foreign-key"
    | "check"
    | "unknown";
  readonly fieldName?: string;
  readonly value?: string;
  readonly message: string;
}

function parseDuckDBError(error: Error): ParsedErrorInfo {
  const message = error.message;

  // PRIMARY KEY or UNIQUE constraint violation
  // Example 1: "Constraint Error: PRIMARY KEY or UNIQUE constraint violation: duplicate key "E1""
  // Example 2: "Constraint Error: Duplicate key "eventID: E1" violates primary key constraint."
  let pkMatch = message.match(
    /PRIMARY KEY or UNIQUE constraint violation: duplicate key "([^"]+)"/,
  );
  if (pkMatch) {
    return {
      type: "primary-key",
      value: pkMatch[1],
      message,
    };
  }

  // Alternative format for duplicate keys
  pkMatch = message.match(
    /Duplicate key "(?:\w+:\s*)?([^"]+)" violates primary key constraint/,
  );
  if (pkMatch) {
    return {
      type: "primary-key",
      value: pkMatch[1],
      message,
    };
  }

  // NOT NULL constraint violation
  // Example: "Constraint Error: NOT NULL constraint failed: column_name"
  const notNullMatch = message.match(/NOT NULL constraint failed:?\s*(.+)?/i);
  if (notNullMatch) {
    return {
      type: "not-null",
      fieldName: notNullMatch[1]?.trim(),
      message,
    };
  }

  // ENUM/Type conversion error
  // Example: "Conversion Error: Could not convert string 'InvalidBasis' to UINT8 when casting from source column basisOfRecord"
  const enumMatch = message.match(
    /Could not convert string '([^']+)'.+from source column (\w+)/,
  );
  if (enumMatch) {
    return {
      type: "enum",
      value: enumMatch[1],
      fieldName: enumMatch[2],
      message,
    };
  }

  // FOREIGN KEY constraint violation
  const fkMatch = message.match(/FOREIGN KEY constraint/i);
  if (fkMatch) {
    return {
      type: "foreign-key",
      message,
    };
  }

  // CHECK constraint violation
  const checkMatch = message.match(/CHECK constraint/i);
  if (checkMatch) {
    return {
      type: "check",
      message,
    };
  }

  return {
    type: "unknown",
    message,
  };
}

/**
 * Get original CSV value for a specific row and field
 */
function getOriginalCsvValue(
  connection: DuckDBConnection,
  rawTableName: string,
  fieldName: string,
  rowNumber: number,
): Effect.Effect<string, WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    const query = `
      SELECT "${fieldName}" as value
      FROM ${rawTableName}
      WHERE _row_number = ${rowNumber}
    `;

    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(
        Effect.orDie,
      ),
    );

    const rows = result.getRowObjects();
    if (rows.length === 0) {
      return "";
    }

    return String(rows[0].value ?? "");
  });
}

/**
 * Find suggested value using fuzzy matching (Levenshtein distance)
 */
function findSuggestedValue(
  invalidValue: string,
  allowedValues: ReadonlyArray<string>,
  threshold: number = 3,
): string | undefined {
  let bestMatch: string | undefined;
  let bestDistance = threshold;

  for (const allowed of allowedValues) {
    const distance = levenshteinDistance(invalidValue, allowed);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = allowed;
    }
  }

  return bestMatch;
}

/**
 * Insert rows one-by-one, collecting violations for any that fail
 */
function insertRowByRow(
  connection: DuckDBConnection,
  rawTableName: string,
  schemaTableName: string,
  columnMappings: { origin: string; target: string }[],
  profile: ValidationProfile,
  validationSettings?: ValidationSettings,
): Effect.Effect<ValidationViolation[], WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    const violations: ValidationViolation[] = [];
    const enableSuggestions = validationSettings?.enableSuggestions ?? true;
    const processedDuplicates = new Set<string>(); // Track duplicate PKs we've already processed

    // Get maximum _row_number to determine iteration range
    const maxRowResult = yield* _(
      Effect.tryPromise(() =>
        connection.runAndReadAll(
          `SELECT MAX(_row_number) as max_row FROM ${rawTableName}`,
        )
      ).pipe(Effect.orDie),
    );
    const maxRow = Number(maxRowResult.getRowObjects()[0]?.max_row ?? 0);

    // Build column lists for INSERT
    const targetColumns = columnMappings.map((m) => `"${m.target}"`).join(", ");
    const originColumns = columnMappings.map((m) => `"${m.origin}"`).join(", ");

    // Insert each row individually by _row_number
    for (let rowNum = 1; rowNum <= maxRow; rowNum++) {
      const insertSQL = `
        INSERT INTO ${schemaTableName} (${targetColumns}, _row_number)
        SELECT ${originColumns}, _row_number
        FROM ${rawTableName}
        WHERE _row_number = ${rowNum}
      `;

      const result = yield* _(
        Effect.tryPromise({
          try: () => connection.run(insertSQL),
          catch: (error) => error,
        }).pipe(Effect.either),
      );

      if (result._tag === "Left") {
        const error = result.left;
        if (!(error instanceof Error)) continue;

        // Parse the error to determine violation type
        const parsed = parseDuckDBError(error);

        // Create structured violation based on error type
        switch (parsed.type) {
          case "primary-key": {
            // Find the PK field from mappings
            const pkMapping = columnMappings.find((m) =>
              m.target === schemaTableName + "ID" ||
              (m.target.endsWith("ID") &&
                profile.fields?.[m.target]?.unique === "true")
            );

            if (
              pkMapping && parsed.value &&
              !processedDuplicates.has(parsed.value)
            ) {
              const specField = profile.normalizedFields?.[pkMapping.target];
              if (!specField) break;

              // Mark this duplicate value as processed
              processedDuplicates.add(parsed.value);

              // Query the raw table to find ALL rows with this duplicate value
              // This gives us complete information about all instances of the duplicate
              const duplicateQuery = `
                SELECT _row_number
                FROM ${rawTableName}
                WHERE "${pkMapping.origin}" = '${parsed.value}'
              `;

              const duplicateResult = yield* _(
                Effect.tryPromise(() => connection.runAndReadAll(duplicateQuery)).pipe(
                  Effect.orDie,
                ),
              );

              const duplicateRows = duplicateResult.getRowObjects();
              const duplicateCount = duplicateRows.length;

              // Create a violation for each row that has the duplicate value
              for (const dupRow of duplicateRows) {
                const dupRowNum = Number(dupRow._row_number);
                const csvValue = yield* _(
                  getOriginalCsvValue(
                    connection,
                    rawTableName,
                    pkMapping.origin,
                    dupRowNum,
                  ),
                );

                violations.push(
                  new PrimaryKeyViolation({
                    enforcement: "required",
                    severity: enforcementToSeverity("required"),
                    fieldName: pkMapping.origin,
                    targetName: pkMapping.target,
                    rowNumber: dupRowNum,
                    value: parsed.value,
                    csvValue,
                    constraintType: "duplicate",
                    duplicateCount,
                    errorMessage: `Duplicate primary key: "${parsed.value}"`,
                    validatorType: "primary-key",
                  }),
                );
              }
            }
            break;
          }

          case "not-null": {
            // Find the field that caused the NOT NULL violation
            const notNullMapping = columnMappings.find((m) =>
              parsed.fieldName ? m.target === parsed.fieldName : false
            );

            if (notNullMapping) {
              const specField = profile.normalizedFields
                ?.[notNullMapping.target];
              if (!specField) break;

              violations.push(
                new NotNullViolation({
                  enforcement: "required",
                  severity: enforcementToSeverity("required"),
                  fieldName: notNullMapping.origin,
                  targetName: notNullMapping.target,
                  rowNumber: rowNum,
                  value: "",
                  csvValue: "",
                  errorMessage: `Required field "${notNullMapping.origin}" cannot be NULL`,
                  validatorType: "not-null",
                }),
              );
            }
            break;
          }

          case "enum": {
            // Find the field that caused the ENUM violation
            const enumMapping = columnMappings.find((m) =>
              m.origin === parsed.fieldName || m.target === parsed.fieldName
            );

            if (enumMapping && parsed.value) {
              const specField = profile.normalizedFields?.[enumMapping.target];
              const rawField = profile.fields?.[enumMapping.target];

              if (!specField || !rawField?.values) break;

              const allowedValues = Object.keys(rawField.values);
              const suggestedValue = enableSuggestions
                ? findSuggestedValue(parsed.value, allowedValues)
                : undefined;

              const vocabValidator = specField.validators?.find((v) =>
                v.type === "unique" || v.type === "required"
              );
              const enforcement = vocabValidator?.enforcement ?? "required";

              violations.push(
                new EnumViolation({
                  enforcement,
                  severity: enforcementToSeverity(enforcement),
                  fieldName: enumMapping.origin,
                  targetName: enumMapping.target,
                  rowNumber: rowNum,
                  value: parsed.value,
                  csvValue: parsed.value,
                  enumType: `${schemaTableName}_${enumMapping.target.toLowerCase()}_enum`,
                  allowedValues,
                  suggestedValue,
                  errorMessage: suggestedValue
                    ? `Invalid value "${parsed.value}" (did you mean "${suggestedValue}"?)`
                    : `Invalid value "${parsed.value}" (must be one of: ${
                      allowedValues.join(", ")
                    })`,
                  validatorType: "enum",
                }),
              );
            }
            break;
          }

          case "foreign-key": {
            // For FK violations, we need more context - log for now
            console.warn(
              `Foreign key violation at row ${rowNum}: ${parsed.message}`,
            );
            break;
          }

          default: {
            // Unknown error type - log it
            console.warn(
              `Unknown constraint violation at row ${rowNum}: ${parsed.message}`,
            );
            break;
          }
        }
      }
    }

    return violations;
  });
}

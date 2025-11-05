/**
 * Configurable CSV Parser with DuckDB Type Conversion Validation
 *
 * Extends the existing CSV parser to support user-configured type conversion
 * and null handling. Stores data persistently in workspace DuckDB files
 * and validates type conversions according to user expectations.
 */

import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import { join } from "@std/path";
import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBConnection as DuckDB } from "@duckdb/node-api";

import type { DatasetSchema, FieldSchema, PrimitiveType } from "@dwkt/domain";
import { ErrorCode } from "@dwkt/domain";
import { ParseError, type ParseOptions } from "./csv-parser.ts";
import type { DuckDBType, WorkspaceConfig } from "../workspace/config-service.ts";

// Enhanced parse result with type conversion validation
export class ConfigurableParseResult extends Data.Class<{
  readonly schema: DatasetSchema;
  readonly samples: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly parseMetadata: ConfigurableParseMetadata;
  readonly typeConversionResults: ReadonlyMap<string, TypeConversionResult>;
  readonly duckdbPath: string; // Path to persistent DuckDB file
  readonly tableName: string;
}> {}

// Parse metadata with configuration tracking
export class ConfigurableParseMetadata extends Data.Class<{
  readonly parseTimeMs: number;
  readonly fileFormat: "csv";
  readonly configurationUsed: WorkspaceConfig;
  readonly conversionFailures: number;
}> {}

// Type conversion validation result
export interface TypeConversionResult {
  readonly fieldName: string;
  readonly expectedType: DuckDBType;
  readonly successfulConversions: number;
  readonly failedConversions: number;
  readonly failureDetails: ReadonlyArray<ConversionFailure>;
}

// Individual conversion failure
export interface ConversionFailure {
  readonly rowNumber: number;
  readonly originalValue: string;
  readonly errorMessage: string;
}

// Error class for configuration-driven parsing
export class ConfigurationParseError extends ParseError {
  readonly fieldName?: string;
  readonly conversionFailures?: ReadonlyArray<ConversionFailure>;

  constructor(props: {
    message: string;
    filePath: string;
    code: ErrorCode;
    cause?: Error;
    fieldName?: string;
    conversionFailures?: ReadonlyArray<ConversionFailure>;
  }) {
    super({
      message: props.message,
      filePath: props.filePath,
      code: props.code,
      cause: props.cause,
    });
    this.fieldName = props.fieldName;
    this.conversionFailures = props.conversionFailures;
  }
}

/**
 * Parse CSV file with user configuration for type conversion and null handling
 */
export function parseFileWithConfiguration(
  filePath: string,
  workspaceDir: string,
  config: WorkspaceConfig,
  options: ParseOptions = {},
): Effect.Effect<ConfigurableParseResult, ParseError | ConfigurationParseError> {
  const startTime = Date.now();

  return Effect.acquireUseRelease(
    // Acquire: Create DuckDB connection - failure is a system defect
    Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
    // Use: Perform all database operations with the connection
    (connection) =>
      Effect.gen(function* (_) {
        // Set up persistent DuckDB file in workspace
        const duckdbPath = join(workspaceDir, "data.duckdb");
        const tableName = "workspace_data";

        // Build null handling configuration
        const nullStr = buildNullStrParameter(config);

        // Initial CSV read with configured null handling
        const createTableQuery = `
          CREATE OR REPLACE TABLE ${tableName} AS
          SELECT * FROM read_csv_auto('${filePath}', nullstr=${nullStr})
        `;

        yield* _(
          Effect.tryPromise({
            try: () => connection.runAndReadAll(createTableQuery),
            catch: (error) =>
              new ParseError({
                message: `Failed to read CSV file: ${error}`,
                filePath,
                code: ErrorCode.PARSE_ERROR,
                cause: error instanceof Error ? error : new Error(String(error)),
              }),
          }),
        );

        // Get schema information
        const schemaResult = yield* _(getTableSchema(connection, tableName));
        const rowCount = yield* _(getRowCount(connection, tableName));

        // Validate type conversions according to user configuration
        const typeConversionResults = yield* _(
          validateTypeConversions(connection, tableName, config),
        );

        // Check for any conversion failures
        const totalFailures = Array.from(typeConversionResults.values()).reduce(
          (sum, result) => sum + result.failedConversions,
          0,
        );

        if (totalFailures > 0) {
          const failureMessages = Array.from(typeConversionResults.values())
            .filter((result) => result.failedConversions > 0)
            .map((result) => `${result.fieldName}: ${result.failedConversions} failures`);

          return yield* _(
            Effect.fail(
              new ConfigurationParseError({
                message: `Type conversion failures detected: ${failureMessages.join(", ")}`,
                filePath,
                code: ErrorCode.PARSE_ERROR,
              }),
            ),
          );
        }

        // Apply type conversions to create final typed table
        yield* _(applyTypeConversions(connection, tableName, config));

        // Collect samples and build final schema
        const { schema, samples } = yield* _(
          buildSchemaAndSamples(connection, tableName, schemaResult, options.sampleSize || 5),
        );

        // Save to persistent DuckDB file - this is infrastructure and should always work (defect if it fails)
        yield* _(
          Effect.tryPromise(() => connection.runAndReadAll(`EXPORT DATABASE '${duckdbPath}'`)).pipe(
            Effect.orDie,
          ),
        );

        const parseTime = Date.now() - startTime;

        return new ConfigurableParseResult({
          schema: {
            fields: schema,
            rowCount,
            tableName,
            inferredAt: new Date(),
          },
          samples,
          parseMetadata: new ConfigurableParseMetadata({
            parseTimeMs: parseTime,
            fileFormat: "csv",
            configurationUsed: config,
            conversionFailures: totalFailures,
          }),
          typeConversionResults,
          duckdbPath,
          tableName,
        });
      }),
    // Release: Close connection (ignores any errors during cleanup)
    (connection) => Effect.try(() => connection.closeSync()).pipe(Effect.ignore),
  );
}

/**
 * Get table schema information from DuckDB
 */
function getTableSchema(
  connection: DuckDBConnection,
  tableName: string,
): Effect.Effect<Array<{ name: string; type: string; nullable: boolean }>, ParseError> {
  const schemaQuery = `
    SELECT
      column_name as name,
      data_type as type,
      is_nullable = 'YES' as nullable
    FROM information_schema.columns
    WHERE table_name = '${tableName}'
    ORDER BY ordinal_position
  `;

  // Querying information_schema is infrastructure - should always work (defect if it fails)
  return Effect.tryPromise(async () => {
    const result = await connection.runAndReadAll(schemaQuery);
    return result.getRowObjects() as Array<{ name: string; type: string; nullable: boolean }>;
  }).pipe(Effect.orDie);
}

/**
 * Get row count from table
 */
function getRowCount(
  connection: DuckDBConnection,
  tableName: string,
): Effect.Effect<number, never> {
  // COUNT(*) query is infrastructure - should always work (defect if it fails)
  return Effect.tryPromise(async () => {
    const result = await connection.runAndReadAll(`SELECT COUNT(*) as count FROM ${tableName}`);
    const rawCount = result.getRowObjects()[0].count;
    return typeof rawCount === "bigint" ? Number(rawCount) : (rawCount as number);
  }).pipe(Effect.orDie);
}

/**
 * Validate type conversions according to user configuration
 */
function validateTypeConversions(
  connection: DuckDBConnection,
  tableName: string,
  config: WorkspaceConfig,
): Effect.Effect<ReadonlyMap<string, TypeConversionResult>, ConfigurationParseError> {
  return Effect.gen(function* (_) {
    const results = new Map<string, TypeConversionResult>();

    for (const [fieldName, fieldConfig] of Object.entries(config.fields)) {
      const conversionResult = yield* _(
        validateFieldTypeConversion(
          connection,
          tableName,
          fieldName,
          fieldConfig.expectedType,
        ),
      );

      results.set(fieldName, conversionResult);
    }

    return results;
  });
}

/**
 * Validate individual field type conversion
 */
function validateFieldTypeConversion(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  expectedType: DuckDBType,
): Effect.Effect<TypeConversionResult, ConfigurationParseError> {
  return Effect.gen(function* (_) {
    // Check if field exists
    const fieldExistsQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = '${tableName}' AND column_name = '${fieldName}'
    `;

    // Querying information_schema is infrastructure - should always work (defect if it fails)
    const fieldExists = yield* _(
      Effect.tryPromise(async () => {
        const result = await connection.runAndReadAll(fieldExistsQuery);
        return result.getRowObjects().length > 0;
      }).pipe(Effect.orDie),
    );

    if (!fieldExists) {
      return {
        fieldName,
        expectedType,
        successfulConversions: 0,
        failedConversions: 0,
        failureDetails: [],
      };
    }

    // Find conversion failures using TRY_CAST
    const failuresQuery = `
      SELECT
        row_number() OVER() as row_num,
        "${fieldName}" as original_value
      FROM ${tableName}
      WHERE "${fieldName}" IS NOT NULL
        AND TRY_CAST("${fieldName}" AS ${expectedType}) IS NULL
    `;

    // SQL query execution should work - query failure is a defect
    const failures = yield* _(
      Effect.tryPromise(async () => {
        const result = await connection.runAndReadAll(failuresQuery);
        return result.getRowObjects() as Array<{ row_num: number; original_value: unknown }>;
      }).pipe(Effect.orDie),
    );

    // Count successful conversions
    const successQuery = `
      SELECT COUNT(*) as success_count
      FROM ${tableName}
      WHERE "${fieldName}" IS NOT NULL
        AND TRY_CAST("${fieldName}" AS ${expectedType}) IS NOT NULL
    `;

    // SQL query execution should work - query failure is a defect
    const successCount = yield* _(
      Effect.tryPromise(async () => {
        const result = await connection.runAndReadAll(successQuery);
        const rawCount = result.getRowObjects()[0].success_count;
        return typeof rawCount === "bigint" ? Number(rawCount) : (rawCount as number);
      }).pipe(Effect.orDie),
    );

    const failureDetails: ConversionFailure[] = failures.map((failure) => ({
      rowNumber: failure.row_num,
      originalValue: String(failure.original_value),
      errorMessage: `Cannot convert '${failure.original_value}' to ${expectedType}`,
    }));

    return {
      fieldName,
      expectedType,
      successfulConversions: successCount,
      failedConversions: failures.length,
      failureDetails,
    };
  });
}

/**
 * Apply type conversions to create final typed table
 */
function applyTypeConversions(
  connection: DuckDBConnection,
  tableName: string,
  config: WorkspaceConfig,
): Effect.Effect<void, ParseError> {
  return Effect.gen(function* (_) {
    // Build column conversion clauses
    const conversionClauses: string[] = [];

    for (const [fieldName, fieldConfig] of Object.entries(config.fields)) {
      conversionClauses.push(
        `CAST("${fieldName}" AS ${fieldConfig.expectedType}) AS "${fieldName}"`,
      );
    }

    if (conversionClauses.length === 0) {
      return; // No conversions to apply
    }

    // Create new table with converted types
    const convertQuery = `
      CREATE OR REPLACE TABLE ${tableName}_typed AS
      SELECT
        ${conversionClauses.join(", ")},
        * EXCLUDE (${Object.keys(config.fields).map((name) => `"${name}"`).join(", ")})
      FROM ${tableName}
    `;

    // SQL DDL operations should always work - query failure is a defect
    yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(convertQuery)).pipe(Effect.orDie),
    );

    // Replace original table with typed version - SQL DDL should always work (defect if it fails)
    yield* _(
      Effect.tryPromise(() =>
        connection.runAndReadAll(`ALTER TABLE ${tableName}_typed RENAME TO ${tableName}`)
      ).pipe(Effect.orDie),
    );
  });
}

/**
 * Build final schema and samples from typed table
 */
function buildSchemaAndSamples(
  connection: DuckDBConnection,
  tableName: string,
  schemaInfo: Array<{ name: string; type: string; nullable: boolean }>,
  sampleSize: number,
): Effect.Effect<
  { schema: ReadonlyMap<string, FieldSchema>; samples: ReadonlyMap<string, ReadonlyArray<string>> },
  ParseError
> {
  return Effect.gen(function* (_) {
    const schema = new Map<string, FieldSchema>();
    const samples = new Map<string, ReadonlyArray<string>>();

    for (const column of schemaInfo) {
      // Get sample values
      const sampleQuery = `
        SELECT DISTINCT "${column.name}" as value
        FROM ${tableName}
        WHERE "${column.name}" IS NOT NULL
        LIMIT ${sampleSize}
      `;

      // SQL query execution should work - query failure is a defect
      const sampleResult = yield* _(
        Effect.tryPromise(() => connection.runAndReadAll(sampleQuery)).pipe(Effect.orDie),
      );

      const sampleValues = sampleResult.getRowObjects().map((row) => String(row.value)).filter(
        Boolean,
      );

      const fieldSchema: FieldSchema = {
        name: column.name,
        inferredType: column.type,
        primitiveType: mapDuckDBToPrimitive(column.type),
        isNullable: column.nullable,
        sampleValues,
      };

      schema.set(column.name, fieldSchema);
      samples.set(column.name, sampleValues);
    }

    return { schema, samples };
  });
}

/**
 * Map DuckDB type to primitive type
 */
function mapDuckDBToPrimitive(duckdbType: string): PrimitiveType {
  const upperType = duckdbType.toUpperCase();

  if (upperType.includes("VARCHAR") || upperType.includes("TEXT")) {
    return "string";
  } else if (
    upperType.includes("INTEGER") || upperType.includes("BIGINT") ||
    upperType.includes("NUMERIC") || upperType.includes("DOUBLE")
  ) {
    return "number";
  } else if (upperType.includes("BOOLEAN")) {
    return "boolean";
  } else if (upperType.includes("DATE") || upperType.includes("TIMESTAMP")) {
    return "date";
  } else if (upperType.includes("BLOB")) {
    return "binary";
  } else {
    return "string"; // Default fallback
  }
}

/**
 * Build DuckDB nullstr parameter from configuration
 */
function buildNullStrParameter(config: WorkspaceConfig): string {
  const allNullValues = new Set<string>();

  for (const fieldConfig of Object.values(config.fields)) {
    for (const nullValue of fieldConfig.nullValues) {
      allNullValues.add(nullValue);
    }
  }

  // Add defaults if no configuration
  if (allNullValues.size === 0) {
    allNullValues.add("");
    allNullValues.add("NA");
    allNullValues.add("NULL");
  }

  return `[${Array.from(allNullValues).map((v) => `'${v.replace(/'/g, "''")}'`).join(", ")}]`;
}

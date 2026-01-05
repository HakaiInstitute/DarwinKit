/**
 * CSV parsing using DuckDB for schema inference
 */

import { DuckDBConnection as DuckDB } from "@duckdb/node-api";
import type { DatasetSchema, FieldSchema, PrimitiveType } from "@dwkt/domain";
import { ErrorCode } from "@dwkt/domain";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { match } from "ts-pattern";

// Parse options for customizing CSV parsing behavior
export interface ParseOptions {
  readonly sampleSize?: number; // Number of sample values per column (default: 5)
  readonly maxRows?: number; // Limit for large files (default: unlimited)
}

// Parse metadata for tracking parse time and format
export class ParseMetadata extends Data.Class<{
  readonly parseTimeMs: number;
  readonly fileFormat: "csv";
}> {}

// Result from CSV parsing
export class ParsedFileResult extends Data.Class<{
  readonly schema: DatasetSchema;
  readonly samples: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly parseMetadata: ParseMetadata;
  readonly duckdbTableName: string;
}> {}

// Error class for parse operations
const ParseErrorBase = Data.TaggedClass("ParseError")<{
  readonly message: string;
  readonly filePath: string;
  readonly cause?: Error;
}>;

export class ParseError extends ParseErrorBase {
  readonly code = ErrorCode.PARSE_ERROR;
}

// Default parse options
const DEFAULT_PARSE_OPTIONS: ParseOptions = {
  sampleSize: 5,
  maxRows: undefined,
};

/**
 * Parse a CSV file for workspace creation
 */
export function parseFileForWorkspace(
  filePath: string,
  options: ParseOptions = {},
): Effect.Effect<ParsedFileResult, ParseError> {
  const parseOptions = { ...DEFAULT_PARSE_OPTIONS, ...options };
  const startTime = Date.now();

  return Effect.acquireUseRelease(
    // Acquire: Create DuckDB connection - failure is a system defect
    Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
    // Use: Perform all database operations with the connection
    (connection) =>
      Effect.gen(function* (_) {
        // Create table name from file path
        const tableName = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // Build CSV read query
        let query = `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${filePath}'`;
        if (parseOptions.maxRows) {
          query += `, sample_size=${parseOptions.maxRows}`;
        }
        query += `)`;

        // Execute table creation - this can fail with invalid user CSV (expected error)
        yield* _(
          Effect.tryPromise({
            try: () => connection.runAndReadAll(query),
            catch: (error) =>
              new ParseError({
                message: `Failed to parse CSV file: ${error}`,
                filePath,
                cause: error instanceof Error ? error : new Error(String(error)),
              }),
          }),
        );

        // Get schema information - infrastructure query should always work (defect if it fails)
        const schemaQuery = `
          SELECT
            column_name as name,
            data_type as duckdb_type,
            is_nullable,
            column_default,
            ordinal_position
          FROM information_schema.columns
          WHERE table_name = '${tableName}'
          ORDER BY ordinal_position
        `;

        const schemaResult = yield* _(
          Effect.tryPromise(() => connection.runAndReadAll(schemaQuery)).pipe(Effect.orDie),
        );
        const schemaRows = schemaResult.getRowObjects();

        // Get row count - infrastructure query should always work (defect if it fails)
        const countResult = yield* _(
          Effect.tryPromise(() =>
            connection.runAndReadAll(`SELECT COUNT(*) as count FROM ${tableName}`)
          ).pipe(Effect.orDie),
        );
        const rawCount = countResult.getRowObjects()[0].count;
        const rowCount = typeof rawCount === "bigint" ? Number(rawCount) : rawCount as number;

        // Build field map and collect samples
        const fieldsMap = new Map<string, FieldSchema>();
        const samplesMap = new Map<string, ReadonlyArray<string>>();

        for (const row of schemaRows) {
          const fieldName = row.name as string;
          const duckdbType = row.duckdb_type as DuckDbPrimitiveType;
          const isNullable = row.is_nullable === "YES";

          // Map DuckDB type to primitive type
          const primitiveType = mapDuckDBToPrimitive(duckdbType);

          // Get sample values for this field - SQL query should always work (defect if it fails)
          const sampleQuery = `
            SELECT DISTINCT "${fieldName}" as value
            FROM ${tableName}
            WHERE "${fieldName}" IS NOT NULL
            LIMIT ${parseOptions.sampleSize}
          `;

          const sampleResult = yield* _(
            Effect.tryPromise(() => connection.runAndReadAll(sampleQuery)).pipe(Effect.orDie),
          );
          const sampleRows = sampleResult.getRowObjects();
          const samples = sampleRows.map((row) => String(row.value)).filter(Boolean);

          const fieldSchema: FieldSchema = {
            name: fieldName,
            inferredType: duckdbType,
            primitiveType,
            isNullable,
            sampleValues: samples,
          };

          fieldsMap.set(fieldName, fieldSchema);
          samplesMap.set(fieldName, samples);
        }

        // Clean up temporary table - DDL should always work (defect if it fails)
        yield* _(
          Effect.tryPromise(() => connection.runAndReadAll(`DROP TABLE ${tableName}`)).pipe(
            Effect.orDie,
          ),
        );

        const schema: DatasetSchema = {
          fields: fieldsMap,
          rowCount,
          tableName: tableName,
          inferredAt: new Date(),
        };

        const parseTime = Date.now() - startTime;

        return new ParsedFileResult({
          schema,
          samples: samplesMap,
          parseMetadata: new ParseMetadata({
            parseTimeMs: parseTime,
            fileFormat: "csv",
          }),
          duckdbTableName: tableName,
        });
      }),
    // Release: Close connection (ignores any errors during cleanup)
    (connection) => Effect.try(() => connection.closeSync()).pipe(Effect.ignore),
  );
}

type DuckDbPrimitiveType =
  | "VARCHAR"
  | "TEXT"
  | "STRING"
  | "INTEGER"
  | "BIGINT"
  | "SMALLINT"
  | "DOUBLE"
  | "REAL"
  | "FLOAT"
  | "DECIMAL"
  | "NUMERIC"
  | "BOOLEAN"
  | "BOOL"
  | "DATE"
  | "TIMESTAMP"
  | "TIME"
  | "BLOB"
  | "BYTEA"
  | "JSON";

/**
 * Map DuckDB type to our primitive type system
 */
function mapDuckDBToPrimitive(duckdbType: DuckDbPrimitiveType): PrimitiveType {
  return match(duckdbType)
    .with(
      "VARCHAR",
      "TEXT",
      "STRING",
      () => "string" as const,
    )
    .with(
      "INTEGER",
      "BIGINT",
      "SMALLINT",
      "DOUBLE",
      "REAL",
      "FLOAT",
      "DECIMAL",
      "NUMERIC",
      () => "number" as const,
    )
    .with("BOOLEAN", "BOOL", () => "boolean" as const)
    .with(
      "DATE",
      "TIMESTAMP",
      "TIME",
      () => "date" as const,
    )
    .with("BLOB", "BYTEA", () => "binary" as const)
    .with("JSON", () => "object" as const)
    .exhaustive();
}

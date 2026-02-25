import { DuckDBConnection as DuckDB } from "@duckdb/node-api";
import type { DatasetSchema, FieldSchema, PrimitiveType } from "@dwkt/domain/schemas";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";

export interface ParseOptions {
  readonly sampleSize?: number; // Number of sample values per column (default: 5)
  readonly maxRows?: number; // Limit for large files (default: unlimited)
}

export class ParseMetadata extends Data.Class<{
  readonly parseTimeMs: number;
  readonly fileFormat: "csv";
}> {}

class ParsedFileResult extends Data.Class<{
  readonly schema: DatasetSchema;
  readonly samples: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly parseMetadata: ParseMetadata;
  readonly duckdbTableName: string;
}> {}

// deno-lint-ignore no-slow-types
const ParseErrorBase = Data.TaggedClass("ParseError")<{
  readonly message: string;
  readonly filePath: string;
  readonly cause?: Error;
}>;

export class ParseError extends ParseErrorBase {}

const DEFAULT_PARSE_OPTIONS: ParseOptions = {
  sampleSize: 5,
  maxRows: undefined,
};

export function parseFileForWorkspace(
  filePath: string,
  options: ParseOptions = {},
): Effect.Effect<ParsedFileResult, ParseError> {
  const parseOptions = { ...DEFAULT_PARSE_OPTIONS, ...options };
  const startTime = Date.now();

  return Effect.acquireUseRelease(
    Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
    (connection) =>
      Effect.gen(function* (_) {
        // Create table name from file path
        const tableName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        let query = `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${filePath}'`;
        if (parseOptions.maxRows) {
          query += `, sample_size=${parseOptions.maxRows}`;
        }
        query += `)`;

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
          Effect.tryPromise(() => connection.runAndReadAll(schemaQuery)).pipe(
            Effect.orDie,
          ),
        );
        const schemaRows = schemaResult.getRowObjects();

        const countResult = yield* _(
          Effect.tryPromise(() =>
            connection.runAndReadAll(
              `SELECT COUNT(*) as count FROM ${tableName}`,
            )
          ).pipe(Effect.orDie),
        );
        const rawCount = countResult.getRowObjects()[0].count;
        const rowCount = typeof rawCount === "bigint" ? Number(rawCount) : rawCount as number;

        const fieldsMap = new Map<string, FieldSchema>();
        const samplesMap = new Map<string, ReadonlyArray<string>>();

        for (const row of schemaRows) {
          const fieldName = row.name as string;
          const duckdbType = row.duckdb_type as DuckDbPrimitiveType;
          const isNullable = row.is_nullable === "YES";

          const primitiveType = mapDuckDBToPrimitive(duckdbType);

          const sampleQuery = `
            SELECT DISTINCT "${fieldName}" as value
            FROM ${tableName}
            WHERE "${fieldName}" IS NOT NULL
            LIMIT ${parseOptions.sampleSize}
          `;

          const sampleResult = yield* _(
            Effect.tryPromise(() => connection.runAndReadAll(sampleQuery)).pipe(
              Effect.orDie,
            ),
          );
          const sampleRows = sampleResult.getRowObjects();
          const samples = sampleRows.map((row) => String(row.value)).filter(
            Boolean,
          );

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

        yield* _(
          Effect.tryPromise(() => connection.runAndReadAll(`DROP TABLE ${tableName}`)).pipe(
            Effect.orDie,
          ),
        );

        // TODO: Create this with datasetSchemaSchema.make()
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

const isOneOf = <T extends string>(...values: readonly T[]) => (value: string): value is T =>
  values.includes(value as T);

function mapDuckDBToPrimitive(duckdbType: DuckDbPrimitiveType): PrimitiveType {
  return Match.value(duckdbType).pipe(
    Match.when(
      isOneOf("VARCHAR", "TEXT", "STRING"),
      () => "string" as const,
    ),
    Match.when(
      isOneOf("INTEGER", "BIGINT", "SMALLINT", "DOUBLE", "REAL", "FLOAT", "DECIMAL", "NUMERIC"),
      () => "number" as const,
    ),
    Match.when(
      isOneOf("BOOLEAN", "BOOL"),
      () => "boolean" as const,
    ),
    Match.when(
      isOneOf("DATE", "TIMESTAMP", "TIME"),
      () => "date" as const,
    ),
    Match.when(
      isOneOf("BLOB", "BYTEA"),
      () => "binary" as const,
    ),
    Match.when("JSON", () => "object" as const),
    Match.exhaustive,
  );
}

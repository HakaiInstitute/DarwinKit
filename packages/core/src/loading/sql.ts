/**
 * SQL utilities for DuckDB operations
 *
 * @module loading/sql
 */

/**
 * Sanitize a string for use as a SQL table name
 *
 * Replaces any characters that are not alphanumeric or underscore
 * with underscores to create a valid SQL identifier.
 *
 * @param name - The string to sanitize
 * @returns A sanitized string safe for use as a table name
 *
 * @example
 * ```typescript
 * sanitizeTableName("my-dataset") // "my_dataset"
 * sanitizeTableName("data.csv") // "data_csv"
 * sanitizeTableName("events 2024") // "events_2024"
 * ```
 */
export function sanitizeTableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Escape a string value for use in SQL
 *
 * Escapes single quotes by doubling them, making the string
 * safe for use in SQL string literals.
 *
 * @param value - The string to escape
 * @returns An escaped string safe for SQL
 *
 * @example
 * ```typescript
 * escapeString("it's fine") // "it''s fine"
 * escapeString("normal") // "normal"
 * ```
 */
function escapeString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Format an array of null values for DuckDB's nullstr parameter
 *
 * @param nullValues - Array of strings to treat as NULL
 * @returns Formatted string for DuckDB nullstr parameter
 *
 * @example
 * ```typescript
 * formatNullValues(["NA", "N/A", ""]) // "'NA', 'N/A', ''"
 * ```
 */
export function formatNullValues(nullValues: readonly string[]): string {
  return nullValues.map((v) => `'${escapeString(v)}'`).join(", ");
}

/**
 * Parsed error type for DuckDB constraint violations
 */
export type ParsedErrorType =
  | "primary-key"
  | "not-null"
  | "enum"
  | "foreign-key"
  | "check"
  | "unknown";

/**
 * Parsed DuckDB error information
 */
export interface ParsedErrorInfo {
  readonly type: ParsedErrorType;
  readonly fieldName?: string;
  readonly value?: string;
  readonly referencedTable?: string;
  readonly referencedField?: string;
  readonly message: string;
}

/**
 * Parse DuckDB error into structured violation information
 *
 * Extracts violation type, field name, and value from DuckDB error messages
 * to create actionable error information.
 *
 * @param error - The DuckDB error to parse
 * @returns Structured error information
 */
export function parseDuckDBError(error: Error): ParsedErrorInfo {
  const message = error.message;

  // PRIMARY KEY or UNIQUE constraint violation
  // Format: 'Duplicate key "field: value" violates (primary key|unique) constraint.'
  const pkMatch = message.match(
    /Duplicate key "(?:\w+:\s*)?([^"]+)" violates (?:primary key|unique) constraint/,
  );

  if (pkMatch) {
    return {
      type: "primary-key",
      value: pkMatch[1],
      message,
    };
  }

  // NOT NULL constraint violation
  // Format: 'NOT NULL constraint failed: table.column'
  const notNullMatch = message.match(/NOT NULL constraint failed:\s*(.+)?/i);
  if (notNullMatch) {
    // Extract just the column name if table.column format
    const fieldPart = notNullMatch[1]?.trim();
    const fieldName = fieldPart?.includes(".") ? fieldPart.split(".").pop() : fieldPart;
    return {
      type: "not-null",
      fieldName,
      message,
    };
  }

  // ENUM/Type conversion error
  // Format 1: "Could not convert string 'X' to UINT8 when casting from source column Y" (CSV import)
  // Format 2: "Could not convert string 'X' to UINT8" (direct INSERT)
  const enumMatchWithColumn = message.match(
    /Could not convert string '([^']+)'.+from source column (\w+)/,
  );
  if (enumMatchWithColumn) {
    return {
      type: "enum",
      value: enumMatchWithColumn[1],
      fieldName: enumMatchWithColumn[2],
      message,
    };
  }

  const enumMatchSimple = message.match(
    /Could not convert string '([^']+)' to UINT8/,
  );
  if (enumMatchSimple) {
    return {
      type: "enum",
      value: enumMatchSimple[1],
      message,
    };
  }

  // FOREIGN KEY constraint violation
  // Format: 'Violates foreign key constraint because key "field: value" does not exist in the referenced table'
  const fkMatch = message.match(/foreign key constraint/i);
  if (fkMatch) {
    // Extract field name and value: key "fieldName: value"
    const keyMatch = message.match(/key "(\w+):\s*([^"]+)"/);
    const fieldName = keyMatch?.[1];

    // Try to extract referenced table from error message
    const refTableMatch = message.match(
      /does not exist in the referenced table "(\w+)"/i,
    );
    // Fall back to inferring from field name (eventID -> event)
    const referencedTable = refTableMatch?.[1] ??
      (fieldName?.endsWith("ID") ? fieldName.slice(0, -2).toLowerCase() : undefined);

    return {
      type: "foreign-key",
      fieldName,
      value: keyMatch?.[2],
      referencedTable,
      referencedField: fieldName,
      message,
    };
  }

  // CHECK constraint violation
  // Format: 'CHECK constraint failed on table X with expression...'
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

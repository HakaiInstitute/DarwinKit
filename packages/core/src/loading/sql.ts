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
 * Parsed DuckDB error information
 */
export interface ParsedErrorInfo {
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
  // Example: "Constraint Error: Violates foreign key constraint because key "eventID: E999" does not exist in the referenced table"
  // Example: "FOREIGN KEY constraint violation: key "eventID": "E999" does not exist"
  const fkMatch = message.match(/FOREIGN KEY constraint/i) ||
    message.match(/foreign key constraint/i) ||
    message.match(/does not exist in the referenced table/i);
  if (fkMatch) {
    // Try to extract field name and value from various DuckDB FK error formats
    // Format 1: key "fieldName: value"
    const keyMatch1 = message.match(/key "(\w+):\s*([^"]+)"/);
    // Format 2: key "fieldName": "value"
    const keyMatch2 = message.match(/key "(\w+)":\s*"([^"]+)"/);
    // Format 3: column fieldName with value
    const keyMatch3 = message.match(/column (\w+).+value[:\s]+['"]?([^'"]+)['"]?/i);

    const keyMatch = keyMatch1 || keyMatch2 || keyMatch3;

    return {
      type: "foreign-key",
      fieldName: keyMatch?.[1],
      value: keyMatch?.[2],
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

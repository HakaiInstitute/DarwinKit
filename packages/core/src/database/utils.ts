/**
 * Database Utilities
 *
 * Shared utility functions for database operations.
 *
 * @module database/utils
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
export function escapeString(value: string): string {
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

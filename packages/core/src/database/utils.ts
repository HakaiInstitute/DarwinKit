/**
 * Database utilities - Shared types and helper functions
 */

/**
 * Minimal dataset interface for schema import
 * Works with both validation and transform dataset configs
 * TODO: Replace this with proper schema usage
 */
export type DatasetWithProfile = {
  readonly name: string;
  readonly profile?: string;
  readonly spec?: string;
};

/**
 * Sanitize dataset name for use as SQL table name
 *
 * Replaces all non-alphanumeric characters (except underscore) with underscores.
 * This ensures the name is safe to use in SQL queries without escaping.
 */
export function sanitizeTableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Extract row numbers from DuckDB LIST type result
 *
 * DuckDB returns LIST columns in different formats depending on the driver.
 * This utility handles both array and object formats consistently.
 */
export function extractRowNumbers(listValue: unknown): number[] {
  if (Array.isArray(listValue)) {
    return listValue.map((n) => Number(n));
  }

  if (listValue && typeof listValue === "object" && "items" in listValue) {
    const obj = listValue as { items: unknown[] };
    return obj.items.map((n) => Number(n));
  }

  return [];
}

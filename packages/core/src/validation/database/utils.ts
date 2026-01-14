/**
 * Database utilities - Shared types and helper functions
 */

/**
 * Minimal dataset interface for schema import
 * Works with both validation and transform dataset configs
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

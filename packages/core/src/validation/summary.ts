/**
 * Validation Summary Utilities
 *
 * Core-specific utilities for validation summary operations.
 * Domain types (ValidationSummary, calculateSummary, etc.) should be
 * imported from @dwkt/domain.
 */

import type { DatasetConfig } from "@dwkt/domain/schemas";
import { parseSpecIdentifier } from "@dwkt/domain/schemas";
import { sanitizeTableName } from "../loading/sql.ts";

/**
 * Resolve dataset name to its schema table name
 *
 * Schema tables are named after profiles, not dataset names.
 * For example, dataset "occurrences" with spec "dwc-occurrence" → table "occurrence"
 *
 * Note: This function is in core because it depends on sanitizeTableName
 * from the DuckDB loading module.
 *
 * @param datasetName - Name of the dataset
 * @param datasets - Array of dataset configurations
 * @returns The schema table name
 */
export function resolveSchemaTableName(
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

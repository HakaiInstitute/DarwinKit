/**
 * Validation Summary Utilities
 *
 * Core-specific utilities for validation summary operations.
 * Domain types (ValidationSummary, calculateSummary, etc.) should be
 * imported from @dwkt/domain.
 */

import type { DatasetConfig } from "@dwkt/domain/schemas";
import { parseSpecIdentifier } from "@dwkt/domain/schemas";
import { getValidationProfile } from "@dwkt/domain/specs";
import { sanitizeTableName } from "../loading/sql.ts";

/**
 * Resolve dataset name to its schema table name
 *
 * Schema tables are named after the profile's display name (matching importSchema),
 * not the profile ID or dataset name.
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
    return sanitizeTableName(datasetName).toLowerCase();
  }

  // Derive profile ID for registry lookup
  let profileId = dataset.profile;
  if (!profileId && dataset.spec) {
    const parsed = parseSpecIdentifier(dataset.spec);
    if (parsed) {
      profileId = parsed.type.charAt(0).toUpperCase() + parsed.type.slice(1);
    }
  }

  // Resolve via profile registry to get display name (matches importSchema)
  if (profileId) {
    const profile = getValidationProfile(profileId);
    if (profile) {
      return sanitizeTableName(profile.name).toLowerCase();
    }
  }

  return sanitizeTableName(dataset.name).toLowerCase();
}

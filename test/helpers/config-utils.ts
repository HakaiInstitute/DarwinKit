import type { WorkspaceConfig } from "@dwkit/domain/schemas";

/**
 * Converts a WorkspaceConfig object for YAML serialization.
 *
 * Transforms Date fields (createdAt, updatedAt) to ISO strings since
 * YAML.stringify cannot serialize Date objects directly.
 * Also strips undefined values (from Data.TaggedClass optional fields)
 * via JSON roundtrip.
 */
export function prepareConfigForYaml(
  config: WorkspaceConfig,
): Record<string, unknown> {
  const prepared = {
    ...config,
    createdAt: config.createdAt instanceof Date ? config.createdAt.toISOString() : config.createdAt,
    updatedAt: config.updatedAt instanceof Date ? config.updatedAt.toISOString() : config.updatedAt,
  };
  // JSON roundtrip strips undefined values that YAML.stringify cannot handle
  return JSON.parse(JSON.stringify(prepared));
}

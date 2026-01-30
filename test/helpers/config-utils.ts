import type { WorkspaceConfig } from "@dwkt/domain";

/**
 * Converts a WorkspaceConfig object for YAML serialization.
 *
 * Transforms Date fields (createdAt, updatedAt) to ISO strings since
 * YAML.stringify cannot serialize Date objects directly.
 */
export function prepareConfigForYaml(
  config: WorkspaceConfig,
): Record<string, unknown> {
  return {
    ...config,
    createdAt: config.createdAt instanceof Date ? config.createdAt.toISOString() : config.createdAt,
    updatedAt: config.updatedAt instanceof Date ? config.updatedAt.toISOString() : config.updatedAt,
  };
}

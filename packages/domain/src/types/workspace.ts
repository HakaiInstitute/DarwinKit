/**
 * Workspace types
 */

import type { FileFormat } from "./common.ts";
import type { DatasetSchema } from "./schema.ts";

// File-based workspace - stored as JSON files
export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly filePath: string;
  readonly format: FileFormat;
  readonly schema: DatasetSchema;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  // File-based storage paths
  readonly workspaceDir: string; // e.g., "./workspaces/workspace-123/"
  readonly dataTableName: string; // DuckDB table name for queries
}

// Minimal workspace info for listing
export interface WorkspaceInfo {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly filePath: string;
  readonly format: FileFormat;
  readonly rowCount: number;
  readonly fieldCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Workspace creation input
export interface CreateWorkspaceInput {
  readonly name: string;
  readonly description?: string;
  readonly filePath: string;
}

// Workspace creation options with parse settings
export interface CreateWorkspaceOptions extends CreateWorkspaceInput {
  readonly parseOptions?: {
    readonly sampleSize?: number;
    readonly maxRows?: number;
  };
}

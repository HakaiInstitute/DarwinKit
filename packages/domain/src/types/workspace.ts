/**
 * Workspace types - derived from Effect schemas
 */

import type * as S from "effect/Schema";
import type {
  createWorkspaceOptionsSchema,
  workspaceInfoSchema,
  workspaceSchema,
} from "../schemas/workspace.ts";

// File-based workspace - stored as JSON files
export type Workspace = S.Schema.Type<typeof workspaceSchema>;

// Minimal workspace info for listing
export type WorkspaceInfo = S.Schema.Type<typeof workspaceInfoSchema>;

// Workspace creation options with parse settings
export type CreateWorkspaceOptions = S.Schema.Type<typeof createWorkspaceOptionsSchema>;

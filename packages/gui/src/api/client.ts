/**
 * API client for communicating with DarwinKit API
 */

import type { Workspace, WorkspaceInfo } from "@dwkt/domain";
import { workspaceInfoSchema, workspaceSchema } from "@dwkt/domain";
import * as S from "effect/Schema";

const API_BASE = "/api";

/**
 * List all workspaces
 */
export async function listWorkspaces(): Promise<WorkspaceInfo[]> {
  const response = await fetch(`${API_BASE}/workspaces`);
  if (!response.ok) {
    throw new Error(`Failed to fetch workspaces: ${response.statusText}`);
  }
  const data = await response.json();

  // Validate response with shared schema
  if (Array.isArray(data)) {
    return data.map((item) => S.decodeUnknownSync(workspaceInfoSchema)(item));
  }
  throw new Error("Invalid response format");
}

/**
 * Get a specific workspace by ID
 */
export async function getWorkspace(id: string): Promise<Workspace> {
  const response = await fetch(`${API_BASE}/workspaces/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch workspace: ${response.statusText}`);
  }
  const data = await response.json();
  return S.decodeUnknownSync(workspaceSchema)(data);
}

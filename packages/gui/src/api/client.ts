/**
 * API client for communicating with DarwinKit API
 */

import * as S from "effect/Schema";
import type { CreateWorkspaceOptions, Workspace, WorkspaceInfo } from "@dwkt/domain";
import { workspaceInfoSchema, workspaceSchema } from "@dwkt/domain";

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
  const decoded = S.decodeUnknownSync(workspaceSchema)(data);

  // Convert fields array to ReadonlyMap
  return {
    ...decoded,
    schema: {
      ...decoded.schema,
      fields: new Map(decoded.schema.fields) as ReadonlyMap<
        string,
        typeof decoded.schema.fields[number][1]
      >,
    },
  };
}

/**
 * Create a new workspace from a CSV file
 */
export async function createWorkspace(
  options: CreateWorkspaceOptions,
): Promise<{ workspace: Workspace }> {
  const response = await fetch(`${API_BASE}/workspaces`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Failed to create workspace: ${response.statusText}`);
  }

  return await response.json();
}

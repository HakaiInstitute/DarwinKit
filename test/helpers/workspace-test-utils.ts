/**
 * Workspace Test Utilities
 *
 * Helper functions for testing the workspace service.
 */

import { join } from "@std/path";
import { v4 as uuidv4 } from "uuid";
import * as Effect from "effect/Effect";
// Simple logger for tests
const logger = {
  warn: (message: string) => console.warn(`[WARN] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
};

import {
  CreateWorkspaceResult,
  WorkspaceService,
} from "../../packages/core/src/workspace/service.ts";
import type { CreateWorkspaceOptions, Workspace } from "@dwkt/domain";

/**
 * Creates a temporary directory for test isolation
 */
export async function createTempDir(): Promise<string> {
  const tempDir = join(Deno.cwd(), "test", "tmp", `test-${uuidv4().slice(0, 8)}`);
  await Deno.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Cleans up a temporary directory
 */
export async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await Deno.remove(tempDir, { recursive: true });
  } catch (error) {
    logger.warn(`Failed to clean up temp directory ${tempDir}: ${error}`);
  }
}

/**
 * Creates a test workspace service with a clean temporary directory
 */
export async function createTestWorkspaceService(): Promise<[WorkspaceService, string]> {
  const tempDir = await createTempDir();
  const service = new WorkspaceService({
    workspacesDir: tempDir,
  });

  return [service, tempDir];
}

/**
 * Creates a test workspace with the given options
 */
export async function createTestWorkspace(
  service: WorkspaceService,
  options?: {
    name?: string;
    description?: string;
    filePath?: string;
    parseOptions?: {
      sampleSize?: number;
      maxRows?: number;
    };
  },
): Promise<Workspace> {
  // Default test options
  const defaultOptions = {
    name: `Test Workspace ${uuidv4().slice(0, 4)}`,
    description: "Created for testing",
    filePath: join(Deno.cwd(), "test", "data", "FC2022_event.csv"),
    parseOptions: {
      sampleSize: 3,
      maxRows: 50,
    },
  };

  // Merge with provided options
  const mergedOptions = {
    ...defaultOptions,
    ...options,
    parseOptions: {
      ...defaultOptions.parseOptions,
      ...options?.parseOptions,
    },
  };

  const createOptions: CreateWorkspaceOptions = mergedOptions;

  // Create the workspace
  const result: CreateWorkspaceResult = await Effect.runPromise(
    service.createFromFile(createOptions),
  );
  return result.workspace;
}

/**
 * Verifies a workspace directory structure
 */
export async function verifyWorkspaceStructure(
  workspacesDir: string,
  workspaceId: string,
): Promise<boolean> {
  const workspaceDir = join(workspacesDir, `workspace-${workspaceId}`);
  const workspaceFile = join(workspaceDir, "workspace.json");
  const samplesFile = join(workspaceDir, "samples.json");

  try {
    // Check if files exist
    await Deno.stat(workspaceDir);
    await Deno.stat(workspaceFile);
    await Deno.stat(samplesFile);

    // Check if workspace file is valid JSON
    const workspaceContent = await Deno.readTextFile(workspaceFile);
    const workspace = JSON.parse(workspaceContent);

    if (!workspace.id || !workspace.name || !workspace.schema) {
      return false;
    }

    // Check if samples file is valid JSON
    const samplesContent = await Deno.readTextFile(samplesFile);
    const samples = JSON.parse(samplesContent);

    if (typeof samples !== "object") {
      return false;
    }

    return true;
  } catch (error) {
    logger.error(`Failed to verify workspace structure: ${error}`);
    return false;
  }
}

/**
 * Sets up multiple test workspaces
 */
export async function setupTestWorkspaces(
  service: WorkspaceService,
  count = 3,
): Promise<Workspace[]> {
  const workspaces = [];

  for (let i = 0; i < count; i++) {
    const workspace = await createTestWorkspace(service, {
      name: `Test Workspace ${i}`,
      description: `Test description ${i}`,
    });
    workspaces.push(workspace);
  }

  return workspaces;
}

/**
 * Verifies if a field exists in a workspace schema
 */
export function hasField(workspace: Workspace, fieldName: string): boolean {
  return workspace.schema.fields.has(fieldName);
}

/**
 * Gets a field's primitive type from a workspace schema
 */
export function getFieldType(workspace: Workspace, fieldName: string): string | undefined {
  const field = workspace.schema.fields.get(fieldName);
  return field?.primitiveType;
}

/**
 * Checks if an error is related to file access issues
 * This provides a resilient way to test for file-related errors without
 * depending on specific error message strings that might change
 */
export function isFileAccessError(error: unknown): boolean {
  if (!error) return false;

  // Check for our custom error types
  // deno-lint-ignore no-explicit-any
  if ((error as any)._tag === "WorkspaceFileAccessError") return true;
  // deno-lint-ignore no-explicit-any
  if ((error as any).constructor?.name === "WorkspaceFileAccessError") return true;

  // Check for common file-related error patterns (case-insensitive)
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes("file") ||
      message.includes("parse") ||
      message.includes("not found") ||
      message.includes("no such") ||
      message.includes("access") ||
      message.includes("permission");
  }

  return false;
}

/**
 * Asserts that an error is file-access related without checking specific strings
 */
export function assertFileAccessError(error: unknown, customMessage?: string): void {
  const isFileError = isFileAccessError(error);
  if (!isFileError) {
    const errorInfo = error instanceof Error
      ? `${error.constructor.name}: ${error.message}`
      : String(error);
    throw new Error(customMessage || `Expected file access error, got: ${errorInfo}`);
  }
}

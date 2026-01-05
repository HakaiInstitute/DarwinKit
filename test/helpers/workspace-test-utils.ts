/**
 * Test Utilities
 *
 * Helper functions for testing workspace validation and configuration.
 */

import { join } from "@std/path";
import { v4 as uuidv4 } from "uuid";

// Simple logger for tests
const logger = {
  warn: (message: string) => console.warn(`[WARN] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
};

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
 * Checks if an error is related to file access issues
 * This provides a resilient way to test for file-related errors using
 * Effect's tagged error system for type-safe error handling.
 */
export function isFileAccessError(error: unknown): boolean {
  if (!error) return false;

  // Check for Effect tagged errors using the _tag property
  // This is type-safe and works with catchTags
  if (typeof error === "object" && error !== null && "_tag" in error) {
    const tag = (error as { _tag: unknown })._tag;

    // File-related error tags from the codebase
    return tag === "ParseError" ||
      tag === "ConfigNotFoundError" ||
      tag === "DatasetFileNotFoundError";
  }

  // Fallback for non-tagged errors (shouldn't happen with proper Effect usage)
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

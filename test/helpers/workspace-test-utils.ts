/**
 * Test Utilities
 *
 * Helper functions for testing workspace validation and configuration.
 */

import { join } from "@std/path";

// Simple logger for tests
const logger = {
  warn: (message: string) => console.warn(`[WARN] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
};

/**
 * Creates a temporary directory for test isolation
 */
export async function createTempDir(): Promise<string> {
  const tempDir = join(Deno.cwd(), "test", "tmp", `test-${crypto.randomUUID().slice(0, 8)}`);
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

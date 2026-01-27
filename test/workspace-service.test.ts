/**
 * Workspace Service Tests
 *
 * Tests for the file-based workspace management functionality.
 */

import type { CreateWorkspaceOptions } from "@dwkt/domain";
import { assert, assertEquals, assertExists, assertGreater, assertRejects } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";
import { CreateWorkspaceResult, WorkspaceService } from "../packages/core/src/workspace/service.ts";
import { TEST_DATA_DIR } from "./helpers/paths.ts";
import {
  assertFileAccessError,
  cleanupTempDir,
  createTempDir,
} from "./helpers/workspace-test-utils.ts";

// Test configuration
const TEST_CSV_FILE = join(TEST_DATA_DIR, "FC2022_event.csv");

Deno.test("Workspace Service - Create workspace from CSV", async () => {
  const tempDir = await createTempDir();

  try {
    const service = new WorkspaceService({ workspacesDir: tempDir });

    const options: CreateWorkspaceOptions = {
      name: "Test Workspace",
      filePath: TEST_CSV_FILE,
      parseOptions: {
        sampleSize: 3,
        maxRows: 50,
      },
    };

    const result: CreateWorkspaceResult = await Effect.runPromise(service.createFromFile(options));

    // Verify workspace was created
    assertExists(result.workspace.id);
    assertExists(result.workspace.schema);
    assertGreater(result.workspace.schema.fields.size, 0);

    // Verify files were persisted
    const workspaceDir = join(tempDir, `workspace-${result.workspace.id}`);
    const workspaceFile = join(workspaceDir, "workspace.json");
    const samplesFile = join(workspaceDir, "samples.json");

    const workspaceFileExists = await Deno.stat(workspaceFile).then(() => true).catch(() => false);
    const samplesFileExists = await Deno.stat(samplesFile).then(() => true).catch(() => false);

    assert(workspaceFileExists);
    assert(samplesFileExists);

    // Verify workspace can be loaded back with data integrity
    const loaded = await Effect.runPromise(service.load(result.workspace.id));
    assertEquals(loaded.name, "Test Workspace");
    assertEquals(loaded.filePath, TEST_CSV_FILE);
    assertEquals(loaded.schema.fields.size, result.workspace.schema.fields.size);
    assertEquals(loaded.schema.rowCount, result.workspace.schema.rowCount);
  } finally {
    await cleanupTempDir(tempDir);
  }
});

Deno.test("Workspace Service - Handle non-existent workspace", async () => {
  const tempDir = await createTempDir();

  try {
    const service = new WorkspaceService({ workspacesDir: tempDir });

    await assertRejects(
      async () => {
        await Effect.runPromise(service.load("nonexistent-id"));
      },
      Error,
      "Workspace not found",
    );
  } finally {
    await cleanupTempDir(tempDir);
  }
});

Deno.test("Workspace Service - Handle invalid file path", async () => {
  const tempDir = await createTempDir();

  try {
    const service = new WorkspaceService({ workspacesDir: tempDir });

    const options: CreateWorkspaceOptions = {
      name: "Invalid File Test",
      filePath: "/path/to/nonexistent/file.csv",
    };

    try {
      await Effect.runPromise(service.createFromFile(options));
      throw new Error("Expected an error to be thrown for invalid file path");
    } catch (error) {
      assertFileAccessError(error);
    }
  } finally {
    await cleanupTempDir(tempDir);
  }
});

/**
 * Tests for WorkspaceService
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";

import { ValidationService } from "../validation/validation-service.ts";
import { WorkspaceService } from "./workspace-service.ts";

// Test data paths
const TEST_DATA_DIR = join(Deno.cwd(), "test", "data");
const TEST_CONFIG_DIR = join(Deno.cwd(), "test", "example-config");
const VALID_CONFIG_PATH = join(TEST_CONFIG_DIR, "darwinkit.json");

Deno.test("WorkspaceService - load from valid config path", async () => {
  const program = Effect.gen(function* () {
    const workspaceService = yield* WorkspaceService;

    // Load workspace from valid config file
    const workspace = yield* workspaceService.load(VALID_CONFIG_PATH);

    // Verify workspace structure
    assertExists(workspace.id);
    assertEquals(workspace.name, "FC2022 Marine Biodiversity Dataset");
    assertExists(workspace.config);
    assertEquals(workspace.validationState.status, "not-validated");
    assertExists(workspace.createdAt);
    assertExists(workspace.updatedAt);

    return workspace;
  });

  // Run the program with both layers
  await Effect.runPromise(
    program.pipe(
      Effect.provide(WorkspaceService.layer),
      Effect.provide(ValidationService.layer),
    ),
  );
});

Deno.test("WorkspaceService - load from directory (discovery)", async () => {
  const program = Effect.gen(function* () {
    const workspaceService = yield* WorkspaceService;

    // Discover and load config from directory
    const workspace = yield* workspaceService.loadFromDirectory(TEST_CONFIG_DIR);

    // Verify workspace was loaded correctly
    assertExists(workspace.id);
    assertEquals(workspace.name, "FC2022 Marine Biodiversity Dataset");
    assertEquals(workspace.validationState.status, "not-validated");

    return workspace;
  });

  await Effect.runPromise(
    program.pipe(
      Effect.provide(WorkspaceService.layer),
      Effect.provide(ValidationService.layer),
    ),
  );
});

Deno.test("WorkspaceService - fail on missing config", async () => {
  const program = Effect.gen(function* () {
    const workspaceService = yield* WorkspaceService;

    // Try to load non-existent config
    const workspace = yield* workspaceService.load("/non/existent/darwinkit.json");

    return workspace;
  });

  let errorCaught = false;
  try {
    await Effect.runPromise(
      program.pipe(
        Effect.provide(WorkspaceService.layer),
        Effect.provide(ValidationService.layer),
      ),
    );
  } catch (_error) {
    errorCaught = true;
  }

  assertEquals(errorCaught, true, "Expected error when loading non-existent config");
});

Deno.test("WorkspaceService - fail on missing config in directory", async () => {
  const program = Effect.gen(function* () {
    const workspaceService = yield* WorkspaceService;

    // Try to discover config in directory without one
    const workspace = yield* workspaceService.loadFromDirectory(TEST_DATA_DIR);

    return workspace;
  });

  let errorCaught = false;
  try {
    await Effect.runPromise(
      program.pipe(
        Effect.provide(WorkspaceService.layer),
        Effect.provide(ValidationService.layer),
      ),
    );
  } catch (_error) {
    errorCaught = true;
  }

  assert(errorCaught, "Expected error when no config found in directory");
});

Deno.test("WorkspaceService - validate workspace", async () => {
  const program = Effect.gen(function* (_) {
    const workspaceService = yield* _(WorkspaceService);

    // Load workspace
    const workspace = yield* _(workspaceService.load(VALID_CONFIG_PATH));

    // Verify initial state
    assertEquals(workspace.validationState.status, "not-validated");

    // Validate workspace
    const validatedWorkspace = yield* _(workspaceService.validate(workspace));

    // Verify validation ran and updated state
    assertEquals(validatedWorkspace.validationState.status, "validated");
    if (validatedWorkspace.validationState.status === "validated") {
      assertExists(validatedWorkspace.validationState.result);
      assertExists(validatedWorkspace.validationState.result.workspaceId);
      assertExists(validatedWorkspace.validationState.result.datasetResults);
      assertEquals(validatedWorkspace.validationState.result.datasetResults.length > 0, true);
    }

    return validatedWorkspace;
  });

  // Provide both WorkspaceService and ValidationService layers
  await Effect.runPromise(
    program.pipe(
      Effect.provide(WorkspaceService.layer),
      Effect.provide(ValidationService.layer),
    ),
  );
});

/**
 * Comprehensive tests for expected errors
 *
 * Verifies that all expected errors in DarwinKit are catchable with Effect.catchAll
 * and represent recoverable domain errors rather than programming defects.
 */

import { Workspace } from "@dwkt/core/workspace";
import { WorkspaceValidator } from "@dwkt/core/validation";
import { assert, assertEquals, assertMatch } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";

Deno.test("Expected errors - all catchable with Effect.catchAll", async (t) => {
  const tempDir = await Deno.makeTempDir({ prefix: "expected_errors_test_" });

  await t.step("Workspace not found", async () => {
    const program = Effect.scoped(
      Effect.gen(function* () {
        // Try to load non-existent config
        return yield* Workspace.open(join(tempDir, "nonexistent", "darwinkit.yaml"));
      }),
    );

    let errorCaught = false;

    await Effect.runPromise(
      program.pipe(
        Effect.catchAll((_error) => {
          errorCaught = true;
          return Effect.succeed<null>(null);
        }),
      ),
    );

    assert(errorCaught, "Should catch with Effect.catchAll");
  });

  await t.step("Invalid workspace configuration", async () => {
    // Create invalid darwinkit.yaml
    const configPath = join(tempDir, "invalid-config");
    await Deno.mkdir(configPath, { recursive: true });
    await Deno.writeTextFile(
      join(configPath, "darwinkit.yaml"),
      "invalid: yaml: content:",
    );

    const validator = new WorkspaceValidator();

    let errorCaught = false;

    await Effect.runPromise(
      validator.validateFromConfig(configPath).pipe(
        Effect.catchAll((_error) => {
          errorCaught = true;
          return Effect.succeed(null);
        }),
      ),
    );

    assert(errorCaught, "Invalid config should be catchable");
  });

  await t.step("Config file not found", async () => {
    const nonExistentConfig = join(tempDir, "no-config-here");

    const validator = new WorkspaceValidator();

    let errorCaught = false;

    await Effect.runPromise(
      validator.validateFromConfig(nonExistentConfig).pipe(
        Effect.catchAll((_error) => {
          errorCaught = true;
          return Effect.succeed(null);
        }),
      ),
    );

    assert(errorCaught, "Config not found should be catchable");
  });

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("Expected errors - provide helpful error messages", async (t) => {
  const tempDir = await Deno.makeTempDir({ prefix: "error_messages_test_" });

  await t.step("Error messages include context (config not found)", async () => {
    const program = Effect.scoped(
      Effect.gen(function* () {
        return yield* Workspace.open(join(tempDir, "test-workspace", "darwinkit.yaml"));
      }),
    );

    const result = await Effect.runPromise(
      program.pipe(
        Effect.catchAll((error) => Effect.succeed(error.message as string)),
      ),
    );

    // Message should indicate config file issue
    assertMatch(result as string, /configuration|config|not found|darwinkit/i);
  });

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("Expected errors - can be recovered from", async (t) => {
  const tempDir = await Deno.makeTempDir({ prefix: "error_recovery_test_" });

  await t.step("Fallback to default workspace on error", async () => {
    const defaultWorkspace = {
      id: "default",
      name: "Default Workspace",
      description: "Fallback workspace",
      configPath: "",
      config: {
        id: "default",
        name: "Default",
        version: "1.0.0",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      validationState: { status: "not-validated" as const },
    };

    const program = Effect.scoped(
      Effect.gen(function* () {
        const workspace = yield* Workspace.open(
          join(tempDir, "nonexistent", "darwinkit.yaml"),
        );
        // Return a compatible structure (this branch won't execute due to error)
        return { id: workspace.config.id, name: workspace.name };
      }),
    );

    const result = await Effect.runPromise(
      program.pipe(
        Effect.catchAll(() => Effect.succeed(defaultWorkspace)),
      ),
    );

    assertEquals(result.id, "default");
  });

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

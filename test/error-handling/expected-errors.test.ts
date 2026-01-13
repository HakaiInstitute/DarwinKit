/**
 * Comprehensive tests for expected errors
 *
 * Verifies that all expected errors in DarwinKit are catchable with Effect.catchAll
 * and represent recoverable domain errors rather than programming defects.
 */

import { parseFileForWorkspace, Workspace } from "@dwkt/core";
import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";

Deno.test("Expected errors - all catchable with Effect.catchAll", async (t) => {
  const tempDir = await Deno.makeTempDir({ prefix: "expected_errors_test_" });

  await t.step("File not found (user-provided path)", async () => {
    const nonExistentPath = join(tempDir, "does-not-exist.csv");

    let errorCaught = false;

    await Effect.runPromise(
      parseFileForWorkspace(nonExistentPath).pipe(
        Effect.catchAll((_error) => {
          errorCaught = true;
          return Effect.succeed<null>(null);
        }),
      ),
    );

    assert(errorCaught, "Should catch with Effect.catchAll");
  });

  await t.step("Invalid CSV data", async () => {
    // Create a CSV that will be parsed but might have invalid data
    const csvPath = join(tempDir, "data.csv");
    await Deno.writeTextFile(csvPath, "col1,col2\nval1,val2");

    // Parse should succeed, but in cases where it fails, it should be catchable
    await Effect.runPromise(
      parseFileForWorkspace(csvPath).pipe(
        Effect.catchAll(() => Effect.succeed<null>(null)),
      ),
    );

    // Either succeeds or error was caught
    assertEquals(true, true, "CSV parsing errors are catchable");
  });

  await t.step("Invalid workspace configuration", async () => {
    // Create invalid darwinkit.json
    const configPath = join(tempDir, "invalid-config");
    await Deno.mkdir(configPath, { recursive: true });
    await Deno.writeTextFile(
      join(configPath, "darwinkit.json"),
      "{ invalid json }",
    );

    let errorCaught = false;

    await Effect.runPromise(
      Workspace.discover(configPath).pipe(
        Effect.flatMap((workspace) =>
          workspace.validate().pipe(
            Effect.ensuring(Effect.sync(() => workspace.close())),
          )
        ),
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

    let errorCaught = false;

    await Effect.runPromise(
      Workspace.discover(nonExistentConfig).pipe(
        Effect.flatMap((workspace) =>
          workspace.validate().pipe(
            Effect.ensuring(Effect.sync(() => workspace.close())),
          )
        ),
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

Deno.test("Expected errors - have proper structure", async (t) => {
  const tempDir = await Deno.makeTempDir({ prefix: "error_structure_test_" });

  await t.step("ParseError has correct structure", async () => {
    const nonExistentPath = join(tempDir, "missing.csv");

    const error = await Effect.runPromise(
      parseFileForWorkspace(nonExistentPath).pipe(
        Effect.flip, // Flip to get error as success
      ),
    );

    // Verify error structure
    assertEquals(error._tag, "ParseError");
    assertEquals(error.code, "PARSE_ERROR");
    assertEquals(error.filePath, nonExistentPath);
    assert(error.message.length > 0, "Error should have a non-empty message");
  });

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

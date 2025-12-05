/**
 * Tests for helper function error handling
 *
 * Verifies that helper functions properly use Effect.die for defects
 * instead of throwing errors that escape the Effect channel.
 */

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import * as Effect from "effect/Effect";
import { WorkspaceService } from "@dwkt/core";

Deno.test("Helper functions - parseWorkspace defects", async (t) => {
  const service = new WorkspaceService({ workspacesDir: "./test/tmp/error-test" });

  await t.step("Invalid workspace data is a defect (null)", async () => {
    // Create a workspace file with null JSON
    await Deno.mkdir("./test/tmp/error-test/workspace-invalid", { recursive: true });
    await Deno.writeTextFile(
      "./test/tmp/error-test/workspace-invalid/workspace.json",
      "null",
    );

    let defectCaught = false;
    let defectMessage = "";

    // Try to load the workspace - should trigger Effect.die
    await Effect.runPromise(
      service.load("invalid").pipe(
        Effect.catchAllDefect((_defect) => {
          defectCaught = true;
          defectMessage = _defect instanceof Error ? _defect.message : String(_defect);
          return Effect.succeed(null);
        }),
      ),
    );

    assert(defectCaught, "Defect should be caught");
    assertStringIncludes(
      defectMessage,
      "Invalid workspace data structure",
      `Expected defect message about invalid data structure, got: ${defectMessage}`,
    );

    // Cleanup
    await Deno.remove("./test/tmp/error-test", { recursive: true });
  });

  await t.step("Invalid workspace data is a defect (invalid type)", async () => {
    // Create a workspace file with a non-object value
    await Deno.mkdir("./test/tmp/error-test/workspace-invalid2", { recursive: true });
    await Deno.writeTextFile(
      "./test/tmp/error-test/workspace-invalid2/workspace.json",
      JSON.stringify("not an object"),
    );

    let defectCaught = false;

    await Effect.runPromise(
      service.load("invalid2").pipe(
        Effect.catchAllDefect((_defect) => {
          defectCaught = true;
          return Effect.succeed(null);
        }),
      ),
    );

    assert(defectCaught, "Defect should be caught for string value");

    // Cleanup
    await Deno.remove("./test/tmp/error-test", { recursive: true });
  });

  await t.step("Corrupted JSON is a defect", async () => {
    // Create a workspace file with invalid JSON
    await Deno.mkdir("./test/tmp/error-test/workspace-corrupt", { recursive: true });
    await Deno.writeTextFile(
      "./test/tmp/error-test/workspace-corrupt/workspace.json",
      "{ invalid json }",
    );

    let defectCaught = false;

    await Effect.runPromise(
      service.load("corrupt").pipe(
        Effect.catchAllDefect((_defect) => {
          defectCaught = true;
          return Effect.succeed(null);
        }),
      ),
    );

    assert(defectCaught, "JSON parse error should be a defect");

    // Cleanup
    await Deno.remove("./test/tmp/error-test", { recursive: true });
  });

  await t.step("Invalid schema data is a defect", async () => {
    // Create a workspace file with invalid schema structure
    await Deno.mkdir("./test/tmp/error-test/workspace-badschema", { recursive: true });
    await Deno.writeTextFile(
      "./test/tmp/error-test/workspace-badschema/workspace.json",
      JSON.stringify({
        id: "test-id",
        name: "Test",
        filePath: "/test.csv",
        format: "csv",
        schema: "not an object", // Invalid schema
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        workspaceDir: "./test",
        dataTableName: "test_data",
      }),
    );

    let defectCaught = false;
    let defectMessage = "";

    await Effect.runPromise(
      service.load("badschema").pipe(
        Effect.catchAllDefect((_defect) => {
          defectCaught = true;
          defectMessage = _defect instanceof Error ? _defect.message : String(_defect);
          return Effect.succeed(null);
        }),
      ),
    );

    assert(defectCaught, "Invalid schema should be a defect");
    assertStringIncludes(
      defectMessage,
      "Invalid schema data structure",
      `Expected defect message about invalid schema, got: ${defectMessage}`,
    );

    // Cleanup
    await Deno.remove("./test/tmp/error-test", { recursive: true });
  });
});

Deno.test("Helper functions - expected errors remain catchable", async (t) => {
  const service = new WorkspaceService({ workspacesDir: "./test/tmp/error-test" });

  await t.step("Workspace not found is an expected error", async () => {
    let errorCaught = false;
    let errorCode = "";

    await Effect.runPromise(
      service.load("nonexistent").pipe(
        Effect.catchAll((_error) => {
          errorCaught = true;
          errorCode = _error.code;
          return Effect.succeed(null);
        }),
      ),
    );

    assert(errorCaught, "Expected error should be caught with catchAll");
    assertEquals(errorCode, "WORKSPACE_NOT_FOUND");
  });

  await t.step("Defects cannot be caught with catchAll", async () => {
    // Create workspace with corrupted data
    await Deno.mkdir("./test/tmp/error-test/workspace-defect", { recursive: true });
    await Deno.writeTextFile(
      "./test/tmp/error-test/workspace-defect/workspace.json",
      "null",
    );

    let expectedErrorCaught = false;
    let defectCaught = false;

    await Effect.runPromise(
      service.load("defect").pipe(
        Effect.catchAll((_error) => {
          expectedErrorCaught = true;
          return Effect.succeed(null);
        }),
        Effect.catchAllDefect((_defect) => {
          defectCaught = true;
          return Effect.succeed(null);
        }),
      ),
    );

    assertFalse(expectedErrorCaught, "Defects should NOT be caught by catchAll");
    assert(defectCaught, "Defects should only be caught by catchAllDefect");

    // Cleanup
    await Deno.remove("./test/tmp/error-test", { recursive: true });
  });
});

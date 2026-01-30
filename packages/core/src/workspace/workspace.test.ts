import { assert, assertEquals } from "@std/assert";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import { Workspace } from "./workspace.ts";

Deno.test("Workspace.open fails with clear error when config file path doesn't exist", async () => {
  const result = await Effect.runPromiseExit(
    Effect.scoped(
      Workspace.open("./nonexistent-config.yaml"),
    ),
  );

  assert(Exit.isFailure(result));
  const error = Cause.failureOption(result.cause);
  assert(Option.isSome(error));
  assertEquals(error.value._tag, "ConfigNotFoundError");

  // User should see a message indicating the specific path wasn't found
  assert(
    error.value.message.includes("nonexistent-config.yaml"),
    `Expected message to include the file path, got: ${error.value.message}`,
  );
});

Deno.test("Workspace.open searches for darwinkit.yaml when given a directory path", async () => {
  const result = await Effect.runPromiseExit(
    Effect.scoped(
      Workspace.open("./nonexistent-directory"),
    ),
  );

  assert(Exit.isFailure(result));
  const error = Cause.failureOption(result.cause);
  assert(Option.isSome(error));
  assertEquals(error.value._tag, "ConfigNotFoundError");

  // User should see that we searched for darwinkit.yaml
  assert(
    error.value.message.includes("darwinkit.yaml"),
    `Expected message to mention darwinkit.yaml, got: ${error.value.message}`,
  );
});

Deno.test("Workspace.open succeeds with existing config file", async () => {
  const result = await Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        const workspace = yield* Workspace.open(
          "./test/example-config/darwinkit.yaml",
        );
        return workspace.name;
      }),
    ),
  );

  assert(Exit.isSuccess(result));
  assertEquals(result.value, "FC2022 Marine Biodiversity Dataset");
});

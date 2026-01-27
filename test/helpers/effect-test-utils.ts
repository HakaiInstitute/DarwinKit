/**
 * Effect Test Utilities
 *
 * Reusable helpers for testing Effect-based code with tagged errors.
 * Provides cleaner, more idiomatic patterns than manual Exit checking and instanceof.
 *
 * Logging is suppressed in tests by default.
 */

import type { CoreErrorTag } from "@dwkt/core";
import { SilentLogLevel } from "@dwkt/core";
import type { ValidationViolationTag } from "@dwkt/domain";
import { assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";
import * as Either from "effect/Either";

/**
 * Run an Effect with silent logging (suppresses all log output in tests).
 *
 * Use this instead of Effect.runPromise to keep test output clean.
 * The test helpers (expectError, expectSuccess, expectAnyError) use this automatically.
 */
export function runPromise<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(SilentLogLevel)));
}

/**
 * Union type of all known error tags for autocomplete support
 *
 * Import this type and use it with type annotations to get IDE autocomplete:
 * ```typescript
 * import type { KnownErrorTag } from "test/helpers/effect-test-utils.ts";
 *
 * const tag: KnownErrorTag = "CsvReadError";  // ← Autocomplete works!
 * await expectError(effect, tag, (error) => { ... });
 * ```
 */
export type KnownErrorTag = CoreErrorTag | ValidationViolationTag;

/**
 * Assert that an Effect fails with a specific tagged error
 *
 * Uses Effect.either for clean error handling instead of instanceof checks.
 * The error parameter in the assertions callback is automatically typed!
 *
 * @param effect - The Effect to test
 * @param tag - The error tag to check (e.g., "CsvReadError")
 * @param assertions - Callback with assertions on the error
 *
 * @example Basic usage (type inference from Effect):
 * ```typescript
 * await expectError(
 *   readCsvFieldValue(path, 1, "nonExistentField"),
 *   "CsvReadError",  // ← TypeScript infers this is valid
 *   (error) => {
 *     // error is automatically typed as CsvReadError!
 *     assertEquals(error.fieldName, "nonExistentField");
 *     assertEquals(Array.isArray(error.availableFields), true);
 *   }
 * );
 * ```
 *
 * @example With autocomplete (use type annotation):
 * ```typescript
 * const tag: KnownErrorTag = "CsvReadError";  // ← IDE autocomplete!
 * await expectError(effect, tag, (error) => { ... });
 * ```
 */
export async function expectError<E extends { _tag: string }, A>(
  effect: Effect.Effect<A, E>,
  tag: E["_tag"],
  assertions: (error: E) => void,
): Promise<void> {
  const result = await runPromise(Effect.either(effect));

  assertEquals(
    Either.isLeft(result),
    true,
    `Expected error with tag "${tag}" but got success`,
  );

  if (Either.isLeft(result)) {
    const error = result.left;
    assertEquals(
      error._tag,
      tag,
      `Expected error tag "${tag}" but got "${error._tag}"`,
    );

    assertions(error);
  }
}

/**
 * Assert that an Effect succeeds with a specific value
 *
 * Cleaner alternative to Effect.runPromise for tests that need to assert on success.
 *
 * @param effect - The Effect to test
 * @param assertions - Callback with assertions on the success value
 *
 * @example
 * ```typescript
 * await expectSuccess(
 *   readCsvFieldValue(path, 1, "eventID"),
 *   (value) => {
 *     assertEquals(value, "E001");
 *   }
 * );
 * ```
 */
export async function expectSuccess<E, A>(
  effect: Effect.Effect<A, E>,
  assertions: (value: A) => void,
): Promise<void> {
  const value = await runPromise(effect);
  assertions(value);
}

/**
 * Assert that an Effect fails with any error (regardless of tag)
 *
 * Useful when you don't care about the specific error type, just that it failed.
 *
 * @param effect - The Effect to test
 * @param assertions - Optional callback with assertions on the error
 *
 * @example
 * ```typescript
 * await expectAnyError(
 *   readCsvFieldValue(path, 999, "eventID"),
 *   (error) => {
 *     assertEquals(error.message.includes("not found"), true);
 *   }
 * );
 * ```
 */
export async function expectAnyError<E, A>(
  effect: Effect.Effect<A, E>,
  assertions?: (error: E) => void,
): Promise<void> {
  const result = await runPromise(Effect.either(effect));

  assertEquals(
    Either.isLeft(result),
    true,
    "Expected error but got success",
  );

  if (Either.isLeft(result) && assertions) {
    assertions(result.left);
  }
}

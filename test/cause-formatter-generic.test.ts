/**
 * Test demonstrating the generic nature of cause-formatter utilities
 *
 * This shows how prettyPrintCause and createMultiErrorFormatter can be
 * used with any error types, not just config errors.
 */

import { assertStringIncludes } from "@std/assert";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Data from "effect/Data";

import { createMultiErrorFormatter, prettyPrintCause } from "@dwkt/domain";

// Example: Create some custom error types for a hypothetical API
// Using Data.TaggedError for proper Error extension and stack traces
class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly message: string;
  readonly statusCode: number;
  readonly endpoint: string;
}> {}

class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly fieldName: string;
  readonly invalidValue: string;
}> {}

class AuthError extends Data.TaggedError("AuthError")<{
  readonly message: string;
  readonly attemptedAction: string;
}> {}

Deno.test("Generic Cause Formatter - Works with any error types", async (t) => {
  await t.step("Format custom API errors", async () => {
    // Create a custom formatter for our API errors
    const formatApiError = createMultiErrorFormatter<
      NetworkError | ValidationError | AuthError
    >(
      [
        [
          NetworkError,
          (error: NetworkError) =>
            `Network request failed:\n  Endpoint: ${error.endpoint}\n  Status: ${error.statusCode}\n  Message: ${error.message}`,
        ],
        [
          ValidationError,
          (error: ValidationError) =>
            `Validation failed:\n  Field: ${error.fieldName}\n  Invalid value: "${error.invalidValue}"\n  ${error.message}`,
        ],
        [
          AuthError,
          (error: AuthError) =>
            `Authorization failed:\n  Action: ${error.attemptedAction}\n  ${error.message}`,
        ],
      ],
    );

    // Simulate a network error
    const apiCall = Effect.fail(
      new NetworkError({
        message: "Connection timeout",
        statusCode: 504,
        endpoint: "/api/users",
      }),
    );

    const result = await Effect.runPromiseExit(apiCall);

    if (Exit.isFailure(result)) {
      const formatted = prettyPrintCause(result.cause, formatApiError);

      assertStringIncludes(formatted, "Network request failed");
      assertStringIncludes(formatted, "/api/users");
      assertStringIncludes(formatted, "504");
    }
  });

  await t.step("Format validation errors", async () => {
    const formatApiError = createMultiErrorFormatter<
      NetworkError | ValidationError | AuthError
    >([
      [
        ValidationError,
        (error: ValidationError) =>
          `Field '${error.fieldName}' has invalid value: "${error.invalidValue}"`,
      ],
    ]);

    const validation = Effect.fail(
      new ValidationError({
        message: "Must be a valid email address",
        fieldName: "email",
        invalidValue: "not-an-email",
      }),
    );

    const result = await Effect.runPromiseExit(validation);

    if (Exit.isFailure(result)) {
      const formatted = prettyPrintCause(result.cause, formatApiError);

      assertStringIncludes(formatted, "email");
      assertStringIncludes(formatted, "not-an-email");
    }
  });

  await t.step("Format multiple errors at once", async () => {
    const formatApiError = createMultiErrorFormatter<
      NetworkError | ValidationError | AuthError
    >([
      [
        ValidationError,
        (error: ValidationError) => `Invalid ${error.fieldName}: ${error.message}`,
      ],
    ]);

    // Simulate multiple validation errors
    const emailValidation = Effect.fail(
      new ValidationError({
        message: "Must be a valid email",
        fieldName: "email",
        invalidValue: "bad-email",
      }),
    );

    const passwordValidation = Effect.fail(
      new ValidationError({
        message: "Must be at least 8 characters",
        fieldName: "password",
        invalidValue: "short",
      }),
    );

    // Run both validations and collect errors
    const result = await Effect.runPromiseExit(
      Effect.all([emailValidation, passwordValidation], {
        concurrency: "unbounded",
      }),
    );

    if (Exit.isFailure(result)) {
      const formatted = prettyPrintCause(result.cause, formatApiError);

      // Should show both errors
      assertStringIncludes(formatted, "email");
      assertStringIncludes(formatted, "password");
      assertStringIncludes(formatted, "Multiple errors");
    }
  });

  await t.step(
    "Simple formatter without createMultiErrorFormatter",
    async () => {
      // You can also use prettyPrintCause with a simple inline formatter
      const simpleError = Effect.fail(
        new NetworkError({
          message: "Server error",
          statusCode: 500,
          endpoint: "/api/data",
        }),
      );

      const result = await Effect.runPromiseExit(simpleError);

      if (Exit.isFailure(result)) {
        // Just pass a function directly
        const formatted = prettyPrintCause(result.cause, (error) => {
          if (error instanceof NetworkError) {
            return `API Error ${error.statusCode}: ${error.message}`;
          }
          return String(error);
        });

        assertStringIncludes(formatted, "API Error 500");
      }
    },
  );
});

Deno.test("Generic Cause Formatter - Reusability across domains", async (t) => {
  await t.step("Database errors", async () => {
    // Example: Database-specific errors
    class ConnectionError extends Data.TaggedError("ConnectionError")<{
      readonly host: string;
      readonly port: number;
    }> {}

    class QueryError extends Data.TaggedError("QueryError")<{
      readonly query: string;
    }> {}

    const formatDbError = createMultiErrorFormatter<
      ConnectionError | QueryError
    >([
      [
        ConnectionError,
        (e: ConnectionError) => `Failed to connect to database at ${e.host}:${e.port}`,
      ],
      [
        QueryError,
        (e: QueryError) => `Query failed [${e._tag}]:\n  ${e.query}`,
      ],
    ]);

    const dbOperation = Effect.fail(
      new ConnectionError({ host: "localhost", port: 5432 }),
    );

    const result = await Effect.runPromiseExit(dbOperation);

    if (Exit.isFailure(result)) {
      const formatted = prettyPrintCause(result.cause, formatDbError);

      assertStringIncludes(formatted, "localhost:5432");
    }
  });

  await t.step("File system errors", async () => {
    // Example: File system errors
    class FileNotFoundError extends Data.TaggedError("FileNotFoundError")<{
      readonly path: string;
    }> {}

    class PermissionError extends Data.TaggedError("PermissionError")<{
      readonly path: string;
      readonly operation: string;
    }> {}

    const formatFsError = createMultiErrorFormatter<
      FileNotFoundError | PermissionError
    >([
      [
        FileNotFoundError,
        (e: FileNotFoundError) => `File not found: ${e.path}`,
      ],
      [
        PermissionError,
        (e: PermissionError) => `Permission denied: Cannot ${e.operation} ${e.path}`,
      ],
    ]);

    const fileOp = Effect.fail(
      new PermissionError({
        path: "/etc/secret.conf",
        operation: "read",
      }),
    );

    const result = await Effect.runPromiseExit(fileOp);

    if (Exit.isFailure(result)) {
      const formatted = prettyPrintCause(result.cause, formatFsError);

      assertStringIncludes(formatted, "Permission denied");
      assertStringIncludes(formatted, "/etc/secret.conf");
    }
  });
});

Deno.test("createMultiErrorFormatter - Fallback behavior", async (t) => {
  await t.step("Uses default formatter for unknown error types", async () => {
    class KnownError extends Data.TaggedError("KnownError")<{
      readonly message: string;
    }> {}

    class UnknownError extends Data.TaggedError("UnknownError")<{
      readonly data: string;
    }> {}

    // Only provide formatter for KnownError, use default for others
    const formatter = createMultiErrorFormatter<KnownError | UnknownError>(
      [
        [KnownError, (e: KnownError) => `Known: ${e.message}`],
      ],
      (e) => `Unexpected error type: ${JSON.stringify(e)}`,
    );

    // Test with known error
    const knownResult = await Effect.runPromiseExit(
      Effect.fail(new KnownError({ message: "test" })),
    );

    if (Exit.isFailure(knownResult)) {
      const formatted = prettyPrintCause(knownResult.cause, formatter);
      assertStringIncludes(formatted, "Known: test");
    }

    // Test with unknown error
    const unknownResult = await Effect.runPromiseExit(
      Effect.fail(new UnknownError({ data: "mystery" })),
    );

    if (Exit.isFailure(unknownResult)) {
      const formatted = prettyPrintCause(unknownResult.cause, formatter);
      assertStringIncludes(formatted, "Unexpected error type");
    }
  });
});

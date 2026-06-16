import { assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";
import { scopedConnection } from "./connection.ts";

Deno.test("scopedConnection - yields a usable connection within a scope", async () => {
  const rows = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* scopedConnection;
        const result = yield* Effect.tryPromise(() => connection.runAndReadAll("SELECT 1 AS one"))
          .pipe(Effect.orDie);
        return result.getRowObjectsJson();
      }),
    ),
  );
  assertEquals(rows[0].one, 1);
});

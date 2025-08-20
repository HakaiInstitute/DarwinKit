import { assertEquals, assertObjectMatch, assertThrows } from "@std/assert";

// Example of proper Deno test syntax
Deno.test("Basic assertions work correctly", () => {
  assertEquals(1 + 1, 2);
  assertEquals("hello".toUpperCase(), "HELLO");
});

Deno.test("Object matching works", () => {
  const obj = { name: "test", value: 42, extra: "data" };

  assertObjectMatch(obj, {
    name: "test",
    value: 42,
  });
});

Deno.test("Error throwing works", () => {
  assertThrows(
    () => {
      throw new Error("Test error");
    },
    Error,
    "Test error",
  );
});

Deno.test("Async test example", async () => {
  const result = await Promise.resolve("async result");
  assertEquals(result, "async result");
});

// Example testing a simple function
function add(a: number, b: number): number {
  return a + b;
}

Deno.test("Function testing example", () => {
  assertEquals(add(2, 3), 5);
  assertEquals(add(-1, 1), 0);
  assertEquals(add(0, 0), 0);
});

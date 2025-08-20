import { assertEquals } from "@std/assert";

Deno.test("Simple test to verify Deno test runner works", () => {
  assertEquals(1 + 1, 2);
});

Deno.test("Another simple test", () => {
  const result = "hello".toUpperCase();
  assertEquals(result, "HELLO");
});

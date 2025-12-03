/**
 * Tests for validation violation types
 */

import { assertEquals } from "@std/assert";
import { enforcementToSeverity } from "./validation-violation.ts";
import { ErrorSeverity } from "../errors/severity.ts";

Deno.test("enforcementToSeverity - maps required to ERROR", () => {
  assertEquals(enforcementToSeverity("required"), ErrorSeverity.ERROR);
});

Deno.test("enforcementToSeverity - maps recommended to WARNING", () => {
  assertEquals(enforcementToSeverity("recommended"), ErrorSeverity.WARNING);
});

Deno.test("enforcementToSeverity - maps optional to INFO", () => {
  assertEquals(enforcementToSeverity("optional"), ErrorSeverity.INFO);
});

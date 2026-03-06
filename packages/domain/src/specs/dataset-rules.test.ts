import { assertEquals } from "@std/assert";
import { DependencyRule } from "./dataset-rules.ts";

Deno.test("DependencyRule - unconditional oneOf (replaces OneOfRequiredRule)", () => {
  const rule = new DependencyRule({
    require: { oneOf: ["eventID", "occurrenceID"] },
    level: "required",
  });
  assertEquals(rule._tag, "dependency");
  assertEquals(rule.require, { oneOf: ["eventID", "occurrenceID"] });
  assertEquals(rule.level, "required");
  assertEquals(rule.when, undefined);
  assertEquals(rule.sourceDataset, undefined);
});

Deno.test("DependencyRule - presence-triggered allOf", () => {
  const rule = new DependencyRule({
    sourceDataset: "occurrences",
    when: "decimalLatitude",
    require: ["decimalLongitude", "geodeticDatum"],
    level: "required",
  });
  assertEquals(rule.when, "decimalLatitude");
  assertEquals(rule.require, ["decimalLongitude", "geodeticDatum"]);
});

Deno.test("DependencyRule - value-conditional with equals", () => {
  const rule = new DependencyRule({
    sourceDataset: "occurrences",
    when: { field: "basisOfRecord", equals: "PreservedSpecimen" },
    require: ["catalogNumber", "preparations"],
    level: "required",
  });
  assertEquals(rule.when, { field: "basisOfRecord", equals: "PreservedSpecimen" });
});

Deno.test("DependencyRule - value-conditional with in", () => {
  const rule = new DependencyRule({
    sourceDataset: "occurrences",
    when: { field: "basisOfRecord", in: ["PreservedSpecimen", "FossilSpecimen"] },
    require: ["catalogNumber"],
    level: "required",
  });
  assertEquals(rule.when, { field: "basisOfRecord", in: ["PreservedSpecimen", "FossilSpecimen"] });
});

Deno.test("DependencyRule - defaults level to required", () => {
  const rule = new DependencyRule({
    require: ["catalogNumber"],
    level: "required",
  });
  assertEquals(rule.level, "required");
});

Deno.test("DependencyRule - custom message", () => {
  const rule = new DependencyRule({
    require: { oneOf: ["eventID", "occurrenceID"] },
    level: "required",
    message: "Custom message",
  });
  assertEquals(rule.message, "Custom message");
});

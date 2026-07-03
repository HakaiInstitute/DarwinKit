import { assertEquals } from "@std/assert";
import {
  type DatasetShape,
  inferForeignKeyRules,
  orderByForeignKeyDependencies,
} from "./dwc-relations.ts";

const shape = (name: string, cls: string, columns: string[]): DatasetShape => ({
  name,
  class: cls,
  columns,
});

Deno.test("infers occurrence.eventID -> event.eventID when unambiguous", () => {
  const { rules, conflicts } = inferForeignKeyRules([
    shape("events", "Event", ["eventID", "decimalLatitude"]),
    shape("occ", "Occurrence", ["occurrenceID", "eventID"]),
  ]);
  assertEquals(conflicts, []);
  assertEquals(rules, [{
    ruleType: "foreignKey",
    sourceDataset: "occ",
    sourceField: "eventID",
    targetDataset: "events",
    targetField: "eventID",
    requirement: "required",
  }]);
});

Deno.test("infers eMoF references to both event and occurrence", () => {
  const { rules } = inferForeignKeyRules([
    shape("events", "Event", ["eventID"]),
    shape("occ", "Occurrence", ["occurrenceID"]),
    shape("emof", "ExtendedMeasurementOrFact", ["measurementID", "eventID", "occurrenceID"]),
  ]);
  const pairs = rules.map((r) => `${r.sourceField}->${r.targetDataset}`).sort();
  assertEquals(pairs, ["eventID->events", "occurrenceID->occ"]);
});

Deno.test("does not infer when the source lacks the reference column", () => {
  const { rules } = inferForeignKeyRules([
    shape("events", "Event", ["eventID"]),
    shape("occ", "Occurrence", ["occurrenceID"]), // no eventID column
  ]);
  assertEquals(rules, []);
});

Deno.test("does not infer when there is no target dataset for the class", () => {
  const { rules } = inferForeignKeyRules([
    shape("occ", "Occurrence", ["occurrenceID", "eventID"]), // no Event dataset
  ]);
  assertEquals(rules, []);
});

Deno.test("infers parentEventID self-reference within Event", () => {
  const { rules } = inferForeignKeyRules([
    shape("events", "Event", ["eventID", "parentEventID"]),
  ]);
  assertEquals(rules, [{
    ruleType: "foreignKey",
    sourceDataset: "events",
    sourceField: "parentEventID",
    targetDataset: "events",
    targetField: "eventID",
    requirement: "required",
  }]);
});

Deno.test("does not infer parentEventID when the column is absent", () => {
  const { rules } = inferForeignKeyRules([
    shape("events", "Event", ["eventID"]), // no parentEventID column
  ]);
  assertEquals(rules, []);
});

Deno.test("reports a conflict when two datasets share the target class", () => {
  const { rules, conflicts } = inferForeignKeyRules([
    shape("events_a", "Event", ["eventID"]),
    shape("events_b", "Event", ["eventID"]),
    shape("occ", "Occurrence", ["occurrenceID", "eventID"]),
  ]);
  assertEquals(rules, []);
  assertEquals(conflicts, [{
    sourceDataset: "occ",
    sourceField: "eventID",
    targetClass: "Event",
    candidates: ["events_a", "events_b"],
  }]);
});

Deno.test("user-declared foreignKey suppresses inference and its conflict", () => {
  const { rules, conflicts } = inferForeignKeyRules(
    [
      shape("events_a", "Event", ["eventID"]),
      shape("events_b", "Event", ["eventID"]),
      shape("occ", "Occurrence", ["occurrenceID", "eventID"]),
    ],
    [{ ruleType: "foreignKey", sourceDataset: "occ", sourceField: "eventID" }],
  );
  assertEquals(rules, []);
  assertEquals(conflicts, []);
});

Deno.test("orders targets before sources (topological)", () => {
  const order = orderByForeignKeyDependencies(
    ["emof", "occ", "events"],
    [
      { sourceDataset: "occ", targetDataset: "events" },
      { sourceDataset: "emof", targetDataset: "events" },
      { sourceDataset: "emof", targetDataset: "occ" },
    ],
  );
  assertEquals(order, ["events", "occ", "emof"]);
});

Deno.test("ordering ignores self-references and is stable for independent nodes", () => {
  const order = orderByForeignKeyDependencies(
    ["events", "taxa"],
    [{ sourceDataset: "events", targetDataset: "events" }],
  );
  assertEquals(order, ["events", "taxa"]);
});

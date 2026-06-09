import { assert, assertExists, assertNotEquals } from "@std/assert";
import { makeWorkspaceConfig } from "@dwkt/domain/schemas";

Deno.test("makeWorkspaceConfig generates a distinct id per call (Effect.sync, not cached)", () => {
  const minimalInput = {
    validation: {
      datasets: [
        { name: "events", class: "Event", path: "./events.csv", fieldMappings: [] },
      ],
    },
  };

  const a = makeWorkspaceConfig(minimalInput);
  const b = makeWorkspaceConfig(minimalInput);

  assertExists(a.id);
  assertExists(b.id);
  assertNotEquals(a.id, b.id, "each config must get a freshly generated UUID");
});

Deno.test("makeWorkspaceConfig generates a distinct createdAt per call (Effect.sync, not cached)", async () => {
  const minimalInput = {
    validation: {
      datasets: [
        { name: "events", class: "Event", path: "./events.csv", fieldMappings: [] },
      ],
    },
  };

  const a = makeWorkspaceConfig(minimalInput);
  // Ensure the wall clock advances so two fresh `new Date()` defaults differ.
  await new Promise((resolve) => setTimeout(resolve, 5));
  const b = makeWorkspaceConfig(minimalInput);

  assert(a.createdAt instanceof Date, "createdAt should be a Date");
  assert(b.createdAt instanceof Date, "createdAt should be a Date");
  assertNotEquals(
    a.createdAt.getTime(),
    b.createdAt.getTime(),
    "each config must get a freshly evaluated timestamp",
  );
});

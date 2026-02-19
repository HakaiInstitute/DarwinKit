/**
 * Tests for workspace-config schema helper functions.
 */

import { assertEquals, assertExists, assertNotEquals, assertThrows } from "@std/assert";
import { makeWorkspaceConfig, type WorkspaceConfigInput } from "./workspace-config.ts";

const DEFAULT_NULL_VALUES = ["NA", "N/A", "", "NULL", "null"];

Deno.test("makeWorkspaceConfig", async (t) => {
  await t.step("applies defaults for omitted fields", () => {
    const before = new Date();
    const config1 = makeWorkspaceConfig({ validation: {} });
    const config2 = makeWorkspaceConfig({ validation: {} });
    const after = new Date();

    // Unique ID generation
    assertExists(config1.id);
    assertNotEquals(config1.id, config2.id);

    // Scalar defaults
    assertEquals(config1.name, "Workspace");
    assertEquals(config1.version, "1.0.0");

    // Date defaults (within test execution window)
    assertEquals(config1.createdAt >= before && config1.createdAt <= after, true);
    assertEquals(config1.updatedAt >= before && config1.updatedAt <= after, true);

    // Optional fields remain undefined
    assertEquals(config1.description, undefined);
    assertEquals(config1.crossDatasetRules, undefined);
    assertEquals(config1.transform, undefined);
  });

  await t.step("uses provided values instead of defaults", () => {
    const customDate = new Date("2024-01-15T00:00:00.000Z");
    const config = makeWorkspaceConfig({
      id: "custom-id",
      name: "My Workspace",
      version: "2.0.0",
      createdAt: customDate.toISOString(),
      updatedAt: customDate.toISOString(),
      description: "Test description",
      validation: {},
      crossDatasetRules: [
        {
          ruleType: "foreignKey",
          sourceDataset: "a",
          sourceField: "id",
          targetDataset: "b",
          targetField: "id",
        },
      ],
    });

    assertEquals(config.id, "custom-id");
    assertEquals(config.name, "My Workspace");
    assertEquals(config.version, "2.0.0");
    assertEquals(config.createdAt, customDate);
    assertEquals(config.description, "Test description");
    assertEquals(config.crossDatasetRules?.length, 1);
  });

  await t.step("applies validation defaults and preserves overrides", () => {
    const withDefaults = makeWorkspaceConfig({ validation: { datasets: [] } });
    const withOverrides = makeWorkspaceConfig({
      validation: { nullValues: ["CUSTOM"], failFast: true, datasets: [] },
    });

    // Defaults applied
    assertEquals(withDefaults.validation?.nullValues, DEFAULT_NULL_VALUES);
    assertEquals(withDefaults.validation?.failFast, false);
    assertEquals(withDefaults.validation?.debug, false);
    assertEquals(withDefaults.validation?.outputDir, "./output");

    // Overrides preserved, other defaults still apply
    assertEquals(withOverrides.validation?.nullValues, ["CUSTOM"]);
    assertEquals(withOverrides.validation?.failFast, true);
    assertEquals(withOverrides.validation?.debug, false);
  });

  await t.step("applies transform defaults and preserves overrides", () => {
    const baseTransform = {
      inputs: {},
      datasets: [],
      output: { outputDir: "./out", exportDB: false },
    };

    const withDefaults = makeWorkspaceConfig({ transform: baseTransform });
    const withOverrides = makeWorkspaceConfig({
      transform: { ...baseTransform, nullValues: ["CUSTOM"] },
    });

    assertEquals(withDefaults.transform?.nullValues, DEFAULT_NULL_VALUES);
    assertEquals(withOverrides.transform?.nullValues, ["CUSTOM"]);
  });

  await t.step("supports both validation and transform together", () => {
    const config = makeWorkspaceConfig({
      validation: { datasets: [] },
      transform: {
        inputs: {},
        datasets: [],
        output: { outputDir: "./out", exportDB: true },
      },
    });

    assertExists(config.validation);
    assertExists(config.transform);
    assertEquals(config.transform.output.exportDB, true);
  });
});

Deno.test("makeWorkspaceConfig - field mapping schema", async (t) => {
  await t.step("requirement field accepts valid requirement levels", () => {
    const config = makeWorkspaceConfig({
      validation: {
        datasets: [{
          name: "events",
          spec: "dwc-event",
          path: "./events.csv",
          fieldMappings: [{
            originName: "eventID",
            targetName: "eventID",
            requirement: "required",
          }],
        }],
      },
    });

    const mapping = config.validation?.datasets[0]?.fieldMappings?.[0];
    assertEquals(mapping?.originName, "eventID");
    assertEquals(mapping?.requirement, "required");
  });

  await t.step("unknown properties on field mappings are stripped by schema", () => {
    const config = makeWorkspaceConfig({
      validation: {
        datasets: [{
          name: "events",
          spec: "dwc-event",
          path: "./events.csv",
          fieldMappings: [{
            originName: "eventID",
            targetName: "eventID",
            // @ts-expect-error — intentionally passing unknown property to verify schema strips it
            bogusProperty: true,
          }],
        }],
      },
    });

    const mapping = config.validation?.datasets[0]?.fieldMappings?.[0];
    assertEquals(mapping?.originName, "eventID");
    assertEquals("bogusProperty" in (mapping ?? {}), false);
  });
});

Deno.test("makeWorkspaceConfig - invalid input", async (t) => {
  await t.step("throws when neither validation nor transform provided", () => {
    assertThrows(
      () => makeWorkspaceConfig({} as WorkspaceConfigInput),
      Error,
      "validation",
    );
  });

  await t.step("throws for invalid nested settings", () => {
    assertThrows(() =>
      makeWorkspaceConfig({
        validation: { datasets: [{ name: "incomplete" } as unknown] },
      } as WorkspaceConfigInput)
    );

    assertThrows(() => makeWorkspaceConfig({ transform: {} as unknown } as WorkspaceConfigInput));
  });
});

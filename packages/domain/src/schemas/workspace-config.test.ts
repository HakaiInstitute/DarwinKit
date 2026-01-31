/**
 * Tests for workspace-config schema helper functions.
 *
 * Verifies that makeWorkspaceConfig correctly applies default values
 * when fields are omitted, and handles various config types.
 */

import { assertEquals, assertExists, assertNotEquals, assertThrows } from "@std/assert";
import { makeWorkspaceConfig, type WorkspaceConfigInput } from "./workspace-config.ts";

const DEFAULT_NULL_VALUES = ["NA", "N/A", "", "NULL", "null"];

Deno.test("makeWorkspaceConfig", async (t) => {
  await t.step("generates unique id when omitted", () => {
    const config1 = makeWorkspaceConfig({ validation: {} });
    const config2 = makeWorkspaceConfig({ validation: {} });

    assertExists(config1.id);
    assertExists(config2.id);
    assertNotEquals(config1.id, config2.id);
  });

  await t.step("applies default name when omitted", () => {
    const config = makeWorkspaceConfig({ validation: {} });

    assertEquals(config.name, "Workspace");
  });

  await t.step("applies default version when omitted", () => {
    const config = makeWorkspaceConfig({ validation: {} });

    assertEquals(config.version, "1.0.0");
  });

  await t.step("applies default createdAt and updatedAt when omitted", () => {
    const before = new Date();
    const config = makeWorkspaceConfig({ validation: {} });
    const after = new Date();

    // Dates should be between before and after
    assertEquals(config.createdAt >= before, true);
    assertEquals(config.createdAt <= after, true);
    assertEquals(config.updatedAt >= before, true);
    assertEquals(config.updatedAt <= after, true);
  });

  await t.step("uses provided values instead of defaults", () => {
    const customDateStr = "2024-01-15T00:00:00.000Z";

    const input: WorkspaceConfigInput = {
      id: "custom-id",
      name: "My Workspace",
      version: "2.0.0",
      createdAt: customDateStr,
      updatedAt: customDateStr,
      validation: {},
    };

    const config = makeWorkspaceConfig(input);

    assertEquals(config.id, input.id);
    assertEquals(config.name, input.name);
    assertEquals(config.version, input.version);
    assertEquals(config.createdAt, new Date(customDateStr));
    assertEquals(config.updatedAt, new Date(customDateStr));
  });

  await t.step("applies validation defaults when validation provided", () => {
    const config = makeWorkspaceConfig({
      validation: {
        datasets: [
          {
            name: "events",
            spec: "dwc-event",
            path: "./events.csv",
            fieldMappings: [],
          },
        ],
      },
    });

    assertExists(config.validation);
    // Validation defaults should be applied
    assertEquals(config.validation.nullValues, DEFAULT_NULL_VALUES);
    assertEquals(config.validation.failFast, false);
    assertEquals(config.validation.debug, false);
    assertEquals(config.validation.outputDir, "./output");
  });

  await t.step("preserves validation overrides while applying other defaults", () => {
    const config = makeWorkspaceConfig({
      validation: {
        nullValues: ["CUSTOM"],
        failFast: true,
        datasets: [],
      },
    });

    assertExists(config.validation);
    // Overridden values are preserved
    assertEquals(config.validation.nullValues, ["CUSTOM"]);
    assertEquals(config.validation.failFast, true);

    // Other fields get defaults
    assertEquals(config.validation.debug, false);
    assertEquals(config.validation.outputDir, "./output");
  });

  await t.step("omits optional fields when not provided", () => {
    const config = makeWorkspaceConfig({ validation: {} });

    assertEquals(config.description, undefined);
    assertEquals(config.crossDatasetRules, undefined);
    assertEquals(config.transform, undefined);
  });

  await t.step("includes optional fields when provided", () => {
    const config = makeWorkspaceConfig({
      description: "Test description",
      validation: {},
      crossDatasetRules: [
        {
          ruleType: "foreignKey",
          sourceDataset: "occurrences",
          sourceField: "eventID",
          targetDataset: "events",
          targetField: "eventID",
        },
      ],
    });

    assertEquals(config.description, "Test description");
    assertExists(config.crossDatasetRules);
    assertEquals(config.crossDatasetRules.length, 1);
  });
});

Deno.test("makeWorkspaceConfig - transform-only config", async (t) => {
  await t.step("creates config with transform settings only", () => {
    const config = makeWorkspaceConfig({
      transform: {
        inputs: { events: "./events.csv" },
        datasets: [
          {
            name: "events",
            profile: "obis-event",
          },
        ],
        output: {
          outputDir: "./output",
          exportDB: true,
        },
      },
    });

    assertExists(config.transform);
    assertEquals(config.validation, undefined);
    assertEquals(config.transform.datasets.length, 1);
    assertEquals(config.transform.output.exportDB, true);
  });

  await t.step("applies transform nullValues default", () => {
    const config = makeWorkspaceConfig({
      transform: {
        inputs: {},
        datasets: [],
        output: {
          outputDir: "./output",
          exportDB: false,
        },
      },
    });

    assertExists(config.transform);
    assertEquals(config.transform.nullValues, DEFAULT_NULL_VALUES);
  });

  await t.step("preserves transform nullValues when provided", () => {
    const config = makeWorkspaceConfig({
      transform: {
        nullValues: ["CUSTOM", "NA"],
        inputs: {},
        datasets: [],
        output: {
          outputDir: "./output",
          exportDB: false,
        },
      },
    });

    assertExists(config.transform);
    assertEquals(config.transform.nullValues, ["CUSTOM", "NA"]);
  });
});

Deno.test("makeWorkspaceConfig - both validation and transform", async (t) => {
  await t.step("creates config with both validation and transform", () => {
    const config = makeWorkspaceConfig({
      validation: {
        datasets: [],
      },
      transform: {
        inputs: {},
        datasets: [],
        output: {
          outputDir: "./output",
          exportDB: false,
        },
      },
    });

    assertExists(config.validation);
    assertExists(config.transform);
  });
});

Deno.test("makeWorkspaceConfig - invalid input", async (t) => {
  await t.step("throws ParseError when neither validation nor transform provided", () => {
    assertThrows(
      () => makeWorkspaceConfig({} as WorkspaceConfigInput),
      Error,
      "validation",
    );
  });

  await t.step("throws ParseError for invalid validation settings", () => {
    assertThrows(
      () =>
        makeWorkspaceConfig({
          validation: {
            datasets: [
              {
                // Missing required fields: spec, path, fieldMappings
                name: "incomplete",
              } as unknown,
            ],
          },
        } as WorkspaceConfigInput),
      Error,
    );
  });

  await t.step("throws ParseError for invalid transform settings", () => {
    assertThrows(
      () =>
        makeWorkspaceConfig({
          transform: {
            // Missing required fields: inputs, datasets, output
          } as unknown,
        } as WorkspaceConfigInput),
      Error,
    );
  });
});

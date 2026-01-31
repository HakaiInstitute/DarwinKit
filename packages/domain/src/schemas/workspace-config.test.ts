/**
 * Tests for workspace-config schema helper functions.
 *
 * Verifies that makeValidationSettings and makeWorkspaceConfig correctly
 * apply default values when fields are omitted.
 */

import { assertEquals, assertExists, assertNotEquals } from "@std/assert";
import {
  makeValidationSettings,
  makeWorkspaceConfig,
  type ValidationSettingsInput,
  type WorkspaceConfigInput,
} from "./workspace-config.ts";

const DEFAULT_NULL_VALUES = ["NA", "N/A", "", "NULL", "null"];

Deno.test("makeValidationSettings", async (t) => {
  await t.step("applies default nullValues when omitted", () => {
    const settings = makeValidationSettings({});

    assertEquals(settings.nullValues, DEFAULT_NULL_VALUES);
  });

  await t.step("applies default failFast when omitted", () => {
    const settings = makeValidationSettings({});

    assertEquals(settings.failFast, false);
  });

  await t.step("applies default debug when omitted", () => {
    const settings = makeValidationSettings({});

    assertEquals(settings.debug, false);
  });

  await t.step("applies default outputDir when omitted", () => {
    const settings = makeValidationSettings({});

    assertEquals(settings.outputDir, "./output");
  });

  await t.step("applies default datasets when omitted", () => {
    const settings = makeValidationSettings({});

    assertEquals(settings.datasets, []);
  });

  await t.step("uses provided values instead of defaults", () => {
    const input: ValidationSettingsInput = {
      nullValues: ["EMPTY"],
      failFast: true,
      debug: true,
      outputDir: "./custom-output",
      datasets: [
        {
          name: "test",
          spec: "dwc-event",
          path: "./test.csv",
          fieldMappings: [],
        },
      ],
    };

    const settings = makeValidationSettings(input);

    assertEquals(settings.nullValues, ["EMPTY"]);
    assertEquals(settings.failFast, true);
    assertEquals(settings.debug, true);
    assertEquals(settings.outputDir, "./custom-output");
    assertEquals(settings.datasets.length, 1);
    assertEquals(settings.datasets[0].name, "test");
  });

  await t.step("applies defaults for omitted fields while preserving provided values", () => {
    const input: ValidationSettingsInput = {
      failFast: true,
      datasets: [
        {
          name: "events",
          spec: "dwc-event",
          path: "./events.csv",
          fieldMappings: [],
        },
      ],
    };

    const settings = makeValidationSettings(input);

    // Provided values are preserved
    assertEquals(settings.failFast, true);
    assertEquals(settings.datasets.length, 1);

    // Omitted fields get defaults
    assertEquals(settings.nullValues, DEFAULT_NULL_VALUES);
    assertEquals(settings.debug, false);
    assertEquals(settings.outputDir, "./output");
  });
});

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

    assertExists(config.createdAt);
    assertExists(config.updatedAt);

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

    assertEquals(config.id, "custom-id");
    assertEquals(config.name, "My Workspace");
    assertEquals(config.version, "2.0.0");
    assertEquals(config.createdAt, new Date(customDateStr));
    assertEquals(config.updatedAt, new Date(customDateStr));
  });

  await t.step("applies validation defaults through nested makeValidationSettings", () => {
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

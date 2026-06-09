/**
 * Tests for workspace-config schema helper functions.
 */

import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import {
  decodeWorkspaceConfig,
  decodeWorkspaceConfigEffect,
  formatConfigValidationErrors,
  makeWorkspaceConfig,
  type WorkspaceConfigInput,
  workspaceConfigSchema,
} from "./workspace-config.ts";

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
    assertEquals(config1.datasetRules, undefined);
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
      datasetRules: [
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
    assertEquals(config.datasetRules?.length, 1);
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
          class: "Event",
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
          class: "Event",
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
  await t.step("fails when neither validation nor transform provided", () => {
    // decodeUnknownSync throws a SchemaError (not an `instanceof Error`), which makes the
    // `assertThrows(fn, ErrorClass, msgIncludes)` overload — the only one that checks the
    // message — unusable. Decode to a Result instead so we can narrow the typed error and
    // assert on its message directly.
    const result = S.decodeUnknownResult(workspaceConfigSchema)({});
    assert(Result.isFailure(result));
    assert(S.isSchemaError(result.failure));
    assertStringIncludes(result.failure.message, "validation");
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

Deno.test("makeWorkspaceConfig - standard field normalization", () => {
  const cases: Array<{
    label: string;
    input: WorkspaceConfigInput["standard"];
    expected: { base: string; variant?: string };
  }> = [
    {
      label: "omitted → default",
      input: undefined,
      expected: { base: "darwin-core", variant: "obis" },
    },
    { label: "string 'obis'", input: "obis", expected: { base: "darwin-core", variant: "obis" } },
    { label: "string 'gbif'", input: "gbif", expected: { base: "darwin-core", variant: "gbif" } },
    { label: "string 'darwin-core'", input: "darwin-core", expected: { base: "darwin-core" } },
    {
      label: "object { base, variant }",
      input: { base: "darwin-core", variant: "obis" },
      expected: { base: "darwin-core", variant: "obis" },
    },
    {
      label: "object without variant",
      input: { base: "darwin-core" },
      expected: { base: "darwin-core" },
    },
  ];

  for (const { label, input, expected } of cases) {
    const config = makeWorkspaceConfig({ standard: input, validation: {} });
    assertEquals(config.standard, expected, label);
  }
});

Deno.test("makeWorkspaceConfig - class field on datasets", async (t) => {
  await t.step("accepts class field on validation datasets", () => {
    const config = makeWorkspaceConfig({
      validation: {
        datasets: [{
          name: "events",
          class: "Event",
          path: "./events.csv",
        }],
      },
    });
    assertEquals(config.validation?.datasets[0]?.class, "Event");
  });

  await t.step("rejects dataset without class field", () => {
    assertThrows(() =>
      makeWorkspaceConfig({
        validation: {
          datasets: [{ name: "events", path: "./events.csv" } as unknown],
        },
      } as WorkspaceConfigInput)
    );
  });
});

Deno.test("makeWorkspaceConfig - datasetRules", async (t) => {
  await t.step("accepts datasetRules with foreignKey rules", () => {
    const config = makeWorkspaceConfig({
      validation: {},
      datasetRules: [
        {
          ruleType: "foreignKey",
          sourceDataset: "occurrences",
          sourceField: "eventID",
          targetDataset: "events",
          targetField: "eventID",
        },
      ],
    });

    assertEquals(config.datasetRules?.length, 1);
    assertEquals(config.datasetRules?.[0].ruleType, "foreignKey");
    assertEquals(config.datasetRules?.[0].sourceDataset, "occurrences");
  });
});

Deno.test("config schema - dependency rules", async (t) => {
  await t.step("decodes presence trigger with allOf require", () => {
    const config = decodeWorkspaceConfig({
      validation: {
        datasets: [{ name: "occ", class: "Occurrence", path: "./occ.csv" }],
      },
      datasetRules: [
        {
          ruleType: "dependency",
          sourceDataset: "occ",
          when: "decimalLatitude",
          require: ["decimalLongitude", "geodeticDatum"],
        },
      ],
    });
    const rule = config.datasetRules![0];
    assertEquals(rule.ruleType, "dependency");
    if (rule.ruleType === "dependency") {
      assertEquals(rule.when, "decimalLatitude");
      assertEquals(rule.require, ["decimalLongitude", "geodeticDatum"]);
      assertEquals(rule.sourceDataset, "occ");
    }
  });

  await t.step("decodes value equals condition", () => {
    const config = decodeWorkspaceConfig({
      validation: {
        datasets: [{ name: "occ", class: "Occurrence", path: "./occ.csv" }],
      },
      datasetRules: [
        {
          ruleType: "dependency",
          when: { field: "basisOfRecord", equals: "PreservedSpecimen" },
          require: ["catalogNumber"],
        },
      ],
    });
    const rule = config.datasetRules![0];
    if (rule.ruleType === "dependency") {
      assertEquals(rule.when, { field: "basisOfRecord", equals: "PreservedSpecimen" });
      assertEquals(rule.require, ["catalogNumber"]);
    }
  });

  await t.step("decodes value in condition", () => {
    const config = decodeWorkspaceConfig({
      validation: {
        datasets: [{ name: "occ", class: "Occurrence", path: "./occ.csv" }],
      },
      datasetRules: [
        {
          ruleType: "dependency",
          when: { field: "basisOfRecord", in: ["PreservedSpecimen", "FossilSpecimen"] },
          require: ["catalogNumber"],
        },
      ],
    });
    const rule = config.datasetRules![0];
    if (rule.ruleType === "dependency") {
      assertEquals(rule.when, {
        field: "basisOfRecord",
        in: ["PreservedSpecimen", "FossilSpecimen"],
      });
    }
  });

  await t.step("decodes unconditional oneOf require", () => {
    const config = decodeWorkspaceConfig({
      validation: {
        datasets: [{ name: "emof", class: "ExtendedMeasurementOrFact", path: "./emof.csv" }],
      },
      datasetRules: [
        {
          ruleType: "dependency",
          sourceDataset: "emof",
          require: { oneOf: ["eventID", "occurrenceID"] },
        },
      ],
    });
    const rule = config.datasetRules![0];
    if (rule.ruleType === "dependency") {
      assertEquals(rule.require, { oneOf: ["eventID", "occurrenceID"] });
      assertEquals(rule.when, undefined);
    }
  });

  await t.step("rejects empty require array", () => {
    assertThrows(() =>
      decodeWorkspaceConfig({
        validation: {},
        datasetRules: [{ ruleType: "dependency", require: [] }],
      })
    );
  });

  await t.step("rejects empty oneOf array", () => {
    assertThrows(() =>
      decodeWorkspaceConfig({
        validation: {},
        datasetRules: [{ ruleType: "dependency", require: { oneOf: [] } }],
      })
    );
  });

  await t.step("rejects empty in array", () => {
    assertThrows(() =>
      decodeWorkspaceConfig({
        validation: {},
        datasetRules: [{
          ruleType: "dependency",
          when: { field: "f", in: [] },
          require: ["x"],
        }],
      })
    );
  });
});

Deno.test("decodeWorkspaceConfigEffect", async (t) => {
  await t.step("succeeds for a valid config", async () => {
    const config = await Effect.runPromise(
      decodeWorkspaceConfigEffect({
        validation: { datasets: [{ name: "events", class: "Event", path: "./events.csv" }] },
      }),
    );
    assertEquals(config.validation?.datasets[0]?.class, "Event");
  });

  await t.step("fails with a SchemaError in the typed error channel", async () => {
    // Effect.flip turns the expected failure into a success carrying the error value;
    // if decoding unexpectedly succeeded, flip would fail and this test would throw.
    const error = await Effect.runPromise(Effect.flip(decodeWorkspaceConfigEffect({})));
    assert(S.isSchemaError(error));
  });
});

Deno.test("formatConfigValidationErrors", async (t) => {
  await t.step("renders a top-level failure without a path prefix", () => {
    const result = S.decodeUnknownResult(workspaceConfigSchema)({});
    assert(Result.isFailure(result));
    assertEquals(formatConfigValidationErrors(result.failure), [
      "Workspace config must have 'validation' and/or 'transform' settings",
    ]);
  });

  await t.step("prefixes nested failures with their dotted field path", () => {
    const result = S.decodeUnknownResult(workspaceConfigSchema)({
      validation: { datasets: [{ name: "events" }] },
    });
    assert(Result.isFailure(result));
    assertEquals(formatConfigValidationErrors(result.failure), [
      "validation.datasets.0.class: Missing key",
    ]);
  });
});

Deno.test("config schema - foreignKey rules parse correctly", () => {
  const config = decodeWorkspaceConfig({
    validation: {
      datasets: [
        { name: "events", class: "Event", path: "./events.csv" },
        { name: "occ", class: "Occurrence", path: "./occ.csv" },
      ],
    },
    datasetRules: [
      {
        ruleType: "foreignKey",
        sourceDataset: "occ",
        sourceField: "eventID",
        targetDataset: "events",
        targetField: "eventID",
      },
    ],
  });
  assertEquals(config.datasetRules?.length, 1);
  const rule = config.datasetRules![0];
  assertEquals(rule.ruleType, "foreignKey");
  if (rule.ruleType === "foreignKey") {
    assertEquals(rule.sourceDataset, "occ");
    assertEquals(rule.sourceField, "eventID");
    assertEquals(rule.targetDataset, "events");
    assertEquals(rule.targetField, "eventID");
  }
});

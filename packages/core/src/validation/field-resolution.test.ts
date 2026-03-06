/**
 * Tests for field-resolution.ts — pure function tests for the 3-tier merge pipeline
 */

import { assert, assertEquals } from "@std/assert";
import type { ResolvedSpec, WorkspaceFieldMapping } from "@dwkt/domain/schemas";
import type { Constraint, SpecField } from "@dwkt/domain/specs";
import {
  obligationForStandard,
  obligationToRequirement,
  RangeConstraint,
  RequiredConstraint,
  resolveProfile,
} from "@dwkt/domain/specs";
import {
  MissingFieldViolation,
  partitionFieldViolations,
  partitionSchemaViolations,
  RequiredFieldViolation,
  requirementToSeverity,
} from "@dwkt/domain/types";
import {
  formatConstraint,
  patternConstraint,
  rangeConstraint,
  requiredConstraint,
} from "../../../../test/helpers/constraint-factories.ts";
import type { ResolutionDiagnostic } from "./field-resolution.ts";
import {
  addConstraints,
  applyResolvedConstraints,
  deriveRequirementFromConstraints,
  requirementToConstraint,
  resolveActiveStandard,
  resolveFieldsForDatasets,
  resolveSpecFields,
} from "./field-resolution.ts";

// =============================================================================
// Test Helpers
// =============================================================================

function makeResolvedSpec(overrides: Partial<ResolvedSpec> = {}): ResolvedSpec {
  return {
    id: "test",
    name: "Test Profile",
    spec: "Test",
    fieldOverrides: {},
    specFields: {},
    ...overrides,
  };
}

// =============================================================================
// resolveActiveStandard Tests
// =============================================================================

Deno.test("resolveActiveStandard - extracts variant or defaults to obis", () => {
  assertEquals(resolveActiveStandard({ base: "darwin-core", variant: "obis" }).standard, "obis");
  assertEquals(resolveActiveStandard({ base: "darwin-core", variant: "gbif" }).standard, "gbif");
  assertEquals(resolveActiveStandard({ base: "darwin-core" }).standard, "obis");
  assertEquals(resolveActiveStandard(undefined).standard, "obis");
});

Deno.test("resolveActiveStandard - warns on unknown variant", () => {
  const result = resolveActiveStandard({ base: "darwin-core", variant: "inat" });
  assertEquals(result.standard, "obis");
  assertEquals(typeof result.warning, "string");
  assertEquals(result.warning!.includes("inat"), true);
});

Deno.test("resolveActiveStandard - warns when no variant specified", () => {
  const result = resolveActiveStandard({ base: "darwin-core" });
  assertEquals(result.standard, "obis");
  assertEquals(typeof result.warning, "string");
  assertEquals(result.warning!.includes("defaulting"), true);
});

// =============================================================================
// obligationForStandard Tests
// =============================================================================

Deno.test("obligationForStandard - maps obligation to requirement for given standard", () => {
  const cases: Array<{
    label: string;
    obligations?: Record<string, string>;
    standard: "obis" | "gbif";
    expected: { obligation: string; requirement: string | undefined } | undefined;
  }> = [
    {
      label: "OBIS required",
      obligations: { obis: "required" },
      standard: "obis",
      expected: { obligation: "required", requirement: "required" },
    },
    {
      label: "GBIF required",
      obligations: { gbif: "required" },
      standard: "gbif",
      expected: { obligation: "required", requirement: "required" },
    },
    {
      label: "no obligations → undefined",
      obligations: undefined,
      standard: "obis",
      expected: undefined,
    },
    {
      label: "'required (if exists)' → no requirement",
      obligations: { obis: "required (if exists)" },
      standard: "obis",
      expected: { obligation: "required (if exists)", requirement: undefined },
    },
  ];

  for (const { label, obligations, standard, expected } of cases) {
    const field: SpecField = { name: "test", constraints: [], ...(obligations && { obligations }) };
    const result = obligationForStandard(field, standard);
    assertEquals(result?.obligation, expected?.obligation, label);
    assertEquals(result?.requirement, expected?.requirement, label);
  }
});

// =============================================================================
// deriveRequirementFromConstraints Tests
// =============================================================================

Deno.test("deriveRequirementFromConstraints - maps constraint levels to requirements", () => {
  const cases: Array<[Constraint[] | undefined, string | undefined]> = [
    [[requiredConstraint("required")], "required"],
    [[requiredConstraint("recommended")], "recommended"],
    [[requiredConstraint("optional")], "optional"],
    [[rangeConstraint(-90, 90)], undefined],
    [undefined, undefined],
  ];
  for (const [constraints, expected] of cases) {
    assertEquals(deriveRequirementFromConstraints(constraints), expected);
  }
});

// =============================================================================
// requirementToConstraint Tests
// =============================================================================

Deno.test("requirementToConstraint - produces RequiredConstraint with matching level", () => {
  for (const level of ["required", "recommended", "optional"] as const) {
    const result = requirementToConstraint(level);
    assert(result instanceof RequiredConstraint, level);
    assertEquals(result._tag, "required");
    assertEquals(result.level, level);
  }
});

// =============================================================================
// addConstraints Tests
// =============================================================================

Deno.test("addConstraints - adds new constraint types", () => {
  const existing: Constraint[] = [rangeConstraint(-90, 90)];
  const additions: Constraint[] = [requiredConstraint()];

  const result = addConstraints(existing, additions);
  assertEquals(result.length, 2);
  assertEquals(result[0]._tag, "range");
  assertEquals(result[1]._tag, "required");
});

Deno.test("addConstraints - keeps both when same type added (tightening)", () => {
  const existing: Constraint[] = [rangeConstraint(-90, 90)];
  const additions: Constraint[] = [rangeConstraint(0, 50)]; // same type, tighter values

  const result = addConstraints(existing, additions);
  assertEquals(result.length, 2);
  if (result[0]._tag === "range") {
    assertEquals(result[0].min, -90); // original preserved
  }
  if (result[1]._tag === "range") {
    assertEquals(result[1].min, 0); // addition also present
  }
});

Deno.test("addConstraints - empty additions returns existing", () => {
  const existing: Constraint[] = [rangeConstraint(-90, 90)];
  const result = addConstraints(existing, []);
  assertEquals(result.length, 1);
});

Deno.test("addConstraints - empty existing accepts all additions", () => {
  const additions: Constraint[] = [requiredConstraint(), rangeConstraint(-90, 90)];
  const result = addConstraints([], additions);
  assertEquals(result.length, 2);
});

Deno.test("addConstraints - records overlapping types in diagnostics tracker", () => {
  const existing: Constraint[] = [rangeConstraint(-90, 90)];
  const additions: Constraint[] = [rangeConstraint(0, 50), requiredConstraint()];
  const tracker = {
    fieldName: "decimalLatitude",
    overlapping: [] as string[],
    filtered: [] as string[],
  };

  const result = addConstraints(existing, additions, tracker);
  assertEquals(result.length, 3); // both ranges + required
  assertEquals(tracker.overlapping, ["range"]); // range overlap noted
});

Deno.test("addConstraints - no diagnostics when no overlapping types", () => {
  const existing: Constraint[] = [rangeConstraint(-90, 90)];
  const additions: Constraint[] = [requiredConstraint()];
  const tracker = { fieldName: "test", overlapping: [] as string[], filtered: [] as string[] };

  addConstraints(existing, additions, tracker);
  assertEquals(tracker.overlapping.length, 0);
});

Deno.test("addConstraints - RequiredConstraint strength filtering", async (t) => {
  const cases = [
    {
      label: "filters weaker (optional added to required)",
      existing: "required" as const,
      addition: "optional" as const,
      expectedCount: 1,
      expectFiltered: true,
    },
    {
      label: "keeps equal strength (required + required)",
      existing: "required" as const,
      addition: "required" as const,
      expectedCount: 2,
      expectFiltered: false,
    },
    {
      label: "keeps stronger from config (required added to optional)",
      existing: "optional" as const,
      addition: "required" as const,
      expectedCount: 2,
      expectFiltered: false,
    },
  ];

  for (const { label, existing, addition, expectedCount, expectFiltered } of cases) {
    await t.step(label, () => {
      const tracker = { fieldName: "test", overlapping: [] as string[], filtered: [] as string[] };
      const result = addConstraints(
        [requiredConstraint(existing)],
        [requiredConstraint(addition)],
        tracker,
      );
      assertEquals(result.length, expectedCount, label);
      assertEquals(tracker.filtered.length > 0, expectFiltered, `${label} - filtered diagnostic`);
    });
  }
});

// =============================================================================
// resolveSpecFields Diagnostics Tests
// =============================================================================

Deno.test("resolveSpecFields - diagnostics records overlapping config constraints with explanatory message", () => {
  const profile = makeResolvedSpec({
    specFields: {
      decimalLatitude: {
        name: "decimalLatitude",
        constraints: [rangeConstraint(-90, 90)],
      },
    },
  });

  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "lat",
    targetName: "decimalLatitude",
    constraints: [rangeConstraint(0, 50)], // same type as spec → tightening
  }];

  const diagnostics: ResolutionDiagnostic[] = [];
  const result = resolveSpecFields(profile, "obis", configMappings, diagnostics);

  // Both constraints kept
  const lat = result["decimalLatitude"];
  assert(lat?.constraints !== undefined);
  assertEquals(lat.constraints.filter((c) => c._tag === "range").length, 2);

  // Diagnostic records the overlap with explanatory message
  assertEquals(diagnostics.length, 1);
  assertEquals(diagnostics[0].fieldName, "decimalLatitude");
  assert(diagnostics[0].overlappingTypes.includes("range"));
  const msg = diagnostics[0].message;
  assert(msg.includes("additional"), "Message should mention 'additional'");
  assert(msg.includes("range"), "Message should mention constraint type");
  assert(msg.includes("decimalLatitude"), "Message should mention field name");
  assert(msg.includes("data must satisfy both"), "Message should explain both constraints apply");
});

Deno.test("resolveSpecFields - no diagnostics when config adds new types", () => {
  const profile = makeResolvedSpec({
    specFields: {
      countryCode: {
        name: "countryCode",
        constraints: [requiredConstraint()],
      },
    },
  });

  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "countryCode",
    targetName: "countryCode",
    constraints: [patternConstraint("^[A-Z]{2}$")], // new type → accepted
  }];

  const diagnostics: ResolutionDiagnostic[] = [];
  resolveSpecFields(profile, "obis", configMappings, diagnostics);

  assertEquals(diagnostics.length, 0);
});

Deno.test("resolveSpecFields - no diagnostics when array not provided", () => {
  const profile = makeResolvedSpec({
    specFields: {
      decimalLatitude: {
        name: "decimalLatitude",
        constraints: [rangeConstraint(-90, 90)],
      },
    },
  });

  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "lat",
    targetName: "decimalLatitude",
    constraints: [rangeConstraint(0, 50)],
  }];

  // Should not throw when diagnostics is undefined
  const result = resolveSpecFields(profile, "obis", configMappings);
  assert(result["decimalLatitude"] !== undefined);
});

// =============================================================================
// resolveSpecFields Tests
// =============================================================================

Deno.test("resolveSpecFields - spec fields with obligations get required constraints", () => {
  const profile = makeResolvedSpec({
    specFields: {
      eventDate: {
        name: "eventDate",
        constraints: [],
        obligations: { obis: "required" },
      },
    },
  });

  const result = resolveSpecFields(profile, "obis", []);
  const eventDate = result["eventDate"];
  assert(eventDate !== undefined);
  assert(eventDate.constraints !== undefined);
  const requiredConstraints = eventDate.constraints.filter((c) =>
    c._tag === "required"
  ) as RequiredConstraint[];
  assertEquals(requiredConstraints.length, 1);
  assertEquals(requiredConstraints[0].level, "required");
});

Deno.test("resolveSpecFields - profile override replaces spec constraint (replacement semantics)", () => {
  const profile = makeResolvedSpec({
    specFields: {
      decimalLatitude: {
        name: "decimalLatitude",
        constraints: [rangeConstraint(-90, 90)],
      },
    },
    fieldOverrides: {
      decimalLatitude: {
        constraints: [rangeConstraint(-45, 45)], // narrower range
      },
    },
  });

  const result = resolveSpecFields(profile, "obis", []);
  const lat = result["decimalLatitude"];
  assert(lat?.constraints !== undefined);
  const ranges = lat.constraints.filter((c) => c._tag === "range");
  assertEquals(ranges.length, 1);
  if (ranges[0]._tag === "range") {
    assertEquals(ranges[0].min, -45); // replaced
    assertEquals(ranges[0].max, 45);
  }
});

Deno.test("resolveSpecFields - config constraint same type as spec → both kept (tightening)", () => {
  const profile = makeResolvedSpec({
    specFields: {
      decimalLatitude: {
        name: "decimalLatitude",
        constraints: [rangeConstraint(-90, 90)],
      },
    },
  });

  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "lat",
    targetName: "decimalLatitude",
    constraints: [rangeConstraint(0, 50)], // tighter range added alongside spec
  }];

  const result = resolveSpecFields(profile, "obis", configMappings);
  const lat = result["decimalLatitude"];
  assert(lat?.constraints !== undefined);
  const ranges = lat.constraints.filter((c) => c._tag === "range");
  assertEquals(ranges.length, 2);
  if (ranges[0]._tag === "range") {
    assertEquals(ranges[0].min, -90); // spec's range preserved
    assertEquals(ranges[0].max, 90);
  }
  if (ranges[1]._tag === "range") {
    assertEquals(ranges[1].min, 0); // config's tighter range added
    assertEquals(ranges[1].max, 50);
  }
});

Deno.test("resolveSpecFields - config adds new constraint type not in spec → accepted", () => {
  const profile = makeResolvedSpec({
    specFields: {
      countryCode: {
        name: "countryCode",
        constraints: [requiredConstraint("recommended")],
      },
    },
  });

  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "countryCode",
    targetName: "countryCode",
    constraints: [patternConstraint("^[A-Z]{2}$")], // new type, accepted
  }];

  const result = resolveSpecFields(profile, "obis", configMappings);
  const cc = result["countryCode"];
  assert(cc?.constraints !== undefined);
  assertEquals(cc.constraints.length, 2);
  const tags = cc.constraints.map((c) => c._tag);
  assert(tags.includes("required"));
  assert(tags.includes("pattern"));
});

Deno.test("resolveSpecFields - config requirement compiled to constraint", () => {
  const profile = makeResolvedSpec({
    specFields: {
      locality: {
        name: "locality",
        constraints: [],
      },
    },
  });

  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "locality",
    targetName: "locality",
    requirement: "required",
  }];

  const result = resolveSpecFields(profile, "obis", configMappings);
  const locality = result["locality"];
  assert(locality?.constraints !== undefined);
  const required = locality.constraints.filter((c) =>
    c._tag === "required"
  ) as RequiredConstraint[];
  assertEquals(required.length, 1);
  assertEquals(required[0].level, "required");
});

Deno.test("resolveSpecFields - config requirement 'recommended' produces optional level constraint", () => {
  const profile = makeResolvedSpec({
    specFields: {
      locality: {
        name: "locality",
        constraints: [],
      },
    },
  });

  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "locality",
    targetName: "locality",
    requirement: "optional",
  }];

  const result = resolveSpecFields(profile, "obis", configMappings);
  const locality = result["locality"];
  assert(locality?.constraints !== undefined);
  const required = locality.constraints.filter((c) =>
    c._tag === "required"
  ) as RequiredConstraint[];
  assertEquals(required.length, 1);
  assertEquals(required[0].level, "optional");
});

Deno.test("resolveSpecFields - 3-tier chain preserves all non-overlapping types", () => {
  const profile = makeResolvedSpec({
    specFields: {
      decimalLatitude: {
        name: "decimalLatitude",
        constraints: [rangeConstraint(-90, 90)], // Tier 1: range
      },
    },
    fieldOverrides: {
      decimalLatitude: {
        constraints: [formatConstraint("decimal-degrees")], // Tier 2: format (new type)
      },
    },
  });

  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "lat",
    targetName: "decimalLatitude",
    constraints: [requiredConstraint()], // Tier 3: required (new type)
  }];

  const result = resolveSpecFields(profile, "obis", configMappings);
  const lat = result["decimalLatitude"];
  assert(lat?.constraints !== undefined);
  const tags = lat.constraints.map((c) => c._tag);
  assert(tags.includes("range"), "spec range preserved");
  assert(tags.includes("format"), "profile format added via replacement merge");
  assert(tags.includes("required"), "config required added via additive merge");
});

Deno.test("resolveSpecFields - config originName/targetName applied to mapping", () => {
  const profile = makeResolvedSpec({
    specFields: {
      decimalLatitude: {
        name: "decimalLatitude",
        constraints: [rangeConstraint(-90, 90)],
      },
    },
  });

  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "lat",
    targetName: "decimalLatitude",
  }];

  const result = resolveSpecFields(profile, "obis", configMappings);
  const lat = result["decimalLatitude"];
  assertEquals(lat.originName, "lat");
  assertEquals(lat.targetName, "decimalLatitude");
});

// =============================================================================
// resolveSpecFields Edge Cases
// =============================================================================

Deno.test("resolveSpecFields - field only in profile overrides gets synthesized mapping", () => {
  const profile = makeResolvedSpec({
    specFields: {},
    fieldOverrides: {
      customField: {
        requirement: "required",
        constraints: [patternConstraint("^[A-Z]+$")],
      },
    },
  });

  const result = resolveSpecFields(profile, "obis", []);
  const custom = result["customField"];
  assert(custom !== undefined, "field from overrides should exist in result");
  assertEquals(custom.originName, "customField");
  assertEquals(custom.targetName, "customField");
  assert(custom.constraints !== undefined);
  const tags = custom.constraints.map((c) => c._tag);
  assert(tags.includes("pattern"), "override pattern constraint present");
  assert(tags.includes("required"), "override requirement compiled to constraint");
});

Deno.test("resolveSpecFields - triple config-tier: preset + explicit + requirement on same field", () => {
  const profile = makeResolvedSpec({
    specFields: {
      locality: {
        name: "locality",
        constraints: [],
      },
    },
  });

  // Config provides all three sources of constraints for the same field
  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "locality",
    targetName: "locality",
    preset: "requiredText",
    constraints: [patternConstraint("^[A-Za-z ]+$")],
    requirement: "required",
  }];

  // "requiredText" preset adds a required constraint; explicit config adds a
  // pattern; requirement compiles to another required. All three sources land.
  const result = resolveSpecFields(profile, "obis", configMappings);
  const loc = result["locality"];
  assert(loc?.constraints !== undefined);
  const tags = loc.constraints.map((c) => c._tag);
  assert(tags.includes("pattern"), "explicit config pattern added");
  assert(tags.includes("required"), "preset and/or requirement compiled to required");
});

Deno.test("resolveSpecFields - profile replacement produces single required constraint", () => {
  // Tier 2 uses overrideConstraints (replacement), so only one required constraint
  // remains. deriveRequirementFromConstraints picks the strictest, which is the
  // same as the only one after replacement.
  const profile = makeResolvedSpec({
    specFields: {
      eventDate: {
        name: "eventDate",
        constraints: [requiredConstraint("recommended")], // Tier 1: recommended
      },
    },
    fieldOverrides: {
      eventDate: {
        constraints: [requiredConstraint("required")], // Tier 2: replaces to required
      },
    },
  });

  const result = resolveSpecFields(profile, "obis", []);
  const eventDate = result["eventDate"];
  assert(eventDate?.constraints !== undefined);
  const required = eventDate.constraints.filter((c) =>
    c._tag === "required"
  ) as RequiredConstraint[];
  assertEquals(required.length, 1, "merge should produce exactly one required constraint");
  assertEquals(
    required[0].level,
    "required",
    "profile override should replace spec level",
  );
});

Deno.test("deriveRequirementFromConstraints - picks strictest when multiple required constraints exist", () => {
  // After additive merge (Tier 3), a field may have multiple RequiredConstraints.
  // deriveRequirementFromConstraints must pick the strictest, matching the
  // validator's takeStrictest behavior.
  assertEquals(
    deriveRequirementFromConstraints([
      requiredConstraint("required"),
      requiredConstraint("optional"), // weaker, added by config
    ]),
    "required",
    "strictest (required) should win even when weaker constraint comes last",
  );

  assertEquals(
    deriveRequirementFromConstraints([
      requiredConstraint("optional"),
      requiredConstraint("recommended"),
    ]),
    "recommended",
    "recommended is stricter than optional",
  );
});

// =============================================================================
// applyResolvedConstraints Tests
// =============================================================================

Deno.test("applyResolvedConstraints - applies resolved constraints to base field", () => {
  const baseField: SpecField = {
    name: "decimalLatitude",
    constraints: [rangeConstraint(-90, 90)],
  };
  const mapping: WorkspaceFieldMapping = {
    originName: "lat",
    targetName: "decimalLatitude",
    constraints: [rangeConstraint(-45, 45), requiredConstraint()],
  };

  const result = applyResolvedConstraints(baseField, mapping);
  assertEquals(result.constraints.length, 2);
  assertEquals(result.name, "decimalLatitude"); // base field name preserved
});

Deno.test("applyResolvedConstraints - returns base field when no resolved constraints", () => {
  const baseField: SpecField = {
    name: "eventDate",
    constraints: [formatConstraint("iso8601")],
  };
  const mapping: WorkspaceFieldMapping = {
    originName: "eventDate",
    targetName: "eventDate",
  };

  const result = applyResolvedConstraints(baseField, mapping);
  assertEquals(result, baseField); // identical reference
});

Deno.test("applyResolvedConstraints - returns base field when mapping is undefined", () => {
  const baseField: SpecField = {
    name: "eventDate",
    constraints: [formatConstraint("iso8601")],
  };

  const result = applyResolvedConstraints(baseField, undefined);
  assertEquals(result, baseField);
});

// =============================================================================
// Invariant: Config cannot weaken spec/profile constraints
// =============================================================================

Deno.test("Config cannot weaken spec/profile constraints", async (t) => {
  await t.step(
    "config optional level does not weaken spec required — weaker filtered out",
    () => {
      const specConstraints: Constraint[] = [
        new RequiredConstraint({ level: "required", allowEmpty: false, allowWhitespace: false }),
      ];

      const configConstraints: Constraint[] = [
        new RequiredConstraint({ level: "optional", allowEmpty: false, allowWhitespace: false }),
      ];

      const merged = addConstraints(specConstraints, configConstraints);

      // Weaker constraint is filtered out
      const requiredConstraints = merged.filter(
        (c): c is RequiredConstraint => c._tag === "required",
      );
      assertEquals(requiredConstraints.length, 1);

      // Only the stricter constraint remains
      const derived = deriveRequirementFromConstraints(merged);
      assertEquals(derived, "required");
    },
  );

  await t.step("config range is additive — both spec and config ranges enforced", () => {
    const specConstraints: Constraint[] = [
      new RangeConstraint({ min: -90, max: 90, inclusive: true }),
    ];

    const configConstraints: Constraint[] = [
      new RangeConstraint({ min: 0, max: 50, inclusive: true }),
    ];

    const merged = addConstraints(specConstraints, configConstraints);

    const rangeConstraints = merged.filter((c) => c._tag === "range");
    assertEquals(rangeConstraints.length, 2, "Both ranges should be present (additive)");
  });
});

// =============================================================================
// End-to-end requirement chain tests
//
// These tests verify the full operational chain:
//   obligation → requirement → constraint → deriveRequirement → severity → partition
//
// Each test traces one requirement level through every link in the chain
// to prove that the application reliably does what the requirement level promises.
// =============================================================================

Deno.test("End-to-end requirement chain", async (t) => {
  // Table-driven: each row is one requirement path through the system
  const cases = [
    {
      label: "required obligation → ERROR partition",
      obligation: "required" as const,
      expectedRequirement: "required" as const,
      expectedSeverity: "error" as const,
      expectedPartitionBucket: "errors" as const,
    },
    {
      label: "strongly recommended obligation → WARNING partition",
      obligation: "strongly recommended" as const,
      expectedRequirement: "recommended" as const,
      expectedSeverity: "warning" as const,
      expectedPartitionBucket: "warnings" as const,
    },
    {
      label: "recommended obligation → INFO partition",
      obligation: "recommended" as const,
      expectedRequirement: "optional" as const,
      expectedSeverity: "info" as const,
      expectedPartitionBucket: "info" as const,
    },
  ] as const;

  for (const tc of cases) {
    await t.step(tc.label, () => {
      // Link 1: Obligation → RequirementLevel
      const requirement = obligationToRequirement(tc.obligation);
      assertEquals(requirement, tc.expectedRequirement);

      // Link 2: RequirementLevel → RequiredConstraint (via field resolution)
      const constraint = requirementToConstraint(requirement!);
      assertEquals(constraint._tag, "required");
      assert(constraint._tag === "required");
      assert(constraint instanceof RequiredConstraint);
      assertEquals(constraint.level, tc.expectedRequirement);

      // Link 3: Constraints → deriveRequirementFromConstraints (round-trip check)
      const derived = deriveRequirementFromConstraints([constraint]);
      assertEquals(derived, tc.expectedRequirement);

      // Link 4: RequirementLevel → Severity
      const severity = requirementToSeverity(tc.expectedRequirement);
      assertEquals(severity, tc.expectedSeverity);

      // Link 5: Field violation constructed with severity → partitions correctly
      const fieldViolation = new RequiredFieldViolation({
        severity: requirementToSeverity(tc.expectedRequirement),
        fieldName: "testField",
        targetName: "testField",
        rowNumber: 1,
        value: "",
        errorMessage: "test",
      });

      const fieldPartition = partitionFieldViolations([fieldViolation]);
      assertEquals(
        fieldPartition[tc.expectedPartitionBucket].length,
        1,
        `field violation should land in ${tc.expectedPartitionBucket}`,
      );

      // Link 6: Schema violation constructed with severity → partitions correctly
      const schemaViolation = new MissingFieldViolation({
        severity: requirementToSeverity(tc.expectedRequirement),
        fieldName: "testField",
        targetName: "testField",
        errorMessage: "test",
        reason: "not_mapped",
      });

      const schemaPartition = partitionSchemaViolations([schemaViolation]);
      assertEquals(
        schemaPartition[tc.expectedPartitionBucket].length,
        1,
        `schema violation should land in ${tc.expectedPartitionBucket}`,
      );
    });
  }
});

Deno.test("End-to-end: obligation on spec field flows through 3-tier pipeline to correct requirement", async (t) => {
  await t.step("OBIS required obligation → required level on resolved field", () => {
    const profile = makeResolvedSpec({
      specFields: {
        eventDate: {
          name: "eventDate",
          constraints: [],
          obligations: { obis: "required" },
        },
      },
    });

    const resolved = resolveSpecFields(profile, "obis", []);
    const requirement = deriveRequirementFromConstraints(resolved["eventDate"]?.constraints);
    assertEquals(requirement, "required");
  });

  await t.step(
    "OBIS strongly recommended obligation → recommended level on resolved field",
    () => {
      const profile = makeResolvedSpec({
        specFields: {
          scientificName: {
            name: "scientificName",
            constraints: [],
            obligations: { obis: "strongly recommended" },
          },
        },
      });

      const resolved = resolveSpecFields(profile, "obis", []);
      const requirement = deriveRequirementFromConstraints(resolved["scientificName"]?.constraints);
      assertEquals(requirement, "recommended");
    },
  );

  await t.step("OBIS recommended obligation → optional level on resolved field", () => {
    const profile = makeResolvedSpec({
      specFields: {
        kingdom: {
          name: "kingdom",
          constraints: [],
          obligations: { obis: "recommended" },
        },
      },
    });

    const resolved = resolveSpecFields(profile, "obis", []);
    const requirement = deriveRequirementFromConstraints(resolved["kingdom"]?.constraints);
    assertEquals(requirement, "optional");
  });

  await t.step("OBIS optional obligation → no requirement constraint on resolved field", () => {
    const profile = makeResolvedSpec({
      specFields: {
        fieldNotes: {
          name: "fieldNotes",
          constraints: [],
          obligations: { obis: "optional" },
        },
      },
    });

    const resolved = resolveSpecFields(profile, "obis", []);
    const requirement = deriveRequirementFromConstraints(resolved["fieldNotes"]?.constraints);
    assertEquals(requirement, undefined);
  });

  // "required (if exists)" cases are tested in detail by the dedicated
  // "Required-if-exists" tests below, so they are not duplicated here.
});

Deno.test("End-to-end: profile requirement override flows to correct requirement", async (t) => {
  await t.step("profile 'required' override strengthens spec optional obligation", () => {
    const profile = makeResolvedSpec({
      specFields: {
        locality: {
          name: "locality",
          constraints: [],
          obligations: { obis: "optional" },
        },
      },
      fieldOverrides: {
        locality: { requirement: "required" },
      },
    });

    const resolved = resolveSpecFields(profile, "obis", []);
    const requirement = deriveRequirementFromConstraints(resolved["locality"]?.constraints);
    assertEquals(requirement, "required");
  });

  await t.step("config 'required' requirement adds requirement alongside spec", () => {
    const profile = makeResolvedSpec({
      specFields: {
        locality: {
          name: "locality",
          constraints: [],
          obligations: { obis: "recommended" },
        },
      },
    });

    const configMappings: WorkspaceFieldMapping[] = [{
      originName: "locality",
      targetName: "locality",
      requirement: "required",
    }];

    const resolved = resolveSpecFields(profile, "obis", configMappings);
    // Config adds additively, so both optional (from obligation) and required (from config) exist.
    // deriveRequirementFromConstraints picks the strictest.
    const requirement = deriveRequirementFromConstraints(resolved["locality"]?.constraints);
    assertEquals(requirement, "required");
  });
});

// =============================================================================
// Weaker RequiredConstraint Filtering Tests
// =============================================================================

Deno.test("resolveSpecFields - weaker config requirement filtered with diagnostic", () => {
  const profile = makeResolvedSpec({
    specFields: {
      eventDate: {
        name: "eventDate",
        constraints: [],
        obligations: { obis: "required" },
      },
    },
  });

  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "eventDate",
    targetName: "eventDate",
    requirement: "optional",
  }];

  const diagnostics: ResolutionDiagnostic[] = [];
  const result = resolveSpecFields(profile, "obis", configMappings, diagnostics);

  // Only the required constraint should remain (optional filtered out)
  const eventDate = result["eventDate"];
  const required =
    eventDate?.constraints?.filter((c) => c._tag === "required") as RequiredConstraint[] ?? [];
  assertEquals(required.length, 1);
  assertEquals(required[0].level, "required");

  // Diagnostic should explain the filtering
  assertEquals(diagnostics.length, 1);
  assert(diagnostics[0].filteredMessages.length > 0);
  assert(diagnostics[0].message.includes("optional"));
  assert(diagnostics[0].message.includes("required"));
});

// =============================================================================
// "Required (if exists)" Conditional Obligation Tests
// =============================================================================

Deno.test("Required-if-exists: emits WARNING constraint when field is mapped", () => {
  const profile = makeResolvedSpec({
    specFields: {
      parentEventID: {
        name: "parentEventID",
        label: "Parent Event ID",
        constraints: [],
        obligations: { obis: "required (if exists)" },
      },
    },
  });

  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "parentEventID",
    targetName: "parentEventID",
  }];

  const resolved = resolveSpecFields(profile, "obis", configMappings);
  const constraints = resolved["parentEventID"]?.constraints ?? [];
  const requiredConstraints = constraints.filter((c) =>
    c._tag === "required"
  ) as RequiredConstraint[];

  assertEquals(requiredConstraints.length, 1, "should emit one required constraint");
  assert(requiredConstraints[0]._tag === "required");
  assertEquals(requiredConstraints[0].level, "recommended");
  assert(
    requiredConstraints[0].message?.includes("Parent Event ID"),
    "message should reference the field label",
  );
  assert(
    requiredConstraints[0].message?.includes("verify that blanks are intentional"),
    "message should explain the conditional nature",
  );
});

Deno.test("Required-if-exists: no constraint when field is NOT mapped", () => {
  const profile = makeResolvedSpec({
    specFields: {
      parentEventID: {
        name: "parentEventID",
        label: "Parent Event ID",
        constraints: [],
        obligations: { obis: "required (if exists)" },
      },
    },
  });

  // No config mapping for parentEventID
  const resolved = resolveSpecFields(profile, "obis", []);
  const constraints = resolved["parentEventID"]?.constraints ?? [];
  const requiredConstraints = constraints.filter((c) => c._tag === "required");

  assertEquals(requiredConstraints.length, 0, "should not emit a required constraint");
});

Deno.test("Required-if-exists: uses fieldName as fallback when label is absent", () => {
  const profile = makeResolvedSpec({
    specFields: {
      parentEventID: {
        name: "parentEventID",
        // no label
        constraints: [],
        obligations: { obis: "required (if exists)" },
      },
    },
  });

  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "parentEventID",
    targetName: "parentEventID",
  }];

  const resolved = resolveSpecFields(profile, "obis", configMappings);
  const constraints = resolved["parentEventID"]?.constraints ?? [];
  const req = constraints.find((c) => c._tag === "required") as RequiredConstraint | undefined;
  assert(req?._tag === "required");
  assert(
    req.message?.includes("parentEventID"),
    "message should fall back to field name",
  );
});

// =============================================================================
// Profile Cannot Weaken Spec Requirements (Strictest-Wins for RequiredConstraint)
// =============================================================================

Deno.test("resolveSpecFields - profile override replaces spec requirement level", () => {
  const profile = makeResolvedSpec({
    specFields: {
      eventDate: {
        name: "eventDate",
        constraints: [],
        obligations: { obis: "required" },
      },
    },
    fieldOverrides: {
      eventDate: {
        requirement: "recommended",
      },
    },
  });

  const result = resolveSpecFields(profile, "obis", []);
  const eventDate = result["eventDate"];
  const required = eventDate?.constraints?.filter((c) =>
    c._tag === "required"
  ) as RequiredConstraint[];

  // Profile overrides are authoritative — they replace spec obligations.
  // This allows profiles to weaken per-field requirements when a group rule
  // (e.g., dependency rule) replaces individual required constraints.
  assertEquals(required?.length, 1);
  assertEquals(required?.[0]?.level, "recommended");
});

Deno.test("resolveSpecFields - profile can strengthen spec recommended to required", () => {
  const profile = makeResolvedSpec({
    specFields: {
      scientificName: {
        name: "scientificName",
        constraints: [],
        obligations: { obis: "strongly recommended" },
      },
    },
    fieldOverrides: {
      scientificName: {
        requirement: "required",
      },
    },
  });

  const result = resolveSpecFields(profile, "obis", []);
  const field = result["scientificName"];
  const required = field?.constraints?.filter((c) => c._tag === "required") as RequiredConstraint[];

  assertEquals(required?.length, 1);
  assertEquals(required?.[0]?.level, "required");
});

Deno.test("resolveSpecFields - profile can still replace value constraints", () => {
  const profile = makeResolvedSpec({
    specFields: {
      decimalLatitude: {
        name: "decimalLatitude",
        constraints: [new RangeConstraint({ min: -90, max: 90, inclusive: true })],
        obligations: {},
      },
    },
    fieldOverrides: {
      decimalLatitude: {
        constraints: [new RangeConstraint({ min: -45, max: 45, inclusive: true })],
      },
    },
  });

  const result = resolveSpecFields(profile, "obis", []);
  const field = result["decimalLatitude"];
  const ranges = field?.constraints?.filter((c) => c._tag === "range");

  assertEquals(ranges?.length, 1);
  assertEquals((ranges?.[0] as RangeConstraint)?.min, -45);
  assertEquals((ranges?.[0] as RangeConstraint)?.max, 45);
});

// =============================================================================
// resolveProfile Fallback Tests
// =============================================================================

Deno.test("resolveProfile - unknown variant falls back to base JSON spec", () => {
  const result = resolveProfile("unknown-variant", "Event");
  assert(result !== undefined, "should return a ResolvedSpec for Event");
  assert(
    Object.keys(result!.specFields).length > 0,
    "specFields should be populated from JSON spec",
  );
});

// =============================================================================
// Multi-Level Inheritance Strictness Tests
// =============================================================================

Deno.test("resolveSpecFields - config cannot weaken profile-strengthened requirement", () => {
  // Spec field has "recommended" obligation → produces "recommended" level RequiredConstraint
  // Profile override strengthens to "required"
  // Config mapping tries to weaken to "optional"
  // Result should be "required" (strongest wins)
  const profile = makeResolvedSpec({
    specFields: {
      scientificName: {
        name: "scientificName",
        constraints: [],
        obligations: { obis: "strongly recommended" }, // → "recommended" level
      },
    },
    fieldOverrides: {
      scientificName: {
        requirement: "required", // profile strengthens to required
      },
    },
  });

  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "scientificName",
    targetName: "scientificName",
    requirement: "optional", // config tries to weaken to optional
  }];

  const result = resolveSpecFields(profile, "obis", configMappings);
  const field = result["scientificName"];
  assert(field?.constraints !== undefined);

  const requirement = deriveRequirementFromConstraints(field.constraints);
  assertEquals(
    requirement,
    "required",
    "strongest requirement (required from profile) should win over config optional",
  );
});

Deno.test("Required-if-exists: profile override can strengthen to required (ERROR)", () => {
  const profile = makeResolvedSpec({
    specFields: {
      parentEventID: {
        name: "parentEventID",
        label: "Parent Event ID",
        constraints: [],
        obligations: { obis: "required (if exists)" },
      },
    },
    fieldOverrides: {
      parentEventID: { requirement: "required" },
    },
  });

  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "parentEventID",
    targetName: "parentEventID",
  }];

  const resolved = resolveSpecFields(profile, "obis", configMappings);
  // Profile override uses overrideConstraints (replacement), so the WARNING-level
  // "required (if exists)" constraint should be replaced by the ERROR-level one.
  const requirement = deriveRequirementFromConstraints(resolved["parentEventID"]?.constraints);
  assertEquals(requirement, "required");
});

// =============================================================================
// resolveFieldsForDatasets Tests
// =============================================================================

Deno.test("resolveFieldsForDatasets - returns empty map for empty datasets", () => {
  const result = resolveFieldsForDatasets([], { base: "darwin-core", variant: "obis" });
  assertEquals(result.size, 0);
});

Deno.test("resolveFieldsForDatasets - skips datasets with unknown class", () => {
  const datasets = [{ name: "bad", class: "NonExistentClass", path: "x.csv", fieldMappings: [] }];
  const result = resolveFieldsForDatasets(datasets, { base: "darwin-core", variant: "obis" });
  assertEquals(result.size, 0, "unknown class should be skipped");
});

Deno.test("resolveFieldsForDatasets - populates resolvedSpec on entries", () => {
  const datasets = [{ name: "events", class: "Event", path: "e.csv", fieldMappings: [] }];
  const result = resolveFieldsForDatasets(datasets, { base: "darwin-core", variant: "obis" });
  assertEquals(result.size, 1);
  const entry = result.get("events")!;
  assert(entry.resolvedSpec !== undefined, "resolvedSpec should be populated");
  assert(
    Object.keys(entry.resolvedSpec.specFields).length > 0,
    "resolvedSpec should have specFields from the base spec",
  );
  assert(Object.keys(entry.all).length > 0, "all fields should be resolved");
});

Deno.test("resolveFieldsForDatasets - mapped subset matches config fieldMappings", () => {
  const datasets = [{
    name: "events",
    class: "Event",
    path: "e.csv",
    fieldMappings: [
      { originName: "eventID", targetName: "eventID" },
      { originName: "date", targetName: "eventDate" },
    ],
  }];
  const result = resolveFieldsForDatasets(datasets, { base: "darwin-core", variant: "obis" });
  const entry = result.get("events")!;
  assertEquals(
    Object.keys(entry.mapped).length,
    2,
    "mapped should only contain config-mapped fields",
  );
  assert("eventID" in entry.mapped, "mapped should contain eventID");
  assert("eventDate" in entry.mapped, "mapped should contain eventDate");
  assert(
    Object.keys(entry.all).length > Object.keys(entry.mapped).length,
    "all should have more fields than mapped",
  );
});

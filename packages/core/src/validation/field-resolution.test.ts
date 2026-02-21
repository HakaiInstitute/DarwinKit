/**
 * Tests for field-resolution.ts — pure function tests for the 3-tier merge pipeline
 */

import { assert, assertEquals } from "@std/assert";
import type { ResolvedSpec, WorkspaceFieldMapping } from "@dwkt/domain/schemas";
import type { Constraint, SpecField } from "@dwkt/domain/specs";
import {
  FormatConstraint,
  obligationForStandard,
  obligationToRequirement,
  PatternConstraint,
  RangeConstraint,
  RequiredConstraint,
} from "@dwkt/domain/specs";
import {
  MissingFieldViolation,
  partitionFieldViolations,
  partitionSchemaViolations,
  RequiredFieldViolation,
  requirementToSeverity,
} from "@dwkt/domain/types";
import type { ResolutionDiagnostic } from "./field-resolution.ts";
import {
  addConstraints,
  deriveRequirementFromConstraints,
  requirementToConstraint,
  resolveActiveStandard,
  resolveSpecFields,
  withResolvedConstraints,
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
    fields: {},
    specFields: {},
    ...overrides,
  };
}

function rangeConstraint(
  min: number,
  max: number,
): Constraint {
  return new RangeConstraint({ min, max, inclusive: true });
}

function requiredConstraint(
  level: "required" | "recommended" | "optional" = "required",
): Constraint {
  return new RequiredConstraint({ level, allowEmpty: false, allowWhitespace: false });
}

function formatConstraint(
  format: "iso8601" | "url" | "decimal-degrees",
): Constraint {
  return new FormatConstraint({ format });
}

function patternConstraint(
  pattern: string,
): Constraint {
  return new PatternConstraint({ pattern });
}

// =============================================================================
// resolveActiveStandard Tests
// =============================================================================

Deno.test("resolveActiveStandard - returns the provided standard", () => {
  assertEquals(resolveActiveStandard("obis"), "obis");
  assertEquals(resolveActiveStandard("gbif"), "gbif");
});

Deno.test("resolveActiveStandard - defaults to obis when undefined", () => {
  assertEquals(resolveActiveStandard(undefined), "obis");
});

// =============================================================================
// obligationForStandard Tests
// =============================================================================

Deno.test("obligationForStandard - returns obligation and requirement for OBIS required", () => {
  const field: SpecField = {
    name: "eventDate",
    constraints: [],
    obligations: { obis: "required" },
  };
  const result = obligationForStandard(field, "obis");
  assertEquals(result?.obligation, "required");
  assertEquals(result?.requirement, "required");
});

Deno.test("obligationForStandard - returns obligation and requirement for GBIF required", () => {
  const field: SpecField = {
    name: "eventDate",
    constraints: [],
    obligations: { gbif: "required" },
  };
  const result = obligationForStandard(field, "gbif");
  assertEquals(result?.obligation, "required");
  assertEquals(result?.requirement, "required");
});

Deno.test("obligationForStandard - returns undefined when no obligations", () => {
  const field: SpecField = { name: "eventDate", constraints: [] };
  assertEquals(obligationForStandard(field, "obis"), undefined);
});

Deno.test("obligationForStandard - returns raw obligation for 'required (if exists)'", () => {
  const field: SpecField = {
    name: "parentEventID",
    constraints: [],
    obligations: { obis: "required (if exists)" },
  };
  const result = obligationForStandard(field, "obis");
  assertEquals(result?.obligation, "required (if exists)");
  assertEquals(result?.requirement, undefined);
});

// =============================================================================
// deriveRequirementFromConstraints Tests
// =============================================================================

Deno.test("deriveRequirementFromConstraints - required level → 'required'", () => {
  assertEquals(
    deriveRequirementFromConstraints([requiredConstraint("required")]),
    "required",
  );
});

Deno.test("deriveRequirementFromConstraints - recommended level → 'recommended'", () => {
  assertEquals(
    deriveRequirementFromConstraints([requiredConstraint("recommended")]),
    "recommended",
  );
});

Deno.test("deriveRequirementFromConstraints - optional level → 'optional'", () => {
  assertEquals(
    deriveRequirementFromConstraints([requiredConstraint("optional")]),
    "optional",
  );
});

Deno.test("deriveRequirementFromConstraints - no required constraints → undefined", () => {
  assertEquals(deriveRequirementFromConstraints([rangeConstraint(-90, 90)]), undefined);
  assertEquals(deriveRequirementFromConstraints(undefined), undefined);
});

// =============================================================================
// requirementToConstraint Tests
// =============================================================================

Deno.test("requirementToConstraint - 'required' produces required constraint", () => {
  const result = requirementToConstraint("required");
  assert(result._tag === "required");
  assert(result instanceof RequiredConstraint);
  assertEquals(result.level, "required");
});

Deno.test("requirementToConstraint - 'recommended' produces recommended constraint", () => {
  const result = requirementToConstraint("recommended");
  assert(result._tag === "required");
  assert(result instanceof RequiredConstraint);
  assertEquals(result.level, "recommended");
});

Deno.test("requirementToConstraint - 'optional' produces optional level constraint", () => {
  const result = requirementToConstraint("optional");
  assert(result._tag === "required");
  assert(result instanceof RequiredConstraint);
  assertEquals(result.level, "optional");
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

Deno.test("addConstraints - filters weaker RequiredConstraint and emits diagnostic", () => {
  const existing: Constraint[] = [requiredConstraint("required")];
  const additions: Constraint[] = [requiredConstraint("optional")];
  const tracker = { fieldName: "eventDate", overlapping: [] as string[], filtered: [] as string[] };

  const result = addConstraints(existing, additions, tracker);
  // Weaker 'optional' should be filtered out
  assertEquals(result.length, 1);
  const required = result.filter((c) => c._tag === "required") as RequiredConstraint[];
  assertEquals(required.length, 1);
  assertEquals(required[0].level, "required");

  // Diagnostic should record the filtering
  assertEquals(tracker.filtered.length, 1);
  assert(tracker.filtered[0].includes("optional"));
  assert(tracker.filtered[0].includes("required"));
});

Deno.test("addConstraints - keeps equal-strength RequiredConstraint (not weaker)", () => {
  const existing: Constraint[] = [requiredConstraint("required")];
  const additions: Constraint[] = [requiredConstraint("required")];

  const result = addConstraints(existing, additions);
  // Equal strength is allowed (additive)
  assertEquals(result.length, 2);
});

Deno.test("addConstraints - keeps stronger RequiredConstraint from config", () => {
  const existing: Constraint[] = [requiredConstraint("optional")];
  const additions: Constraint[] = [requiredConstraint("required")];

  const result = addConstraints(existing, additions);
  assertEquals(result.length, 2);
  const required = result.filter((c) => c._tag === "required");
  assertEquals(required.length, 2);
});

// =============================================================================
// resolveSpecFields Diagnostics Tests
// =============================================================================

Deno.test("resolveSpecFields - diagnostics records overlapping config constraints", () => {
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

  // Diagnostic records the overlap
  assertEquals(diagnostics.length, 1);
  assertEquals(diagnostics[0].fieldName, "decimalLatitude");
  assert(diagnostics[0].overlappingTypes.includes("range"));
  assert(diagnostics[0].message.includes("range"));
  assert(diagnostics[0].message.includes("decimalLatitude"));
});

Deno.test("resolveSpecFields - diagnostic message explains both constraints apply", () => {
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

  const diagnostics: ResolutionDiagnostic[] = [];
  resolveSpecFields(profile, "obis", configMappings, diagnostics);

  assertEquals(diagnostics.length, 1);
  const msg = diagnostics[0].message;
  assert(msg.includes("additional"), "Message should mention 'additional'");
  assert(msg.includes("range"), "Message should mention constraint type");
  assert(msg.includes("decimalLatitude"), "Message should mention field name");
  assert(
    msg.includes("data must satisfy both"),
    "Message should explain both constraints apply",
  );
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
  // Tier 2 uses mergeConstraints (replacement), so only one required constraint
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
// withResolvedConstraints Tests
// =============================================================================

Deno.test("withResolvedConstraints - applies resolved constraints to base field", () => {
  const baseField: SpecField = {
    name: "decimalLatitude",
    constraints: [rangeConstraint(-90, 90)],
  };
  const mapping: WorkspaceFieldMapping = {
    originName: "lat",
    targetName: "decimalLatitude",
    constraints: [rangeConstraint(-45, 45), requiredConstraint()],
  };

  const result = withResolvedConstraints(baseField, mapping);
  assertEquals(result.constraints.length, 2);
  assertEquals(result.name, "decimalLatitude"); // base field name preserved
});

Deno.test("withResolvedConstraints - returns base field when no resolved constraints", () => {
  const baseField: SpecField = {
    name: "eventDate",
    constraints: [formatConstraint("iso8601")],
  };
  const mapping: WorkspaceFieldMapping = {
    originName: "eventDate",
    targetName: "eventDate",
  };

  const result = withResolvedConstraints(baseField, mapping);
  assertEquals(result, baseField); // identical reference
});

Deno.test("withResolvedConstraints - returns base field when mapping is undefined", () => {
  const baseField: SpecField = {
    name: "eventDate",
    constraints: [formatConstraint("iso8601")],
  };

  const result = withResolvedConstraints(baseField, undefined);
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
        validatorType: "required",
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
        validatorType: "schema",
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

  await t.step(
    "OBIS 'required (if exists)' obligation → recommended level when field is mapped",
    () => {
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
      const requirement = deriveRequirementFromConstraints(
        resolved["parentEventID"]?.constraints,
      );
      assertEquals(requirement, "recommended");
    },
  );

  await t.step(
    "OBIS 'required (if exists)' obligation → no constraint when field is NOT mapped",
    () => {
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

      const resolved = resolveSpecFields(profile, "obis", []);
      const requirement = deriveRequirementFromConstraints(
        resolved["parentEventID"]?.constraints,
      );
      assertEquals(requirement, undefined);
    },
  );
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

Deno.test("resolveSpecFields - profile cannot weaken spec required to recommended", () => {
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

  assertEquals(required?.length, 1);
  assertEquals(required?.[0]?.level, "required");
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
  // Profile override uses mergeConstraints (replacement), so the WARNING-level
  // "required (if exists)" constraint should be replaced by the ERROR-level one.
  const requirement = deriveRequirementFromConstraints(resolved["parentEventID"]?.constraints);
  assertEquals(requirement, "required");
});

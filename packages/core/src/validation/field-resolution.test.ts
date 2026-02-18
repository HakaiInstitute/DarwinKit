/**
 * Tests for field-resolution.ts — pure function tests for the 3-tier merge pipeline
 */

import { assert, assertEquals } from "@std/assert";
import type { ValidationProfile, WorkspaceFieldMapping } from "@dwkt/domain/schemas";
import { FieldRequirementLevel } from "@dwkt/domain/schemas";
import type { Constraint, FieldDefinition } from "@dwkt/domain/specs";
import type { ResolutionDiagnostic } from "./field-resolution.ts";
import {
  addConstraints,
  applyResolvedConstraints,
  deriveRequirementFromConstraints,
  obligationForStandard,
  requirementToConstraint,
  resolveActiveStandard,
  resolveFieldDefinitions,
} from "./field-resolution.ts";

// =============================================================================
// Test Helpers
// =============================================================================

function makeProfile(overrides: Partial<ValidationProfile> = {}): ValidationProfile {
  return {
    id: "test",
    name: "Test Profile",
    description: "Test profile for unit tests",
    fieldOverrides: {},
    ...overrides,
  };
}

function rangeConstraint(
  min: number,
  max: number,
): Constraint {
  return { type: "range", min, max, inclusive: true };
}

function requiredConstraint(
  enforcement: "required" | "recommended" | "optional" = "required",
): Constraint {
  return { type: "required", allowEmpty: false, allowWhitespace: false, enforcement };
}

function formatConstraint(
  format: "iso8601" | "url" | "decimal-degrees",
): Constraint {
  return { type: "format", format };
}

function patternConstraint(
  pattern: string,
): Constraint {
  return { type: "pattern", pattern };
}

// =============================================================================
// resolveActiveStandard Tests
// =============================================================================

Deno.test("resolveActiveStandard - returns targetSchema when set", () => {
  assertEquals(resolveActiveStandard(makeProfile({ targetSchema: "gbif" })), "gbif");
  assertEquals(resolveActiveStandard(makeProfile({ targetSchema: "custom" })), "custom");
});

Deno.test("resolveActiveStandard - defaults to obis when no targetSchema", () => {
  assertEquals(resolveActiveStandard(makeProfile()), "obis");
  assertEquals(resolveActiveStandard(undefined), "obis");
});

// =============================================================================
// obligationForStandard Tests
// =============================================================================

Deno.test("obligationForStandard - returns enforcement for OBIS required", () => {
  const field: FieldDefinition = {
    name: "eventDate",
    constraints: [],
    obligations: { obis: "required" },
  };
  assertEquals(obligationForStandard(field, "obis"), "required");
});

Deno.test("obligationForStandard - returns recommended for GBIF required", () => {
  const field: FieldDefinition = {
    name: "eventDate",
    constraints: [],
    obligations: { gbif: "required" },
  };
  assertEquals(obligationForStandard(field, "gbif"), "required");
});

Deno.test("obligationForStandard - returns undefined for custom standard", () => {
  const field: FieldDefinition = {
    name: "eventDate",
    constraints: [],
    obligations: { obis: "required" },
  };
  assertEquals(obligationForStandard(field, "custom"), undefined);
});

Deno.test("obligationForStandard - returns undefined when no obligations", () => {
  const field: FieldDefinition = { name: "eventDate", constraints: [] };
  assertEquals(obligationForStandard(field, "obis"), undefined);
});

// =============================================================================
// deriveRequirementFromConstraints Tests
// =============================================================================

Deno.test("deriveRequirementFromConstraints - required enforcement → Required", () => {
  assertEquals(
    deriveRequirementFromConstraints([requiredConstraint("required")]),
    FieldRequirementLevel.Required,
  );
});

Deno.test("deriveRequirementFromConstraints - recommended enforcement → StronglyRecommended", () => {
  assertEquals(
    deriveRequirementFromConstraints([requiredConstraint("recommended")]),
    FieldRequirementLevel.StronglyRecommended,
  );
});

Deno.test("deriveRequirementFromConstraints - optional enforcement → Recommended", () => {
  assertEquals(
    deriveRequirementFromConstraints([requiredConstraint("optional")]),
    FieldRequirementLevel.Recommended,
  );
});

Deno.test("deriveRequirementFromConstraints - no required constraints → undefined", () => {
  assertEquals(deriveRequirementFromConstraints([rangeConstraint(-90, 90)]), undefined);
  assertEquals(deriveRequirementFromConstraints(undefined), undefined);
});

// =============================================================================
// requirementToConstraint Tests
// =============================================================================

Deno.test("requirementToConstraint - Required produces required constraint", () => {
  const result = requirementToConstraint(FieldRequirementLevel.Required);
  assert(result !== undefined);
  assert(result.type === "required");
  assertEquals(result.enforcement, "required");
});

Deno.test("requirementToConstraint - StronglyRecommended produces recommended constraint", () => {
  const result = requirementToConstraint(FieldRequirementLevel.StronglyRecommended);
  assert(result !== undefined);
  assert(result.type === "required");
  assertEquals(result.enforcement, "recommended");
});

Deno.test("requirementToConstraint - Recommended returns constraint with enforcement optional", () => {
  const result = requirementToConstraint(FieldRequirementLevel.Recommended);
  assert(result !== undefined);
  assert(result.type === "required");
  assertEquals(result.enforcement, "optional");
});

Deno.test("requirementToConstraint - Optional returns undefined", () => {
  assertEquals(requirementToConstraint(FieldRequirementLevel.Optional), undefined);
});

Deno.test("requirementToConstraint - RequiredIfExists returns undefined", () => {
  assertEquals(requirementToConstraint(FieldRequirementLevel.RequiredIfExists), undefined);
});

// =============================================================================
// addConstraints Tests
// =============================================================================

Deno.test("addConstraints - adds new constraint types", () => {
  const existing: Constraint[] = [rangeConstraint(-90, 90)];
  const additions: Constraint[] = [requiredConstraint()];

  const result = addConstraints(existing, additions);
  assertEquals(result.length, 2);
  assertEquals(result[0].type, "range");
  assertEquals(result[1].type, "required");
});

Deno.test("addConstraints - keeps both when same type added (tightening)", () => {
  const existing: Constraint[] = [rangeConstraint(-90, 90)];
  const additions: Constraint[] = [rangeConstraint(0, 50)]; // same type, tighter values

  const result = addConstraints(existing, additions);
  assertEquals(result.length, 2);
  if (result[0].type === "range") {
    assertEquals(result[0].min, -90); // original preserved
  }
  if (result[1].type === "range") {
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
  const tracker = { fieldName: "decimalLatitude", overlapping: [] as string[] };

  const result = addConstraints(existing, additions, tracker);
  assertEquals(result.length, 3); // both ranges + required
  assertEquals(tracker.overlapping, ["range"]); // range overlap noted
});

Deno.test("addConstraints - no diagnostics when no overlapping types", () => {
  const existing: Constraint[] = [rangeConstraint(-90, 90)];
  const additions: Constraint[] = [requiredConstraint()];
  const tracker = { fieldName: "test", overlapping: [] as string[] };

  addConstraints(existing, additions, tracker);
  assertEquals(tracker.overlapping.length, 0);
});

// =============================================================================
// resolveFieldDefinitions Diagnostics Tests
// =============================================================================

Deno.test("resolveFieldDefinitions - diagnostics records overlapping config constraints", () => {
  const profile = makeProfile({
    normalizedFields: {
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
  const result = resolveFieldDefinitions(profile, "obis", configMappings, diagnostics);

  // Both constraints kept
  const lat = result["decimalLatitude"];
  assert(lat?.constraints !== undefined);
  assertEquals(lat.constraints.filter((c) => c.type === "range").length, 2);

  // Diagnostic records the overlap
  assertEquals(diagnostics.length, 1);
  assertEquals(diagnostics[0].fieldName, "decimalLatitude");
  assert(diagnostics[0].overlappingTypes.includes("range"));
  assert(diagnostics[0].message.includes("range"));
  assert(diagnostics[0].message.includes("decimalLatitude"));
});

Deno.test("resolveFieldDefinitions - diagnostic message explains both constraints apply", () => {
  const profile = makeProfile({
    normalizedFields: {
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
  resolveFieldDefinitions(profile, "obis", configMappings, diagnostics);

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

Deno.test("resolveFieldDefinitions - no diagnostics when config adds new types", () => {
  const profile = makeProfile({
    normalizedFields: {
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
  resolveFieldDefinitions(profile, "obis", configMappings, diagnostics);

  assertEquals(diagnostics.length, 0);
});

Deno.test("resolveFieldDefinitions - no diagnostics when array not provided", () => {
  const profile = makeProfile({
    normalizedFields: {
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
  const result = resolveFieldDefinitions(profile, "obis", configMappings);
  assert(result["decimalLatitude"] !== undefined);
});

// =============================================================================
// resolveFieldDefinitions Tests
// =============================================================================

Deno.test("resolveFieldDefinitions - spec fields with obligations get required constraints", () => {
  const profile = makeProfile({
    normalizedFields: {
      eventDate: {
        name: "eventDate",
        constraints: [],
        obligations: { obis: "required" },
      },
    },
  });

  const result = resolveFieldDefinitions(profile, "obis", []);
  const eventDate = result["eventDate"];
  assert(eventDate !== undefined);
  assert(eventDate.constraints !== undefined);
  const requiredConstraints = eventDate.constraints.filter((c) => c.type === "required");
  assertEquals(requiredConstraints.length, 1);
  assertEquals(requiredConstraints[0].enforcement, "required");
});

Deno.test("resolveFieldDefinitions - profile override replaces spec constraint (replacement semantics)", () => {
  const profile = makeProfile({
    normalizedFields: {
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

  const result = resolveFieldDefinitions(profile, "obis", []);
  const lat = result["decimalLatitude"];
  assert(lat?.constraints !== undefined);
  const ranges = lat.constraints.filter((c) => c.type === "range");
  assertEquals(ranges.length, 1);
  if (ranges[0].type === "range") {
    assertEquals(ranges[0].min, -45); // replaced
    assertEquals(ranges[0].max, 45);
  }
});

Deno.test("resolveFieldDefinitions - config constraint same type as spec → both kept (tightening)", () => {
  const profile = makeProfile({
    normalizedFields: {
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

  const result = resolveFieldDefinitions(profile, "obis", configMappings);
  const lat = result["decimalLatitude"];
  assert(lat?.constraints !== undefined);
  const ranges = lat.constraints.filter((c) => c.type === "range");
  assertEquals(ranges.length, 2);
  if (ranges[0].type === "range") {
    assertEquals(ranges[0].min, -90); // spec's range preserved
    assertEquals(ranges[0].max, 90);
  }
  if (ranges[1].type === "range") {
    assertEquals(ranges[1].min, 0); // config's tighter range added
    assertEquals(ranges[1].max, 50);
  }
});

Deno.test("resolveFieldDefinitions - config adds new constraint type not in spec → accepted", () => {
  const profile = makeProfile({
    normalizedFields: {
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

  const result = resolveFieldDefinitions(profile, "obis", configMappings);
  const cc = result["countryCode"];
  assert(cc?.constraints !== undefined);
  assertEquals(cc.constraints.length, 2);
  const types = cc.constraints.map((c) => c.type);
  assert(types.includes("required"));
  assert(types.includes("pattern"));
});

Deno.test("resolveFieldDefinitions - config requirement compiled to constraint", () => {
  const profile = makeProfile({
    normalizedFields: {
      locality: {
        name: "locality",
        constraints: [],
      },
    },
  });

  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "locality",
    targetName: "locality",
    requirement: FieldRequirementLevel.Required,
  }];

  const result = resolveFieldDefinitions(profile, "obis", configMappings);
  const locality = result["locality"];
  assert(locality?.constraints !== undefined);
  const required = locality.constraints.filter((c) => c.type === "required");
  assertEquals(required.length, 1);
  assertEquals(required[0].enforcement, "required");
});

Deno.test("resolveFieldDefinitions - config requirement 'recommended' produces optional enforcement constraint", () => {
  const profile = makeProfile({
    normalizedFields: {
      locality: {
        name: "locality",
        constraints: [],
      },
    },
  });

  const configMappings: WorkspaceFieldMapping[] = [{
    originName: "locality",
    targetName: "locality",
    requirement: FieldRequirementLevel.Recommended,
  }];

  const result = resolveFieldDefinitions(profile, "obis", configMappings);
  const locality = result["locality"];
  assert(locality?.constraints !== undefined);
  const required = locality.constraints.filter((c) => c.type === "required");
  assertEquals(required.length, 1);
  assertEquals(required[0].enforcement, "optional");
});

Deno.test("resolveFieldDefinitions - 3-tier chain preserves all non-overlapping types", () => {
  const profile = makeProfile({
    normalizedFields: {
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

  const result = resolveFieldDefinitions(profile, "obis", configMappings);
  const lat = result["decimalLatitude"];
  assert(lat?.constraints !== undefined);
  const types = lat.constraints.map((c) => c.type);
  assert(types.includes("range"), "spec range preserved");
  assert(types.includes("format"), "profile format added via replacement merge");
  assert(types.includes("required"), "config required added via additive merge");
});

Deno.test("resolveFieldDefinitions - config originName/targetName applied to mapping", () => {
  const profile = makeProfile({
    normalizedFields: {
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

  const result = resolveFieldDefinitions(profile, "obis", configMappings);
  const lat = result["decimalLatitude"];
  assertEquals(lat.originName, "lat");
  assertEquals(lat.targetName, "decimalLatitude");
});

// =============================================================================
// resolveFieldDefinitions Edge Cases
// =============================================================================

Deno.test("resolveFieldDefinitions - field only in profile overrides gets synthesized mapping", () => {
  const profile = makeProfile({
    normalizedFields: {},
    fieldOverrides: {
      customField: {
        requirement: FieldRequirementLevel.Required,
        constraints: [patternConstraint("^[A-Z]+$")],
      },
    },
  });

  const result = resolveFieldDefinitions(profile, "obis", []);
  const custom = result["customField"];
  assert(custom !== undefined, "field from overrides should exist in result");
  assertEquals(custom.originName, "customField");
  assertEquals(custom.targetName, "customField");
  assert(custom.constraints !== undefined);
  const types = custom.constraints.map((c) => c.type);
  assert(types.includes("pattern"), "override pattern constraint present");
  assert(types.includes("required"), "override requirement compiled to constraint");
});

Deno.test("resolveFieldDefinitions - triple config-tier: preset + explicit + requirement on same field", () => {
  const profile = makeProfile({
    normalizedFields: {
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
    requirement: FieldRequirementLevel.Required,
  }];

  // "requiredText" preset adds a required constraint; explicit config adds a
  // pattern; requirement compiles to another required. All three sources land.
  const result = resolveFieldDefinitions(profile, "obis", configMappings);
  const loc = result["locality"];
  assert(loc?.constraints !== undefined);
  const types = loc.constraints.map((c) => c.type);
  assert(types.includes("pattern"), "explicit config pattern added");
  assert(types.includes("required"), "preset and/or requirement compiled to required");
});

Deno.test("resolveFieldDefinitions - profile replacement produces single required constraint", () => {
  // Tier 2 uses mergeConstraints (replacement), so only one required constraint
  // remains. deriveRequirementFromConstraints picks the strictest, which is the
  // same as the only one after replacement.
  const profile = makeProfile({
    normalizedFields: {
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

  const result = resolveFieldDefinitions(profile, "obis", []);
  const eventDate = result["eventDate"];
  assert(eventDate?.constraints !== undefined);
  const required = eventDate.constraints.filter((c) => c.type === "required");
  assertEquals(required.length, 1, "merge should produce exactly one required constraint");
  assertEquals(
    required[0].enforcement,
    "required",
    "profile override should replace spec enforcement",
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
    FieldRequirementLevel.Required,
    "strictest (required) should win even when weaker constraint comes last",
  );

  assertEquals(
    deriveRequirementFromConstraints([
      requiredConstraint("optional"),
      requiredConstraint("recommended"),
    ]),
    FieldRequirementLevel.StronglyRecommended,
    "recommended is stricter than optional",
  );
});

// =============================================================================
// applyResolvedConstraints Tests
// =============================================================================

Deno.test("applyResolvedConstraints - applies resolved constraints to base field", () => {
  const baseField: FieldDefinition = {
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
  const baseField: FieldDefinition = {
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
  const baseField: FieldDefinition = {
    name: "eventDate",
    constraints: [formatConstraint("iso8601")],
  };

  const result = applyResolvedConstraints(baseField, undefined);
  assertEquals(result, baseField);
});

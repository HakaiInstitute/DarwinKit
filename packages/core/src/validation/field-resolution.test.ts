/**
 * Tests for field-resolution.ts — pure function tests for the 3-tier merge pipeline
 */

import { assert, assertEquals } from "@std/assert";
import type { ValidationProfile, WorkspaceFieldMapping } from "@dwkt/domain/schemas";
import { FieldRequirementLevel } from "@dwkt/domain/schemas";
import type { Constraint, FieldDefinition } from "@dwkt/domain/specs";
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
  enforcement: Constraint["enforcement"] = "required",
): Constraint {
  return { type: "range", min, max, inclusive: true, enforcement };
}

function requiredConstraint(enforcement: Constraint["enforcement"] = "required"): Constraint {
  return { type: "required", allowEmpty: false, allowWhitespace: false, enforcement };
}

function formatConstraint(
  format: "iso8601" | "url" | "decimal-degrees",
  enforcement: Constraint["enforcement"] = "required",
): Constraint {
  return { type: "format", format, enforcement };
}

function patternConstraint(
  pattern: string,
  enforcement: Constraint["enforcement"] = "required",
): Constraint {
  return { type: "pattern", pattern, enforcement };
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

Deno.test("deriveRequirementFromConstraints - optional enforcement → undefined", () => {
  assertEquals(
    deriveRequirementFromConstraints([requiredConstraint("optional")]),
    undefined,
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
  assertEquals(result.type, "required");
  assertEquals(result.enforcement, "required");
});

Deno.test("requirementToConstraint - StronglyRecommended produces recommended constraint", () => {
  const result = requirementToConstraint(FieldRequirementLevel.StronglyRecommended);
  assert(result !== undefined);
  assertEquals(result.type, "required");
  assertEquals(result.enforcement, "recommended");
});

Deno.test("requirementToConstraint - Recommended returns undefined (no phantom constraint)", () => {
  assertEquals(requirementToConstraint(FieldRequirementLevel.Recommended), undefined);
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

Deno.test("addConstraints - ignores duplicate constraint types", () => {
  const existing: Constraint[] = [rangeConstraint(-90, 90)];
  const additions: Constraint[] = [rangeConstraint(0, 50)]; // same type, different values

  const result = addConstraints(existing, additions);
  assertEquals(result.length, 1);
  if (result[0].type === "range") {
    assertEquals(result[0].min, -90); // original preserved
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

Deno.test("resolveFieldDefinitions - config constraint type already in spec → ignored (additive-only)", () => {
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
    constraints: [rangeConstraint(0, 50)], // attempt to override range
  }];

  const result = resolveFieldDefinitions(profile, "obis", configMappings);
  const lat = result["decimalLatitude"];
  assert(lat?.constraints !== undefined);
  const ranges = lat.constraints.filter((c) => c.type === "range");
  assertEquals(ranges.length, 1);
  if (ranges[0].type === "range") {
    assertEquals(ranges[0].min, -90); // spec's range preserved
    assertEquals(ranges[0].max, 90);
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

Deno.test("resolveFieldDefinitions - config requirement 'recommended' returns no phantom constraint", () => {
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
  assertEquals(locality?.constraints, undefined); // no constraints generated
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

/**
 * Tests for validation violation types and enrichment
 */

import { assertEquals } from "@std/assert";
import {
  enforcementToSeverity,
  enrichViolation,
  type RawViolation,
} from "./validation-violation.ts";
import { ErrorSeverity } from "../errors/severity.ts";
import type { FieldDefinition } from "../specs/field-definition.ts";
import type { ValidatorConfig } from "../specs/validators.ts";

// Mock field definition for testing
const mockField: FieldDefinition = {
  id: "dwc-decimalLatitude",
  schemaId: "dwc",
  name: "decimalLatitude",
  semanticType: "location",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/decimalLatitude",
  label: "Decimal Latitude",
  definition: "The geographic latitude",
  examples: ["41.0983", "-120.9384"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2023-09-13"),
};

Deno.test("enforcementToSeverity - maps required to ERROR", () => {
  assertEquals(enforcementToSeverity("required"), ErrorSeverity.ERROR);
});

Deno.test("enforcementToSeverity - maps recommended to WARNING", () => {
  assertEquals(enforcementToSeverity("recommended"), ErrorSeverity.WARNING);
});

Deno.test("enforcementToSeverity - maps optional to INFO", () => {
  assertEquals(enforcementToSeverity("optional"), ErrorSeverity.INFO);
});

Deno.test("enrichViolation - uses validator's enforcement by default", () => {
  const raw: RawViolation = {
    rowNumber: 5,
    value: 95.0,
  };

  const validator: ValidatorConfig = {
    type: "range",
    enforcement: "required",
    params: { min: -90, max: 90 },
    message: "Latitude must be between -90 and 90",
  };

  const enriched = enrichViolation(raw, validator, mockField, "lat");

  assertEquals(enriched.enforcement, "required");
  assertEquals(enriched.severity, ErrorSeverity.ERROR);
  assertEquals(enriched.fieldName, "lat");
  assertEquals(enriched.targetName, "decimalLatitude");
  assertEquals(enriched.rowNumber, 5);
  assertEquals(enriched.violationType, "range");
  assertEquals(enriched.value, "95");
  assertEquals(enriched.errorMessage, "Latitude must be between -90 and 90");
  assertEquals(enriched.validatorType, "range");
  assertEquals(enriched.params, { min: -90, max: 90 });
});

Deno.test("enrichViolation - uses raw enforcement override", () => {
  const raw: RawViolation = {
    rowNumber: 10,
    value: 100,
    enforcement: "recommended", // Override to warning
    message: "Slightly out of range",
  };

  const validator: ValidatorConfig = {
    type: "range",
    enforcement: "required", // Default is error
    params: { min: 0, max: 90 },
    message: "Value out of range",
  };

  const enriched = enrichViolation(raw, validator, mockField, "fieldName");

  // Should use raw enforcement override
  assertEquals(enriched.enforcement, "recommended");
  assertEquals(enriched.severity, ErrorSeverity.WARNING);
  assertEquals(enriched.errorMessage, "Slightly out of range");
});

Deno.test("enrichViolation - uses raw custom message", () => {
  const raw: RawViolation = {
    rowNumber: 3,
    value: -95,
    message: "Custom error message",
  };

  const validator: ValidatorConfig = {
    type: "range",
    enforcement: "required",
    params: { min: -90, max: 90 },
    message: "Default message",
  };

  const enriched = enrichViolation(raw, validator, mockField, "lat");

  assertEquals(enriched.errorMessage, "Custom error message");
});

Deno.test("enrichViolation - falls back to validator message", () => {
  const raw: RawViolation = {
    rowNumber: 7,
    value: 95,
  };

  const validator: ValidatorConfig = {
    type: "range",
    enforcement: "required",
    params: { min: -90, max: 90 },
    message: "Validator default message",
  };

  const enriched = enrichViolation(raw, validator, mockField, "lat");

  assertEquals(enriched.errorMessage, "Validator default message");
});

Deno.test("enrichViolation - falls back to generic message if none provided", () => {
  const raw: RawViolation = {
    rowNumber: 8,
    value: 95,
  };

  const validator: ValidatorConfig = {
    type: "range",
    enforcement: "required",
    params: { min: -90, max: 90 },
    // No message provided
  };

  const enriched = enrichViolation(raw, validator, mockField, "lat");

  assertEquals(enriched.errorMessage, "Validation failed");
});

Deno.test("enrichViolation - preserves transformation data", () => {
  const raw: RawViolation = {
    rowNumber: 12,
    value: 95.5,
    csvValue: "95.5°N",
    transformedValue: 95.5,
    transformationChain: {
      sourceValue: "95.5°N",
      transformedValue: 95.5,
      transformations: [
        {
          category: "explicit",
          function: "extractFromPattern",
          description: "Strip degree symbol",
          parameters: { pattern: "([0-9.]+)°?", captureGroup: 1 },
        },
      ],
    },
  };

  const validator: ValidatorConfig = {
    type: "range",
    enforcement: "required",
    params: { min: -90, max: 90 },
    message: "Invalid latitude",
  };

  const enriched = enrichViolation(raw, validator, mockField, "lat");

  assertEquals(enriched.csvValue, "95.5°N");
  assertEquals(enriched.transformedValue, 95.5);
  assertEquals(enriched.transformationChain?.sourceValue, "95.5°N");
  assertEquals(enriched.transformationChain?.transformations.length, 1);
});

Deno.test("enrichViolation - preserves suggested values", () => {
  const raw: RawViolation = {
    rowNumber: 15,
    value: "Humam",
    suggestedValues: ["Human", "HumanObservation"],
  };

  const validator: ValidatorConfig = {
    type: "pattern",
    enforcement: "required",
    message: "Invalid value",
  };

  const enriched = enrichViolation(raw, validator, mockField, "basisOfRecord");

  assertEquals(enriched.suggestedValues, ["Human", "HumanObservation"]);
});

Deno.test("enrichViolation - converts value to string", () => {
  const testCases: Array<{ input: unknown; expected: string }> = [
    { input: 42, expected: "42" },
    { input: 3.14, expected: "3.14" },
    { input: "text", expected: "text" },
    { input: true, expected: "true" },
    { input: null, expected: "null" },
    { input: undefined, expected: "undefined" },
  ];

  const validator: ValidatorConfig = {
    type: "range",
    enforcement: "required",
    message: "Test",
  };

  for (const { input, expected } of testCases) {
    const raw: RawViolation = {
      rowNumber: 1,
      value: input,
    };

    const enriched = enrichViolation(raw, validator, mockField, "test");
    assertEquals(enriched.value, expected);
  }
});

Deno.test("enrichViolation - handles all enforcement levels", () => {
  const validator: ValidatorConfig = {
    type: "range",
    enforcement: "required",
    params: { min: 0, max: 100 },
    message: "Value out of range",
  };

  // Test required
  const requiredRaw: RawViolation = {
    rowNumber: 1,
    value: 150,
    enforcement: "required",
  };
  const requiredEnriched = enrichViolation(requiredRaw, validator, mockField, "field");
  assertEquals(requiredEnriched.enforcement, "required");
  assertEquals(requiredEnriched.severity, ErrorSeverity.ERROR);

  // Test recommended
  const recommendedRaw: RawViolation = {
    rowNumber: 2,
    value: 150,
    enforcement: "recommended",
  };
  const recommendedEnriched = enrichViolation(recommendedRaw, validator, mockField, "field");
  assertEquals(recommendedEnriched.enforcement, "recommended");
  assertEquals(recommendedEnriched.severity, ErrorSeverity.WARNING);

  // Test optional
  const optionalRaw: RawViolation = {
    rowNumber: 3,
    value: 150,
    enforcement: "optional",
  };
  const optionalEnriched = enrichViolation(optionalRaw, validator, mockField, "field");
  assertEquals(optionalEnriched.enforcement, "optional");
  assertEquals(optionalEnriched.severity, ErrorSeverity.INFO);
});

Deno.test("enrichViolation - handles different validator types", () => {
  const raw: RawViolation = {
    rowNumber: 1,
    value: "test",
  };

  const validatorTypes = ["range", "pattern", "unique", "length"] as const;

  for (const type of validatorTypes) {
    const validator: ValidatorConfig = {
      type,
      enforcement: "required",
      message: `${type} violation`,
    };

    const enriched = enrichViolation(raw, validator, mockField, "test");
    // Note: violationType will be cast from validator type
    assertEquals(enriched.validatorType, type);
  }
});

// Import the enrichCrossDatasetViolation function
import { enrichCrossDatasetViolation } from "./validation-violation.ts";

Deno.test("enrichCrossDatasetViolation - uses rule's enforcement by default", () => {
  const raw: RawViolation = {
    rowNumber: 5,
    value: "E2",
  };

  const rule = {
    ruleType: "foreignKey",
    sourceDataset: "occurrences",
    sourceField: "eventID",
    targetDataset: "events",
    targetField: "eventID",
    enforcement: "required" as const,
  };

  const enriched = enrichCrossDatasetViolation(raw, rule);

  assertEquals(enriched.enforcement, "required");
  assertEquals(enriched.severity, ErrorSeverity.ERROR);
  assertEquals(enriched.fieldName, "eventID");
  assertEquals(enriched.targetName, "eventID");
  assertEquals(enriched.rowNumber, 5);
  assertEquals(enriched.violationType, "cross-dataset");
  assertEquals(enriched.value, "E2");
  assertEquals(
    enriched.errorMessage,
    "Value 'E2' in occurrences.eventID does not exist in events.eventID",
  );
  assertEquals(enriched.validatorType, "foreignKey");
  assertEquals(enriched.params, {
    sourceDataset: "occurrences",
    targetDataset: "events",
    targetField: "eventID",
  });
});

Deno.test("enrichCrossDatasetViolation - defaults to required when no enforcement specified", () => {
  const raw: RawViolation = {
    rowNumber: 10,
    value: "E99",
  };

  const rule = {
    sourceDataset: "occurrences",
    sourceField: "eventID",
    targetDataset: "events",
    targetField: "eventID",
  };

  const enriched = enrichCrossDatasetViolation(raw, rule);

  assertEquals(enriched.enforcement, "required");
  assertEquals(enriched.severity, ErrorSeverity.ERROR);
});

Deno.test("enrichCrossDatasetViolation - uses raw enforcement override", () => {
  const raw: RawViolation = {
    rowNumber: 10,
    value: "E99",
    enforcement: "recommended", // Override to warning
  };

  const rule = {
    sourceDataset: "occurrences",
    sourceField: "eventID",
    targetDataset: "events",
    targetField: "eventID",
    enforcement: "required" as const, // Default is error
  };

  const enriched = enrichCrossDatasetViolation(raw, rule);

  // Should use raw enforcement override
  assertEquals(enriched.enforcement, "recommended");
  assertEquals(enriched.severity, ErrorSeverity.WARNING);
});

Deno.test("enrichCrossDatasetViolation - handles recommended enforcement", () => {
  const raw: RawViolation = {
    rowNumber: 15,
    value: "PARENT-99",
  };

  const rule = {
    ruleType: "foreignKey",
    sourceDataset: "occurrences",
    sourceField: "parentEventID",
    targetDataset: "events",
    targetField: "eventID",
    enforcement: "recommended" as const,
  };

  const enriched = enrichCrossDatasetViolation(raw, rule);

  assertEquals(enriched.enforcement, "recommended");
  assertEquals(enriched.severity, ErrorSeverity.WARNING);
  assertEquals(
    enriched.errorMessage,
    "Value 'PARENT-99' in occurrences.parentEventID does not exist in events.eventID",
  );
});

Deno.test("enrichCrossDatasetViolation - handles optional enforcement", () => {
  const raw: RawViolation = {
    rowNumber: 20,
    value: "REF-123",
  };

  const rule = {
    ruleType: "referentialIntegrity",
    sourceDataset: "measurements",
    sourceField: "relatedID",
    targetDataset: "occurrences",
    targetField: "occurrenceID",
    enforcement: "optional" as const,
  };

  const enriched = enrichCrossDatasetViolation(raw, rule);

  assertEquals(enriched.enforcement, "optional");
  assertEquals(enriched.severity, ErrorSeverity.INFO);
  assertEquals(enriched.validatorType, "referentialIntegrity");
});

Deno.test("enrichCrossDatasetViolation - uses custom message", () => {
  const raw: RawViolation = {
    rowNumber: 25,
    value: "E404",
    message: "Custom foreign key error message",
  };

  const rule = {
    sourceDataset: "occurrences",
    sourceField: "eventID",
    targetDataset: "events",
    targetField: "eventID",
  };

  const enriched = enrichCrossDatasetViolation(raw, rule);

  assertEquals(enriched.errorMessage, "Custom foreign key error message");
});

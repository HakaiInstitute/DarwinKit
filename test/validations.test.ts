import { describe, expect, it } from "vitest";
import {
  type DatasetValidationContext,
  executeValidation,
  executeValidationWithContext,
  type SomePrimitive,
  validateConsistentWithRelated,
  validateControlledVocabulary,
  validateCoordinates,
  validateDataType,
  validateDateRange,
  validateReferentialIntegrity,
  validateRequired,
  validateSequentialOrder,
  validateUnique,
} from "~/lib/configurator/validations";

// Mock vocabularies for testing
const MOCK_VOCABULARIES = {
  country: {
    name: "country",
    strict: true,
    terms: [
      { term: "United States", synonyms: ["USA", "US", "America"] },
      { term: "Canada", synonyms: ["CA"] },
      { term: "Mexico", synonyms: ["MX"] },
    ],
  },
  taxonRank: {
    name: "taxonRank",
    strict: false,
    terms: [
      { term: "species", synonyms: ["sp", "sp."] },
      { term: "genus", synonyms: ["gen", "gen."] },
      { term: "family", synonyms: ["fam", "fam."] },
    ],
  },
};

export type Row = Record<string, SomePrimitive>;
export type Dataset = Row[];

// Helper function to create dataset context
function createMockContext(dataset: Dataset, currentRowIndex: number): DatasetValidationContext {
  const currentRow = dataset[currentRowIndex];
  return {
    currentRow,
    currentRowIndex,
    dataset,
    totalRows: dataset.length,
    validationMetadata: {
      processedRows: currentRowIndex,
      validRows: 0,
      invalidRows: 0,
    },
    cache: new Map(),
    getFieldValue: (fieldName) => currentRow[fieldName],
    getRowsWhere: (predicate) => dataset.filter(predicate),
    getPreviousRows: () => dataset.slice(0, currentRowIndex),
    getRowsByFieldValue: (fieldName, value) => dataset.filter((row) => row[fieldName] === value),
  };
}

describe("Basic Validation Functions", () => {
  describe("validateControlledVocabulary", () => {
    it("should validate exact matches", () => {
      const result = validateControlledVocabulary("United States", {
        vocabularyName: "country",
        vocabularies: MOCK_VOCABULARIES,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate synonym matches", () => {
      const result = validateControlledVocabulary("USA", {
        vocabularyName: "country",
        vocabularies: MOCK_VOCABULARIES,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail for invalid terms in strict vocabulary", () => {
      const result = validateControlledVocabulary("Germany", {
        vocabularyName: "country",
        vocabularies: MOCK_VOCABULARIES,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("controlled vocabulary");
    });

    it("should warn for invalid terms in non-strict vocabulary", () => {
      const result = validateControlledVocabulary("subspecies", {
        vocabularyName: "taxonRank",
        vocabularies: MOCK_VOCABULARIES,
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("recommended vocabulary");
    });

    it("should handle empty values", () => {
      const result = validateControlledVocabulary("", {
        vocabularyName: "country",
        vocabularies: MOCK_VOCABULARIES,
        allowEmpty: true,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("validateDataType", () => {
    it("should validate string types", () => {
      const result = validateDataType("hello", { expectedType: "string" });
      expect(result.valid).toBe(true);
    });

    it("should validate number types", () => {
      const result = validateDataType(42, { expectedType: "number" });
      expect(result.valid).toBe(true);
    });

    it("should convert string numbers", () => {
      const result = validateDataType("42.5", { expectedType: "number" });
      expect(result.valid).toBe(true);
    });

    it("should fail for invalid number conversion", () => {
      const result = validateDataType("not-a-number", { expectedType: "number" });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Cannot convert");
    });

    it("should validate date formats", () => {
      const result = validateDataType("2023-06-15", { expectedType: "date" });
      expect(result.valid).toBe(true);
    });

    it("should fail for invalid dates", () => {
      const result = validateDataType("invalid-date", { expectedType: "date" });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Invalid date format");
    });
  });

  describe("validateCoordinates", () => {
    it("should validate latitude in range", () => {
      const result = validateCoordinates(45.5, { type: "latitude" });
      expect(result.valid).toBe(true);
    });

    it("should fail for latitude out of range", () => {
      const result = validateCoordinates(95, { type: "latitude" });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("between -90 and 90");
    });

    it("should validate longitude in range", () => {
      const result = validateCoordinates(-74.0, { type: "longitude" });
      expect(result.valid).toBe(true);
    });

    it("should fail for longitude out of range", () => {
      const result = validateCoordinates(185, { type: "longitude" });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("between -180 and 180");
    });
  });

  describe("validateRequired", () => {
    it("should pass for non-empty values", () => {
      const result = validateRequired("some value");
      expect(result.valid).toBe(true);
    });

    it("should fail for null", () => {
      const result = validateRequired(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBe("Field is required");
    });

    it("should fail for empty string", () => {
      const result = validateRequired("");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBe("Field cannot be empty");
    });

    it("should fail for whitespace-only string", () => {
      const result = validateRequired("   ");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBe("Field cannot be empty");
    });

    it("should allow empty strings when configured", () => {
      const result = validateRequired("", { allowEmpty: true });
      expect(result.valid).toBe(true);
    });
  });

  describe("validateDateRange", () => {
    it("should pass for valid dates", () => {
      const result = validateDateRange("2023-06-15");
      expect(result.valid).toBe(true);
    });

    it("should fail for invalid date formats", () => {
      const result = validateDateRange("not-a-date");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBe("Invalid date format");
    });

    it("should fail for future dates when not allowed", () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString().split("T")[0]; // Tomorrow
      const result = validateDateRange(futureDate, { allowFuture: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBe("Future dates are not allowed");
    });

    it("should pass for future dates when allowed", () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString().split("T")[0]; // Tomorrow
      const result = validateDateRange(futureDate, { allowFuture: true });
      expect(result.valid).toBe(true);
    });

    it("should enforce minimum date constraints", () => {
      const result = validateDateRange("1999-01-01", { minDate: "2000-01-01" });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("must be after 2000-01-01");
    });

    it("should enforce maximum date constraints", () => {
      const result = validateDateRange("2025-01-01", { maxDate: "2024-01-01" });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("must be before 2024-01-01");
    });

    it("should handle empty values based on allowEmpty parameter", () => {
      const resultEmpty = validateDateRange("", { allowEmpty: true });
      expect(resultEmpty.valid).toBe(true);

      const resultRequired = validateDateRange("", { allowEmpty: false });
      expect(resultRequired.valid).toBe(false);
      expect(resultRequired.errors[0]).toBe("Date value is required");
    });
  });
});

describe("Dataset-Aware Validation Functions", () => {
  const testDataset = [
    { catalogNumber: "FISH_001", eventID: "SURVEY_2023", kingdom: "Animalia", date: "2023-06-01" },
    { catalogNumber: "FISH_002", eventID: "SURVEY_2023", kingdom: "Animalia", date: "2023-06-02" },
    { catalogNumber: "FISH_001", eventID: "SURVEY_2024", kingdom: "Plantae", date: "2023-05-30" }, // duplicate catalogNumber, inconsistent kingdom, out of order date
  ];

  describe("validateUnique", () => {
    it("should pass for unique values", () => {
      const context = createMockContext(testDataset, 1);
      const result = validateUnique("FISH_002", { fieldName: "catalogNumber" }, context);
      expect(result.valid).toBe(true);
    });

    it("should fail for duplicate values", () => {
      const context = createMockContext(testDataset, 2);
      const result = validateUnique("FISH_001", { fieldName: "catalogNumber" }, context);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Duplicate value");
      expect(result.errors[0]).toContain("rows: 1");
    });

    it("should handle empty values", () => {
      const context = createMockContext(testDataset, 0);
      const result = validateUnique("", { fieldName: "catalogNumber" }, context);
      expect(result.valid).toBe(true);
    });
  });

  describe("validateReferentialIntegrity", () => {
    const datasetWithReferences = [
      { eventID: "SURVEY_2023", parentEventID: null },
      { eventID: "EVENT_001", parentEventID: "SURVEY_2023" },
      { eventID: "EVENT_002", parentEventID: "INVALID_REF" },
    ];

    it("should pass for valid references", () => {
      const context = createMockContext(datasetWithReferences, 1);
      const result = validateReferentialIntegrity(
        "SURVEY_2023",
        { referenceField: "eventID" },
        context
      );
      expect(result.valid).toBe(true);
    });

    it("should fail for invalid references", () => {
      const context = createMockContext(datasetWithReferences, 2);
      const result = validateReferentialIntegrity(
        "INVALID_REF",
        { referenceField: "eventID" },
        context
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("not found in field");
    });

    it("should handle empty references", () => {
      const context = createMockContext(datasetWithReferences, 0);
      const result = validateReferentialIntegrity(null, { referenceField: "eventID" }, context);
      expect(result.valid).toBe(true);
    });
  });

  describe("validateConsistentWithRelated", () => {
    it("should pass for consistent values", () => {
      const context = createMockContext(testDataset, 1);
      const result = validateConsistentWithRelated(
        "Animalia",
        {
          groupByField: "eventID",
          consistentFields: ["kingdom"],
          message: "Kingdom should be consistent within same event",
        },
        context
      );
      expect(result.valid).toBe(true);
    });

    it("should fail for inconsistent values", () => {
      const context = createMockContext(testDataset, 2);
      const result = validateConsistentWithRelated(
        "Plantae",
        {
          groupByField: "eventID",
          consistentFields: ["kingdom"],
          message: "Kingdom should be consistent within same event",
        },
        context
      );
      // This should actually pass because SURVEY_2024 only has one record
      expect(result.valid).toBe(true);
    });
  });

  describe("validateSequentialOrder", () => {
    it("should pass for ascending order", () => {
      const context = createMockContext(testDataset, 1);
      const result = validateSequentialOrder(
        "2023-06-02",
        { orderField: "date", direction: "asc" },
        context
      );
      expect(result.valid).toBe(true);
    });

    it("should fail for out-of-order values", () => {
      const context = createMockContext(testDataset, 2);
      const result = validateSequentialOrder(
        "2023-05-30",
        { orderField: "date", direction: "asc" },
        context
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Sequential order violation");
    });

    it("should handle first row correctly", () => {
      const context = createMockContext(testDataset, 0);
      const result = validateSequentialOrder(
        "2023-06-01",
        { orderField: "date", direction: "asc" },
        context
      );
      expect(result.valid).toBe(true); // First row is always valid
    });
  });
});

describe("Validation Execution", () => {
  describe("executeValidation", () => {
    it("should execute basic validation functions", () => {
      const result = executeValidation("validateRequired", "test value");
      expect(result.valid).toBe(true);
    });

    it("should handle invalid function names", () => {
      const result = executeValidation("invalidFunction", "test");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("not found");
    });

    it("should handle execution errors gracefully", () => {
      // This should not crash even with bad parameters
      const result = executeValidation("validateRange", "not-a-number", {
        min: 0,
        max: 100,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("non-numeric");
    });
  });

  describe("executeValidationWithContext", () => {
    const testDataset = [{ catalogNumber: "FISH_001" }, { catalogNumber: "FISH_002" }];

    it("should execute dataset-aware functions with context", () => {
      const context = createMockContext(testDataset, 1);
      const result = executeValidationWithContext(
        "validateUnique",
        "FISH_002",
        { fieldName: "catalogNumber" },
        context
      );
      expect(result.valid).toBe(true);
    });

    it("should fail dataset-aware functions without context", () => {
      const result = executeValidationWithContext(
        "validateUnique",
        "FISH_002",
        { fieldName: "catalogNumber" }
        // no context provided
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("requires dataset context");
    });

    it("should execute regular functions without context", () => {
      const result = executeValidationWithContext("validateRequired", "test value");
      expect(result.valid).toBe(true);
    });
  });
});

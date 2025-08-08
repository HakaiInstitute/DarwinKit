import { describe, expect, it } from "vitest";
import {
  executeDatasetValidationWithContext,
  executeFieldValidation,
  executeRowValidation,
  generateValidationSummary,
  validateValidationConfiguration,
} from "~/lib/configurator/validation-executor";

describe("Validation Executor", () => {
  const mockVocabularies = {
    country: {
      name: "country",
      strict: true,
      terms: [
        { term: "United States", synonyms: ["USA", "US"] },
        { term: "Canada", synonyms: ["CA"] },
      ],
    },
  };

  describe("executeFieldValidation", () => {
    const fieldConfig = {
      field: "country",
      validations: [
        {
          functionName: "validateRequired",
          parameters: {},
        },
        {
          functionName: "validateControlledVocabulary",
          parameters: {
            vocabularyName: "country",
            vocabularies: mockVocabularies,
          },
        },
      ],
    };

    it("should execute all validation steps for a field", () => {
      const result = executeFieldValidation("United States", fieldConfig);

      expect(result.field).toBe("country");
      expect(result.value).toBe("United States");
      expect(result.valid).toBe(true);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].functionName).toBe("validateRequired");
      expect(result.steps[1].functionName).toBe("validateControlledVocabulary");
    });

    it("should fail validation and collect errors", () => {
      const result = executeFieldValidation("InvalidCountry", fieldConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("validateControlledVocabulary");
      expect(result.steps[1].valid).toBe(false);
    });

    it("should handle empty values", () => {
      const result = executeFieldValidation("", fieldConfig);

      expect(result.valid).toBe(false); // Should fail on required validation
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("validateRequired");
    });
  });

  describe("executeRowValidation", () => {
    const config = {
      name: "Test Configuration",
      validations: [
        {
          field: "country",
          validations: [
            { functionName: "validateRequired", parameters: {} },
            {
              functionName: "validateControlledVocabulary",
              parameters: {
                vocabularyName: "country",
                vocabularies: mockVocabularies,
              },
            },
          ],
        },
        {
          field: "coordinates",
          validations: [
            {
              functionName: "validateCoordinates",
              parameters: { type: "latitude" },
            },
          ],
        },
      ],
    };

    it("should validate all fields in a row", () => {
      const dataRow = {
        country: "United States",
        coordinates: 45.5,
        otherField: "ignored",
      };

      const result = executeRowValidation(dataRow, config);

      expect(result.valid).toBe(true);
      expect(result.fieldResults).toHaveProperty("country");
      expect(result.fieldResults).toHaveProperty("coordinates");
      expect(result.fieldResults.country.valid).toBe(true);
      expect(result.fieldResults.coordinates.valid).toBe(true);
    });

    it("should collect field-level errors", () => {
      const dataRow = {
        country: "InvalidCountry",
        coordinates: 95, // Invalid latitude
      };

      const result = executeRowValidation(dataRow, config);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain("country");
      expect(result.errors[1]).toContain("coordinates");
    });
  });

  describe("executeDatasetValidationWithContext", () => {
    const config = {
      name: "Dataset Validation Test",
      validations: [
        {
          field: "catalogNumber",
          validations: [
            {
              functionName: "validateUnique",
              parameters: {
                fieldName: "catalogNumber",
                message: "Catalog numbers must be unique",
              },
            },
          ],
        },
        {
          field: "parentEventID",
          validations: [
            {
              functionName: "validateReferentialIntegrity",
              parameters: {
                referenceField: "eventID",
                message: "Parent must reference valid event",
              },
            },
          ],
        },
      ],
    };

    const testDataset = [
      { catalogNumber: "FISH_001", eventID: "SURVEY_A", parentEventID: null },
      { catalogNumber: "FISH_002", eventID: "EVENT_1", parentEventID: "SURVEY_A" },
      { catalogNumber: "FISH_001", eventID: "EVENT_2", parentEventID: "SURVEY_A" }, // duplicate catalog
      { catalogNumber: "FISH_003", eventID: "EVENT_3", parentEventID: "INVALID" }, // invalid reference
    ];

    it("should process all rows with dataset context", () => {
      const result = executeDatasetValidationWithContext(testDataset, config);

      expect(result.totalRows).toBe(4);
      expect(result.processedRows).toBe(4);
      expect(result.success).toBe(false); // Has validation failures
      expect(result.validRows).toBe(1); // Only row 1 is valid
      expect(result.invalidRows).toBe(3); // Row 0, 2, 3 have issues
    });

    it("should provide detailed row results", () => {
      const result = executeDatasetValidationWithContext(testDataset, config);

      expect(result.rowResults).toHaveLength(4);

      // Row 0 should be invalid (duplicate catalog number with row 2)
      expect(result.rowResults[0].valid).toBe(false);
      expect(result.rowResults[0].fieldResults.catalogNumber.valid).toBe(false);

      // Row 1 should be valid (unique catalog, valid parent reference)
      expect(result.rowResults[1].valid).toBe(true);

      // Row 2 should be invalid (duplicate catalog number with row 0)
      expect(result.rowResults[2].valid).toBe(false);
      expect(result.rowResults[2].fieldResults.catalogNumber.valid).toBe(false);

      // Row 3 should be invalid (invalid parent reference)
      expect(result.rowResults[3].valid).toBe(false);
      expect(result.rowResults[3].fieldResults.parentEventID.valid).toBe(false);
    });

    it("should generate field statistics", () => {
      const result = executeDatasetValidationWithContext(testDataset, config);

      expect(result.fieldStatistics).toHaveProperty("catalogNumber");
      expect(result.fieldStatistics).toHaveProperty("parentEventID");

      const catalogStats = result.fieldStatistics.catalogNumber;
      expect(catalogStats.totalProcessed).toBe(4);
      expect(catalogStats.valid).toBe(2); // Row 1 and 3 pass uniqueness (only row 1 and 3 have unique values)
      expect(catalogStats.invalid).toBe(2); // Row 0 and 2 fail (duplicates)

      const parentStats = result.fieldStatistics.parentEventID;
      expect(parentStats.totalProcessed).toBe(4);
      expect(parentStats.valid).toBe(3); // All except row 3
      expect(parentStats.invalid).toBe(1);
    });
  });

  describe("validateValidationConfiguration", () => {
    it("should validate correct configuration", () => {
      const config = {
        name: "Test Config",
        description: "Test description",
        validations: [
          {
            field: "testField",
            validations: [
              {
                functionName: "validateRequired",
                parameters: {},
              },
            ],
          },
        ],
      };

      const result = validateValidationConfiguration(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should catch missing configuration name", () => {
      const config = {
        name: "",
        validations: [],
      };

      const result = validateValidationConfiguration(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Configuration name is required");
    });

    it("should catch missing field names", () => {
      const config = {
        name: "Test Config",
        validations: [
          {
            field: "", // Missing field name
            validations: [{ functionName: "validateRequired", parameters: {} }],
          },
        ],
      };

      const result = validateValidationConfiguration(config);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Missing field name");
    });

    it("should catch missing function names", () => {
      const config = {
        name: "Test Config",
        validations: [
          {
            field: "testField",
            validations: [
              {
                functionName: "", // Missing function name
                parameters: {},
              },
            ],
          },
        ],
      };

      const result = validateValidationConfiguration(config);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Missing function name");
    });
  });

  describe("generateValidationSummary", () => {
    it("should generate summary from validation results", () => {
      const mockResult = {
        configurationName: "Test",
        success: false,
        processedRows: 3,
        totalRows: 3,
        validRows: 2,
        invalidRows: 1,
        rowResults: [
          {
            rowIndex: 0,
            valid: true,
            fieldResults: {
              testField: {
                field: "testField",
                value: "test",
                valid: true,
                errors: [],
                warnings: [],
                steps: [
                  {
                    step: 1,
                    functionName: "validateRequired",
                    inputValue: "test",
                    valid: true,
                    errors: [],
                    warnings: [],
                  },
                ],
              },
            },
            errors: [],
            warnings: [],
          },
          {
            rowIndex: 1,
            valid: false,
            fieldResults: {
              testField: {
                field: "testField",
                value: "",
                valid: false,
                errors: ["Required field missing"],
                warnings: [],
                steps: [
                  {
                    step: 1,
                    functionName: "validateRequired",
                    inputValue: "",
                    valid: false,
                    errors: ["Required field missing"],
                    warnings: [],
                  },
                ],
              },
            },
            errors: ["Required field missing"],
            warnings: [],
          },
        ],
        fieldStatistics: {
          testField: {
            totalProcessed: 2,
            valid: 1,
            invalid: 1,
            mostCommonErrors: ["Required field missing"],
            mostCommonWarnings: [],
          },
        },
        globalErrors: [],
        globalWarnings: [],
      };

      const summary = generateValidationSummary(mockResult);

      expect(summary.totalFields).toBe(1);
      expect(summary.validFields).toBe(0); // Field has some invalid rows
      expect(summary.invalidFields).toBe(1);
      expect(summary.totalValidations).toBe(2); // 2 steps total
      expect(summary.passedValidations).toBe(1);
      expect(summary.failedValidations).toBe(1);

      expect(summary.fieldSummaries).toHaveProperty("testField");
      expect(summary.fieldSummaries.testField.totalRows).toBe(2);
      expect(summary.fieldSummaries.testField.validRows).toBe(1);
      expect(summary.fieldSummaries.testField.invalidRows).toBe(1);
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  type GlobalParameters,
  type MockVocabulary,
} from "~/lib/configurator/integrated-configuration";
import {
  convertToIntegratedConfiguration,
  createMappingOnlyConfig,
  createMappingTransformConfig,
  createMappingValidateConfig,
  createTransformValidateConfig,
  executeMappingOnly,
  executeModularConfiguration,
  validateModularConfiguration,
  type ModularConfiguration,
} from "~/lib/configurator/modular-executor";

// Mock vocabularies for testing
const MOCK_VOCABULARIES: Record<string, MockVocabulary> = {
  sex: {
    name: "sex",
    strict: true,
    terms: [
      { term: "male", synonyms: ["M", "Male"] },
      { term: "female", synonyms: ["F", "Female"] },
      { term: "unknown", synonyms: [] },
    ],
  },
  lifeStage: {
    name: "lifeStage",
    strict: false,
    terms: [
      { term: "adult", synonyms: ["Adult"] },
      { term: "juvenile", synonyms: ["juv", "Juvenile"] },
    ],
  },
};

// Test data
const testSourceData = [
  {
    organism_sex: "M",
    latitude_dd: "45.123",
    longitude_dd: "-123.456",
    life_stage: "Adult",
  },
  {
    organism_sex: "female",
    latitude_dd: "44.567",
    longitude_dd: "-124.789",
    life_stage: "juv",
  },
];

describe("Modular Configuration System", () => {
  describe("Configuration Factory Functions", () => {
    it("should create mapping-only configuration", () => {
      const config = createMappingOnlyConfig({
        name: "Test Mapping",
        mappings: [
          { sourceColumn: "organism_sex", targetField: "sex" },
          { sourceColumn: "latitude_dd", targetField: "decimalLatitude" },
        ],
      });

      expect(config.name).toBe("Test Mapping");
      expect(config.mode).toBe("mapping-only");
      expect(config.fields).toHaveLength(2);
      expect(config.fields[0].mode).toBe("mapping-only");
      expect(config.fields[0].config).toMatchObject({
        sourceColumn: "organism_sex",
        targetField: "sex",
      });
    });

    it("should create transform-validate configuration", () => {
      const config = createTransformValidateConfig({
        name: "Test Transform-Validate",
        fields: [
          {
            fieldName: "sex",
            transformations: [{ functionName: "normalize", parameters: {} }],
            validations: [{ functionName: "validate", parameters: {} }],
          },
        ],
        globalParameters: { vocabularies: MOCK_VOCABULARIES },
      });

      expect(config.name).toBe("Test Transform-Validate");
      expect(config.mode).toBe("transform-validate");
      expect(config.globalParameters.vocabularies).toBe(MOCK_VOCABULARIES);
      expect(config.fields[0].mode).toBe("transform-validate");
    });

    it("should create mapping-validate configuration", () => {
      const config = createMappingValidateConfig({
        name: "Test Mapping-Validate",
        mappings: [
          {
            sourceColumn: "latitude_dd",
            targetField: "decimalLatitude",
            validations: [
              { functionName: "validateCoordinates", parameters: { type: "latitude" } },
            ],
          },
        ],
      });

      expect(config.mode).toBe("mapping-validate");
      expect(config.fields[0].config).toMatchObject({
        sourceColumn: "latitude_dd",
        targetField: "decimalLatitude",
        validations: [{ functionName: "validateCoordinates", parameters: { type: "latitude" } }],
      });
    });

    it("should create mapping-transform configuration", () => {
      const config = createMappingTransformConfig({
        name: "Test Mapping-Transform",
        mappings: [
          {
            sourceColumn: "organism_sex",
            targetField: "sex",
            transformations: [{ functionName: "normalize", parameters: {} }],
          },
        ],
      });

      expect(config.mode).toBe("mapping-transform");
      expect(config.fields[0].config).toHaveProperty("transformations");
    });
  });

  describe("Configuration Validation", () => {
    it("should validate valid configurations", () => {
      const config = createMappingOnlyConfig({
        name: "Valid Config",
        mappings: [{ sourceColumn: "src", targetField: "tgt" }],
      });

      const result = validateModularConfiguration(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect missing configuration name", () => {
      const config: ModularConfiguration = {
        name: "",
        mode: "mapping-only",
        globalParameters: {} as GlobalParameters,
        fields: [],
      };

      const result = validateModularConfiguration(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Configuration name is required");
    });

    it("should warn about empty field configurations", () => {
      const config: ModularConfiguration = {
        name: "Empty Config",
        mode: "mapping-only",
        globalParameters: {} as GlobalParameters,
        fields: [],
      };

      const result = validateModularConfiguration(config);
      expect(result.warnings).toContain("No field configurations defined");
    });

    it("should validate mapping-only field requirements", () => {
      const config: ModularConfiguration = {
        name: "Invalid Mapping",
        mode: "mapping-only",
        globalParameters: {} as GlobalParameters,
        fields: [
          {
            mode: "mapping-only",
            config: {
              fieldName: "test",
              sourceColumn: "", // Missing
              targetField: "target",
            },
          },
        ],
      };

      const result = validateModularConfiguration(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((err) => err.includes("sourceColumn is required"))).toBe(true);
    });
  });

  describe("Configuration Conversion", () => {
    it("should convert mapping-only to integrated configuration", () => {
      const modularConfig = createMappingOnlyConfig({
        name: "Test Conversion",
        mappings: [{ sourceColumn: "src", targetField: "tgt" }],
      });

      const integrated = convertToIntegratedConfiguration(modularConfig);

      expect(integrated.name).toBe("Test Conversion");
      expect(integrated.fieldMappings).toHaveLength(1);
      expect(integrated.fieldMappings[0]).toMatchObject({
        sourceColumn: "src",
        targetField: "tgt",
      });
      expect(integrated.fieldMappings[0].transformations).toBeUndefined();
      expect(integrated.fieldMappings[0].validations).toBeUndefined();
    });

    it("should convert transform-validate to integrated configuration", () => {
      const modularConfig = createTransformValidateConfig({
        name: "Test Transform-Validate",
        fields: [
          {
            fieldName: "testField",
            transformations: [{ functionName: "transform", parameters: {} }],
            validations: [{ functionName: "validate", parameters: {} }],
          },
        ],
      });

      const integrated = convertToIntegratedConfiguration(modularConfig);

      expect(integrated.fieldMappings[0]).toMatchObject({
        sourceColumn: "testField",
        targetField: "testField",
        transformations: [{ functionName: "transform", parameters: {} }],
        validations: [{ functionName: "validate", parameters: {} }],
      });
    });

    it("should convert mapping-validate to integrated configuration", () => {
      const modularConfig = createMappingValidateConfig({
        name: "Test Mapping-Validate",
        mappings: [
          {
            sourceColumn: "src",
            targetField: "tgt",
            validations: [{ functionName: "validate", parameters: {} }],
          },
        ],
      });

      const integrated = convertToIntegratedConfiguration(modularConfig);

      expect(integrated.fieldMappings[0]).toMatchObject({
        sourceColumn: "src",
        targetField: "tgt",
        validations: [{ functionName: "validate", parameters: {} }],
      });
      expect(integrated.fieldMappings[0].transformations).toBeUndefined();
    });
  });

  describe("Modular Execution", () => {
    it("should execute mapping-only configuration", () => {
      const mappings = [
        { sourceColumn: "organism_sex", targetField: "sex" },
        { sourceColumn: "latitude_dd", targetField: "decimalLatitude" },
      ];

      const result = executeMappingOnly(testSourceData, mappings);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        sex: "M",
        decimalLatitude: "45.123",
      });
      expect(result[0]).not.toHaveProperty("organism_sex");
      expect(result[0]).not.toHaveProperty("latitude_dd");
    });

    it("should execute modular configuration with validation errors", () => {
      const config = createMappingValidateConfig({
        name: "Test with Validation",
        globalParameters: { vocabularies: MOCK_VOCABULARIES },
        mappings: [
          {
            sourceColumn: "organism_sex",
            targetField: "sex",
            validations: [
              {
                functionName: "validateControlledVocabulary",
                parameters: { vocabularyName: "sex" },
              },
            ],
          },
        ],
      });

      const result = executeModularConfiguration(testSourceData, config);

      expect(result.processedRows).toBe(2);
      expect(result.validRows).toBe(2); // Both 'M' and 'female' should be valid
      expect(result.transformedData).toHaveLength(2);
    });

    it("should handle invalid modular configuration", () => {
      const invalidConfig: ModularConfiguration = {
        name: "", // Invalid - missing name
        mode: "mapping-only",
        globalParameters: {} as GlobalParameters,
        fields: [],
      };

      const result = executeModularConfiguration(testSourceData, invalidConfig);

      expect(result.success).toBe(false);
      expect(result.globalErrors).toContain("Configuration name is required");
      expect(result.transformedData).toHaveLength(0);
    });
  });

  describe("Component Mode Flexibility", () => {
    it("should support mapping-only mode for simple field renaming", () => {
      const testData = [{ old_name: "value1" }, { old_name: "value2" }];
      const result = executeMappingOnly(testData, [
        {
          sourceColumn: "old_name",
          targetField: "new_name",
        },
      ]);

      expect(result).toEqual([{ new_name: "value1" }, { new_name: "value2" }]);
    });

    it("should support transform-validate mode for data quality processing", () => {
      const preMappedData = [{ sex: "M" }, { sex: "Invalid" }];

      const config = createTransformValidateConfig({
        name: "Quality Control",
        globalParameters: { vocabularies: MOCK_VOCABULARIES },
        fields: [
          {
            fieldName: "sex",
            transformations: [
              {
                functionName: "normalizeControlledVocabulary",
                parameters: {
                  vocabularyName: "sex",
                  defaultValue: "unknown",
                },
              },
            ],
            validations: [
              {
                functionName: "validateControlledVocabulary",
                parameters: { vocabularyName: "sex" },
              },
            ],
          },
        ],
      });

      const result = executeModularConfiguration(preMappedData, config);

      expect(result.processedRows).toBe(2);
      // Should process both rows, with validation handling invalid values
      expect(result.transformedData.length).toBeGreaterThan(0);
    });

    it("should support mapping-validate mode for direct validation", () => {
      const config = createMappingValidateConfig({
        name: "Direct Validation",
        mappings: [
          {
            sourceColumn: "latitude_dd",
            targetField: "decimalLatitude",
            validations: [
              {
                functionName: "validateDataType",
                parameters: { expectedType: "string" },
              },
            ],
          },
        ],
      });

      const result = executeModularConfiguration(testSourceData, config);

      expect(result.processedRows).toBe(2);
      expect(result.fieldStatistics.decimalLatitude.totalProcessed).toBe(2);
    });

    it("should support mapping-transform mode for data normalization", () => {
      const config = createMappingTransformConfig({
        name: "Data Normalization",
        globalParameters: { vocabularies: MOCK_VOCABULARIES },
        mappings: [
          {
            sourceColumn: "life_stage",
            targetField: "lifeStage",
            transformations: [
              {
                functionName: "normalizeControlledVocabulary",
                parameters: {
                  vocabularyName: "lifeStage",
                  defaultValue: "unknown",
                },
              },
            ],
          },
        ],
      });

      const result = executeModularConfiguration(testSourceData, config);

      expect(result.processedRows).toBe(2);
      expect(result.transformedData[0].lifeStage).toBe("adult"); // 'Adult' normalized to 'adult'
      expect(result.transformedData[1].lifeStage).toBe("juvenile"); // 'juv' normalized to 'juvenile'
    });
  });

  describe("Performance and Architecture Benefits", () => {
    it("should handle large datasets efficiently with mapping-only", () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        col1: `value${i}`,
        col2: `data${i}`,
      }));

      const mappings = [
        { sourceColumn: "col1", targetField: "field1" },
        { sourceColumn: "col2", targetField: "field2" },
      ];

      const startTime = Date.now();
      const result = executeMappingOnly(largeDataset, mappings);
      const endTime = Date.now();

      expect(result).toHaveLength(1000);
      expect(result[0]).toMatchObject({ field1: "value0", field2: "data0" });
      expect(endTime - startTime).toBeLessThan(100); // Should be very fast
    });

    it("should demonstrate clear separation of concerns", () => {
      // Each configuration type should only include relevant components
      const mappingOnly = createMappingOnlyConfig({
        name: "Mapping Test",
        mappings: [{ sourceColumn: "src", targetField: "tgt" }],
      });

      // Mapping-only should not have transformations or validations
      const mappingIntegrated = convertToIntegratedConfiguration(mappingOnly);
      expect(mappingIntegrated.fieldMappings[0].transformations).toBeUndefined();
      expect(mappingIntegrated.fieldMappings[0].validations).toBeUndefined();
    });
  });
});

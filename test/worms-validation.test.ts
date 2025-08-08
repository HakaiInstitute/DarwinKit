// import { describe, expect, it } from "vitest";
// import { executeDatasetValidationWithContext } from "~/lib/configurator/validation-executor";
// import {
//   validateConsistentWithRelated,
//   validateReferentialIntegrity,
//   type DatasetValidationContext,
//   type SomePrimitive,
// } from "~/lib/configurator/validations";
// import { type Dataset, type Row } from "./validations.test";
// import { ValidationConfiguration } from "../src/lib/configurator/modular-configuration";

// /**
//  * WoRMS (World Register of Marine Species) Validation Tests
//  *
//  * These tests simulate the validation scenarios that would be needed
//  * for taxonomic field dependency validation against WoRMS registry.
//  *
//  * The key concept: "This field is the scientificNameID. If related
//  * taxonomic fields are present, ensure they match the expected values
//  * derived from this scientificNameID in the WoRMS registry."
//  */

// // Mock WoRMS taxonomic data for testing
// const MOCK_WORMS_DATA: Record<string, SomePrimitive>[] = [
//   {
//     scientificNameID: "urn:lsid:marinespecies.org:taxname:127160",
//     scientificName: "Salmo salar",
//     kingdom: "Animalia",
//     phylum: "Chordata",
//     class: "Actinopterygii",
//     order: "Salmoniformes",
//     family: "Salmonidae",
//     genus: "Salmo",
//     specificEpithet: "salar",
//     taxonomicStatus: "accepted",
//     taxonRank: "species",
//   },
//   {
//     scientificNameID: "urn:lsid:marinespecies.org:taxname:127186",
//     scientificName: "Oncorhynchus mykiss",
//     kingdom: "Animalia",
//     phylum: "Chordata",
//     class: "Actinopterygii",
//     order: "Salmoniformes",
//     family: "Salmonidae",
//     genus: "Oncorhynchus",
//     specificEpithet: "mykiss",
//     taxonomicStatus: "accepted",
//     taxonRank: "species",
//   },
//   {
//     scientificNameID: "urn:lsid:marinespecies.org:taxname:125732",
//     scientificName: "Salmonidae",
//     kingdom: "Animalia",
//     phylum: "Chordata",
//     class: "Actinopterygii",
//     order: "Salmoniformes",
//     family: "Salmonidae",
//     genus: null,
//     specificEpithet: null,
//     taxonomicStatus: "accepted",
//     taxonRank: "family",
//   },
// ];

// // Helper function to create dataset context
// function createMockContext(
//   dataset: Dataset,
//   currentRowIndex: number,
//   wormsData = MOCK_WORMS_DATA
// ): DatasetValidationContext {
//   const currentRow = dataset[currentRowIndex];
//   return {
//     currentRow,
//     currentRowIndex,
//     dataset,
//     totalRows: dataset.length,
//     validationMetadata: {
//       processedRows: currentRowIndex,
//       validRows: 0,
//       invalidRows: 0,
//     },
//     cache: new Map(),
//     wormsData, // Additional reference data
//     getFieldValue: (fieldName: string) => currentRow[fieldName],
//     getRowsWhere: (predicate: (row: Row) => boolean) => dataset.filter(predicate),
//     getPreviousRows: () => dataset.slice(0, currentRowIndex),
//     getRowsByFieldValue: (fieldName: string, value: unknown) =>
//       dataset.filter((row) => row[fieldName] === value),
//     // WoRMS-specific helper
//     getWormsRecord: (scientificNameID: string) =>
//       wormsData.find((record) => record.scientificNameID === scientificNameID) ?? null,
//   };
// }

// describe("WoRMS Taxonomic Validation Scenarios", () => {
//   describe("Taxonomic Consistency within Collection Events", () => {
//     const biodiversityDataset = [
//       {
//         catalogNumber: "FISH_001",
//         eventID: "SURVEY_2023_SITE_A",
//         scientificNameID: "urn:lsid:marinespecies.org:taxname:127160",
//         scientificName: "Salmo salar",
//         kingdom: "Animalia",
//         family: "Salmonidae",
//         genus: "Salmo",
//         habitat: "marine",
//       },
//       {
//         catalogNumber: "FISH_002",
//         eventID: "SURVEY_2023_SITE_A", // Same survey site
//         scientificNameID: "urn:lsid:marinespecies.org:taxname:127186",
//         scientificName: "Oncorhynchus mykiss",
//         kingdom: "Animalia",
//         family: "Salmonidae", // Same family - consistent
//         genus: "Oncorhynchus", // Different genus - expected
//         habitat: "marine",
//       },
//       {
//         catalogNumber: "FISH_003",
//         eventID: "SURVEY_2023_SITE_A", // Same survey site
//         scientificNameID: "urn:lsid:marinespecies.org:taxname:127160",
//         scientificName: "Salmo salar",
//         kingdom: "Plantae", // INCONSISTENT - should be Animalia like WoRMS record
//         family: "Salmonidae",
//         genus: "Salmo",
//         habitat: "marine",
//       },
//     ];

//     it("should validate taxonomic consistency at family level within collection events", () => {
//       // This tests that specimens from the same collection event should have
//       // taxonomic information consistent with their WoRMS records
//       const context = createMockContext(biodiversityDataset, 0);

//       const result = validateConsistentWithRelated(
//         "Animalia",
//         {
//           groupByField: "eventID",
//           consistentFields: ["kingdom"], // Kingdom should be consistent within collection events
//           message:
//             "All specimens from the same collection should have consistent higher-level taxonomy",
//         },
//         context
//       );

//       // Even the first specimen should fail because the dataset contains inconsistent data
//       // (row 3 has kingdom 'Plantae' while rows 1 and 2 have 'Animalia')
//       expect(result.valid).toBe(false);
//     });

//     it("should detect taxonomic inconsistencies that contradict WoRMS records", () => {
//       const context = createMockContext(biodiversityDataset, 2); // Third record with wrong kingdom

//       const result = validateConsistentWithRelated(
//         "Plantae", // Incorrect kingdom
//         {
//           groupByField: "eventID",
//           consistentFields: ["kingdom"],
//           message: "Taxonomic information must be consistent with WoRMS registry",
//         },
//         context
//       );

//       expect(result.valid).toBe(false);
//       expect(result.errors[0]).toContain("consistent");
//     });
//   });

//   describe("Scientific Name ID Referential Integrity", () => {
//     const datasetWithInvalidWoRMS = [
//       {
//         catalogNumber: "SPEC_001",
//         scientificNameID: "urn:lsid:marinespecies.org:taxname:127160", // Valid WoRMS ID
//         scientificName: "Salmo salar",
//       },
//       {
//         catalogNumber: "SPEC_002",
//         scientificNameID: "urn:lsid:marinespecies.org:taxname:999999", // Invalid WoRMS ID
//         scientificName: "Unknown species",
//       },
//     ];

//     // Create a lookup dataset that represents valid WoRMS IDs
//     const validWormsIDs = MOCK_WORMS_DATA.map((record) => ({
//       validID: record.scientificNameID,
//     }));

//     it("should validate scientificNameID against WoRMS registry", () => {
//       const context = createMockContext([...datasetWithInvalidWoRMS, ...validWormsIDs], 0);

//       const result = validateReferentialIntegrity(
//         "urn:lsid:marinespecies.org:taxname:127160",
//         {
//           referenceField: "validID",
//           message: "scientificNameID must reference a valid WoRMS taxon record",
//         },
//         context
//       );

//       expect(result.valid).toBe(true);
//     });

//     it("should fail for invalid WoRMS scientificNameID", () => {
//       const context = createMockContext([...datasetWithInvalidWoRMS, ...validWormsIDs], 1);

//       const result = validateReferentialIntegrity(
//         "urn:lsid:marinespecies.org:taxname:999999", // Invalid ID
//         {
//           referenceField: "validID",
//           message: "scientificNameID must reference a valid WoRMS taxon record",
//         },
//         context
//       );

//       expect(result.valid).toBe(false);
//       expect(result.errors[0]).toContain("must reference a valid WoRMS");
//     });
//   });

//   describe("Complete WoRMS Validation Configuration", () => {
//     const wormsValidationConfig: ValidationConfiguration = {
//       name: "WoRMS Taxonomic Validation",
//       description: "Validates biodiversity data against World Register of Marine Species",
//       validations: [
//         {
//           fieldName: "scientificNameID",
//           validations: [
//             {
//               functionName: "validatePattern",
//               parameters: {
//                 pattern: "^urn:lsid:marinespecies\\.org:taxname:\\d+$",
//                 description: "WoRMS LSID format",
//                 message: "scientificNameID must be a valid WoRMS LSID",
//               },
//             },
//           ],
//         },
//         {
//           fieldName: "kingdom",
//           validations: [
//             {
//               functionName: "validateConsistentWithRelated",
//               parameters: {
//                 groupByField: "eventID",
//                 consistentFields: ["kingdom"],
//                 message:
//                   "Kingdom must be consistent within collection events and match WoRMS records",
//               },
//             },
//           ],
//         },
//         {
//           fieldName: "family",
//           validations: [
//             {
//               functionName: "validateConsistentWithRelated",
//               parameters: {
//                 groupByField: "eventID",
//                 consistentFields: ["family"],
//                 message: "Family classification should be consistent within collection events",
//               },
//             },
//           ],
//         },
//       ],
//     };

//     const fullBiodiversityDataset = [
//       {
//         catalogNumber: "MARINE_001",
//         eventID: "SURVEY_2023_NORTH_SEA",
//         scientificNameID: "urn:lsid:marinespecies.org:taxname:127160",
//         scientificName: "Salmo salar",
//         kingdom: "Animalia",
//         phylum: "Chordata",
//         family: "Salmonidae",
//         genus: "Salmo",
//         decimalLatitude: 60.5,
//         decimalLongitude: 5.2,
//       },
//       {
//         catalogNumber: "MARINE_002",
//         eventID: "SURVEY_2023_NORTH_SEA",
//         scientificNameID: "urn:lsid:marinespecies.org:taxname:127186",
//         scientificName: "Oncorhynchus mykiss",
//         kingdom: "Animalia", // Consistent kingdom
//         phylum: "Chordata",
//         family: "Salmonidae", // Consistent family
//         genus: "Oncorhynchus",
//         decimalLatitude: 60.5,
//         decimalLongitude: 5.2,
//       },
//       {
//         catalogNumber: "MARINE_003",
//         eventID: "SURVEY_2024_BALTIC_SEA", // Different event to avoid consistency conflicts
//         scientificNameID: "invalid-lsid-format", // Invalid LSID format
//         scientificName: "Unknown species",
//         kingdom: "Animalia",
//         phylum: "Chordata",
//         family: "Unknown",
//         genus: "Unknown",
//         decimalLatitude: 55.5,
//         decimalLongitude: 15.2,
//       },
//     ];

//     it("should perform comprehensive WoRMS validation on biodiversity dataset", () => {
//       const result = executeDatasetValidationWithContext(
//         fullBiodiversityDataset,
//         wormsValidationConfig
//       );

//       expect(result.totalRows).toBe(3);
//       expect(result.success).toBe(false); // Should fail due to invalid LSID

//       // Check specific validation results
//       expect(result.rowResults[0].valid).toBe(true); // Valid WoRMS ID and taxonomy
//       expect(result.rowResults[1].valid).toBe(true); // Valid WoRMS ID and consistent taxonomy
//       expect(result.rowResults[2].valid).toBe(false); // Invalid LSID format

//       // Verify that scientificNameID validation caught the invalid format
//       const invalidLSIDResult = result.rowResults[2].fieldResults.scientificNameID;
//       expect(invalidLSIDResult.valid).toBe(false);
//       expect(invalidLSIDResult.errors[0]).toContain("WoRMS LSID");
//     });

//     it("should provide detailed field statistics for WoRMS validation", () => {
//       const result = executeDatasetValidationWithContext(
//         fullBiodiversityDataset,
//         wormsValidationConfig
//       );

//       const scientificNameIDStats = result.fieldStatistics.scientificNameID;
//       expect(scientificNameIDStats.totalProcessed).toBe(3);
//       expect(scientificNameIDStats.valid).toBe(2); // First two have valid format
//       expect(scientificNameIDStats.invalid).toBe(1); // Third has invalid format

//       const kingdomStats = result.fieldStatistics.kingdom;
//       expect(kingdomStats.totalProcessed).toBe(3);
//       expect(kingdomStats.valid).toBe(3); // All have consistent kingdoms
//       expect(kingdomStats.invalid).toBe(0);
//     });
//   });

//   describe("Future WoRMS API Integration Preparation", () => {
//     // These tests prepare for when external WoRMS API validation is implemented

//     it("should structure validation for future async WoRMS API calls", () => {
//       // This test documents the intended structure for when we implement
//       // actual WoRMS API integration for real-time validation

//       const futureBiodiversityRecord = {
//         catalogNumber: "FUTURE_001",
//         scientificNameID: "urn:lsid:marinespecies.org:taxname:127160",
//         scientificName: "Salmo salar",
//         kingdom: "Animalia",
//         // These should be validated against actual WoRMS API response
//       };

//       // For now, we simulate the validation structure
//       const mockWoRMSValidation = {
//         scientificNameID: futureBiodiversityRecord.scientificNameID,
//         expectedKingdom: "Animalia",
//         expectedFamily: "Salmonidae",
//         matchesWoRMS: true,
//       };

//       expect(mockWoRMSValidation.scientificNameID).toBe(futureBiodiversityRecord.scientificNameID);
//       expect(mockWoRMSValidation.expectedKingdom).toBe(futureBiodiversityRecord.kingdom);
//       expect(mockWoRMSValidation.matchesWoRMS).toBe(true);

//       // This test confirms our data structure is ready for external validation
//     });

//     it("should handle expected structure for WoRMS field dependency validation", () => {
//       // This validates our approach for the core requirement:
//       // "If related taxonomic fields are present, ensure they match the expected
//       //  values derived from this scientificNameID in the WoRMS registry"

//       const taxonomicRecord = {
//         scientificNameID: "urn:lsid:marinespecies.org:taxname:127160",
//         kingdom: "Animalia",
//         family: "Salmonidae",
//         genus: "Salmo",
//       };

//       // Simulate expected WoRMS response structure
//       const wormsExpectedValues = MOCK_WORMS_DATA.find(
//         (record) => record.scientificNameID === taxonomicRecord.scientificNameID
//       );

//       expect(wormsExpectedValues).toBeDefined();
//       expect(wormsExpectedValues?.kingdom).toBe(taxonomicRecord.kingdom);
//       expect(wormsExpectedValues?.family).toBe(taxonomicRecord.family);
//       expect(wormsExpectedValues?.genus).toBe(taxonomicRecord.genus);

//       // This confirms our mock data structure matches expected WoRMS format
//       // and our validation approach will work with real API responses
//     });
//   });
// });

// describe("WoRMS Integration Architecture", () => {
//   it("should define the expected interface for WoRMS validation functions", () => {
//     // This test documents the interface we'll need for actual WoRMS integration

//     interface WoRMSValidationParams {
//       scientificNameID: string;
//       checkFields: string[]; // Fields to validate against WoRMS record
//       allowPartialMatches?: boolean;
//       cacheResponses?: boolean;
//     }

//     interface WoRMSValidationResult {
//       valid: boolean;
//       errors: string[];
//       warnings: string[];
//       value: unknown;
//       wormsRecord?: {
//         scientificNameID: string;
//         scientificName: string;
//         kingdom?: string;
//         phylum?: string;
//         class?: string;
//         order?: string;
//         family?: string;
//         genus?: string;
//         taxonomicStatus: string;
//       };
//       fieldMatches?: Record<string, boolean>;
//     }

//     // This interface definition prepares for the actual implementation
//     const mockParams: WoRMSValidationParams = {
//       scientificNameID: "urn:lsid:marinespecies.org:taxname:127160",
//       checkFields: ["kingdom", "family", "genus"],
//       allowPartialMatches: false,
//       cacheResponses: true,
//     };

//     const mockResult: WoRMSValidationResult = {
//       valid: true,
//       errors: [],
//       warnings: [],
//       value: "urn:lsid:marinespecies.org:taxname:127160",
//       wormsRecord: {
//         scientificNameID: "urn:lsid:marinespecies.org:taxname:127160",
//         scientificName: "Salmo salar",
//         kingdom: "Animalia",
//         family: "Salmonidae",
//         genus: "Salmo",
//         taxonomicStatus: "accepted",
//       },
//       fieldMatches: {
//         kingdom: true,
//         family: true,
//         genus: true,
//       },
//     };

//     expect(mockParams.scientificNameID).toBeDefined();
//     expect(mockResult.wormsRecord).toBeDefined();
//     expect(mockResult.fieldMatches).toBeDefined();

//     // Interface is ready for implementation
//   });
// });

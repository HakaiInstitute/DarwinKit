/**
 * Semantic types for field classification
 *
 * Semantic types describe what a field represents to users,
 * beyond just its primitive data type. This enables proper
 * validation and UI treatment based on field meaning.
 */

import * as S from "effect/Schema";

/**
 * Semantic field types that describe the meaning and usage of fields
 */
export const SemanticType = S.Literal(
  "controlled-vocabulary", // Uses predefined vocabulary (strict/recommended/loose)
  "measurement", // Numeric measurements with units and precision
  "location", // Geographic/spatial data (coordinates, places)
  "taxonomy", // Taxonomic classifications and hierarchy
  "temporal", // Date/time information and intervals
  "identifier", // Unique identifiers (IDs, URLs, UUIDs)
  "name", // Free-text names of entities (people, organizations)
  "description", // Free-text descriptions and comments
  "metadata", // Dataset/record metadata and provenance
);

export type SemanticType = S.Schema.Type<typeof SemanticType>;

/**
 * Semantic type descriptions for documentation and UI
 */
export const SEMANTIC_TYPE_DESCRIPTIONS = {
  "controlled-vocabulary": {
    label: "Controlled Vocabulary",
    description: "Field values must come from a predefined list of allowed terms",
    examples: ["basisOfRecord", "taxonRank", "countryCode"],
  },
  "measurement": {
    label: "Measurement",
    description: "Numeric measurements with associated units and precision",
    examples: ["decimalLatitude", "minimumDepthInMeters", "organismQuantity"],
  },
  "location": {
    label: "Location",
    description: "Geographic or spatial information describing where something occurred",
    examples: ["country", "locality", "habitat", "georeferenceProtocol"],
  },
  "taxonomy": {
    label: "Taxonomy",
    description: "Taxonomic classifications and biological nomenclature",
    examples: ["scientificName", "kingdom", "family", "taxonRank"],
  },
  "temporal": {
    label: "Temporal",
    description: "Date, time, or temporal interval information",
    examples: ["eventDate", "dateIdentified", "year", "month"],
  },
  "identifier": {
    label: "Identifier",
    description: "Unique identifiers used to reference records or entities",
    examples: ["eventID", "occurrenceID", "institutionID", "catalogNumber"],
  },
  "name": {
    label: "Name",
    description: "Free-text names of entities such as people, organizations, or places",
    examples: ["recordedBy", "identifiedBy", "institutionCode", "collectionCode"],
  },
  "description": {
    label: "Description",
    description: "Free-text descriptions, comments, or narrative information",
    examples: ["fieldNotes", "eventRemarks", "identificationRemarks"],
  },
  "metadata": {
    label: "Metadata",
    description: "Information about the dataset, record, or data collection process",
    examples: ["license", "rightsHolder", "modified", "language"],
  },
} as const;

/**
 * Helper type to get description for a semantic type
 */
export type SemanticTypeDescription = typeof SEMANTIC_TYPE_DESCRIPTIONS[SemanticType];

/**
 * Utility function to check if a semantic type indicates controlled vocabulary usage
 */
export function usesControlledVocabulary(semanticType: SemanticType): boolean {
  return semanticType === "controlled-vocabulary";
}

/**
 * Utility function to check if a semantic type indicates numeric measurements
 */
export function isMeasurement(semanticType: SemanticType): boolean {
  return semanticType === "measurement";
}

/**
 * Utility function to check if a semantic type indicates geographic data
 */
export function isGeographic(semanticType: SemanticType): boolean {
  return semanticType === "location";
}

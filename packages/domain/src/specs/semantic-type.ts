/**
 * Semantic Type Derivation
 *
 * Derives semantic meaning from Darwin Core field metadata.
 * Used to determine which constraints and validators are meaningful
 * for a given field beyond its raw data type.
 *
 * ## Strategy: Derivation-First with Thin Override Map
 *
 * ~80% of fields have their semantic type derivable from existing
 * schema metadata (explicit `type`, `values`/`thesaurus`, validators,
 * naming conventions). The remaining ~20% use a curated override map
 * for fields where human judgment is required.
 *
 * @module specs/semantic-type
 */

import * as S from "effect/Schema";

// =============================================================================
// Semantic Type Definition
// =============================================================================

export const SemanticType = S.Literal(
  "identifier",
  "coordinate",
  "date",
  "temporal-part",
  "measurement",
  "vocabulary",
  "taxonomic-name",
  "geographic-name",
  "uri",
  "numeric",
  "geometry",
  "agent",
  "text",
  "boolean",
);

export type SemanticType = S.Schema.Type<typeof SemanticType>;

// =============================================================================
// Override Map (fields requiring human judgment)
// =============================================================================

/**
 * Curated overrides for fields where schema metadata alone
 * is insufficient to determine the correct semantic type.
 *
 * This map is intentionally small — only fields that cannot
 * be classified by the derivation heuristics belong here.
 */
const SEMANTIC_OVERRIDES: Record<string, SemanticType> = {
  // Coordinates — type is "decimal" in schema but semantically coordinate
  decimalLatitude: "coordinate",
  decimalLongitude: "coordinate",
  verbatimLatitude: "coordinate",
  verbatimLongitude: "coordinate",
  verbatimCoordinates: "coordinate",

  // Temporal parts — type is "integer" but semantically date components
  year: "temporal-part",
  month: "temporal-part",
  day: "temporal-part",
  startDayOfYear: "temporal-part",
  endDayOfYear: "temporal-part",

  // Geographic names — no type in schema, just free text
  country: "geographic-name",
  countryCode: "geographic-name",
  stateProvince: "geographic-name",
  county: "geographic-name",
  municipality: "geographic-name",
  locality: "geographic-name",
  verbatimLocality: "geographic-name",
  waterBody: "geographic-name",
  islandGroup: "geographic-name",
  island: "geographic-name",
  continent: "geographic-name",
  higherGeography: "geographic-name",

  // Taxonomic names — no type in schema
  scientificName: "taxonomic-name",
  acceptedNameUsage: "taxonomic-name",
  parentNameUsage: "taxonomic-name",
  originalNameUsage: "taxonomic-name",
  verbatimTaxonRank: "taxonomic-name",
  vernacularName: "taxonomic-name",
  kingdom: "taxonomic-name",
  phylum: "taxonomic-name",
  class: "taxonomic-name",
  order: "taxonomic-name",
  superfamily: "taxonomic-name",
  family: "taxonomic-name",
  subfamily: "taxonomic-name",
  tribe: "taxonomic-name",
  subtribe: "taxonomic-name",
  genus: "taxonomic-name",
  genericName: "taxonomic-name",
  subgenus: "taxonomic-name",
  infragenericEpithet: "taxonomic-name",
  specificEpithet: "taxonomic-name",
  infraspecificEpithet: "taxonomic-name",
  cultivarEpithet: "taxonomic-name",
  scientificNameAuthorship: "taxonomic-name",
  namePublishedIn: "taxonomic-name",
  higherClassification: "taxonomic-name",

  // Agents — pipe-delimited person names
  recordedBy: "agent",
  identifiedBy: "agent",
  georeferencedBy: "agent",
  recordedByID: "agent",
  identifiedByID: "agent",

  // Geometry
  footprintWKT: "geometry",
  footprintSRS: "geometry",
  footprintSpatialFit: "geometry",
  pointRadiusSpatialFit: "geometry",

  // Dates that lack type/validator signals in the schema
  eventDate: "date",
  dateIdentified: "date",
  georeferencedDate: "date",
  eventTime: "date",
  modified: "date",
  namePublishedInYear: "temporal-part",

  // URIs that are typed as "identifier" in schema but are semantically URIs
  references: "uri",
  associatedMedia: "uri",
  associatedReferences: "uri",
  associatedSequences: "uri",
  license: "uri",
  accessRights: "uri",

  // Georeferencing metadata — text, not vocabulary
  georeferenceRemarks: "text",
  georeferenceSources: "text",
  georeferenceProtocol: "text",
  geodeticDatum: "text",
  verbatimCoordinateSystem: "text",
  verbatimSRS: "text",
  coordinatePrecision: "numeric",

  // Agents not caught by "By" suffix heuristic
  measurementDeterminedBy: "agent",
  measurementDeterminedDate: "date",

  // Identifiers without "ID" suffix
  catalogNumber: "identifier",
  otherCatalogNumbers: "identifier",
  recordNumber: "identifier",
  fieldNumber: "identifier",
  collectionCode: "identifier",
  institutionCode: "identifier",
  ownerInstitutionCode: "identifier",
  datasetName: "identifier",

  // Geological vocabulary terms (standard chronostratigraphic/lithostratigraphic terms)
  bed: "vocabulary",
  formation: "vocabulary",
  group: "vocabulary",
  member: "vocabulary",
  lithostratigraphicTerms: "vocabulary",
  earliestAgeOrLowestStage: "vocabulary",
  latestAgeOrHighestStage: "vocabulary",
  earliestEonOrLowestEonothem: "vocabulary",
  latestEonOrHighestEonothem: "vocabulary",
  earliestEpochOrLowestSeries: "vocabulary",
  latestEpochOrHighestSeries: "vocabulary",
  earliestEraOrLowestErathem: "vocabulary",
  latestEraOrHighestErathem: "vocabulary",
  earliestPeriodOrLowestSystem: "vocabulary",
  latestPeriodOrHighestSystem: "vocabulary",
  highestBiostratigraphicZone: "vocabulary",
  lowestBiostratigraphicZone: "vocabulary",

  // Occurrence vocabulary-like fields (comments recommend controlled vocabulary)
  behavior: "vocabulary",
  caste: "vocabulary",
  lifeStage: "vocabulary",
  sex: "vocabulary",
  vitality: "vocabulary",
  reproductiveCondition: "vocabulary",
  disposition: "vocabulary",
  preparations: "vocabulary",
  typeStatus: "vocabulary",
  identificationQualifier: "vocabulary",
  identificationVerificationStatus: "vocabulary",
  eventType: "vocabulary",
  materialEntityType: "vocabulary",

  // Verbatim date — text representation of a date
  verbatimEventDate: "text",

  // URI-like fields
  feedbackURL: "uri",
};

// =============================================================================
// Derivation Function
// =============================================================================

/**
 * Minimal field shape needed for semantic type derivation.
 * Matches the structure of fields in dwcSchema.json.
 */
export interface FieldMetadata {
  readonly name: string;
  readonly type?: string;
  readonly group?: string;
  readonly values?: Record<string, unknown>;
  readonly thesaurus?: string;
  readonly unique?: string;
  readonly validators?: ReadonlyArray<string | Record<string, unknown>>;
  readonly comments?: string;
  readonly "dc:description"?: string;
  readonly examples?: string;
}

/**
 * Derive the semantic type of a Darwin Core field from its metadata.
 *
 * Uses a priority chain:
 * 1. Explicit overrides (curated map for ambiguous fields)
 * 2. Structural detection (values/thesaurus → vocabulary)
 * 3. Validator-based detection (range bounds, format strings)
 * 4. Name-based heuristics (suffixes, known patterns)
 * 5. Explicit type mapping (schema's own type property)
 * 6. Fallback to "text"
 */
export function deriveSemanticType(field: FieldMetadata): SemanticType {
  // 1. Check explicit overrides first
  if (SEMANTIC_OVERRIDES[field.name]) {
    return SEMANTIC_OVERRIDES[field.name];
  }

  // 2. Structural detection: controlled vocabulary
  if (field.type === "controlled-vocabulary") return "vocabulary";
  if (field.values && Object.keys(field.values).length > 0) return "vocabulary";
  if (field.thesaurus) return "vocabulary";

  // 3. Validator-based detection
  if (field.validators) {
    if (hasCoordinateRange(field.validators)) return "coordinate";
    if (hasDateValidator(field.validators)) return "date";
  }

  // 4. Name-based heuristics
  if (field.name.endsWith("Remarks")) return "text";
  if (field.name.match(/In(Meters|Feet|Kilometers)$/)) return "measurement";
  if (field.name.endsWith("ID")) return "identifier";
  if (field.name.endsWith("By") && !field.type) return "agent";
  if (field.name.endsWith("URL")) return "uri";

  // 5. Comments-based vocabulary detection
  if (hasVocabularyInComments(field)) return "vocabulary";

  // 6. Explicit type mapping
  if (field.type === "identifier") return "identifier";
  if (field.type === "uri") return "uri";
  if (field.type === "boolean") return "boolean";
  if (field.type === "date") return "date";
  if (field.type === "integer") return "numeric";
  if (field.type === "decimal") return "numeric";

  // 7. Comments/description hints
  if (hasDateInComments(field)) return "date";

  // 8. Fallback
  return "text";
}

// =============================================================================
// Detection Helpers
// =============================================================================

function hasCoordinateRange(
  validators: ReadonlyArray<string | Record<string, unknown>>,
): boolean {
  for (const v of validators) {
    if (typeof v === "object" && v !== null && v.type === "range") {
      const params = v.params as Record<string, unknown> | undefined;
      if (params) {
        const min = params.min as number | undefined;
        const max = params.max as number | undefined;
        if (
          (min === -90 && max === 90) ||
          (min === -180 && max === 180)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function hasDateValidator(
  validators: ReadonlyArray<string | Record<string, unknown>>,
): boolean {
  for (const v of validators) {
    if (typeof v === "string" && (v === "iso8601Date" || v === "date")) {
      return true;
    }
  }
  return false;
}

function hasVocabularyInComments(field: FieldMetadata): boolean {
  const comments = field.comments || "";
  const desc = field["dc:description"] || "";
  return comments.includes("controlled vocabulary") ||
    desc.includes("controlled vocabulary");
}

function hasDateInComments(field: FieldMetadata): boolean {
  const comments = field.comments || "";
  const desc = field["dc:description"] || "";
  return comments.includes("ISO 8601") || desc.includes("ISO 8601");
}

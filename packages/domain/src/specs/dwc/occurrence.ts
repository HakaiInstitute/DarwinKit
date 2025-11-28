/**
 * Darwin Core Occurrence extension field definitions
 *
 * Based on fields found in FC2022_occ.csv and Darwin Core specification:
 * eventID, occurrenceID, basisOfRecord, scientificName, scientificNameID,
 * taxonRank, scientificNameAuthorship, kingdom, phylum, class, order, family,
 * genus, organismQuantity, organismQuantityType, sampleSizeValue, sampleSizeUnit,
 * verbatimIdentification, samplingProtocol, associatedSequences, identificationRemarks,
 * materialSampleID, occurrenceStatus, identificationQualifier, recordNumber,
 * catalogNumber, subfamily, tribe, identifiedBy, lifeStage, organismRemarks,
 * typeStatus, recordedBy
 */

import type { FieldDefinition } from "../field-definition.ts";
import { DARWIN_CORE_VALIDATORS } from "../validators.ts";
import { createVocabularyConfig } from "../vocabularies/config.ts";

const DWC_NAMESPACE = "http://rs.tdwg.org/dwc/terms/";

/**
 * Occurrence ID - Unique identifier for the occurrence
 */
export const occurrenceID: FieldDefinition = {
  id: "dwc-occurrenceID",
  schemaId: "dwc",
  name: "occurrenceID",
  semanticType: "identifier",
  validators: [
    DARWIN_CORE_VALIDATORS.required(),
    DARWIN_CORE_VALIDATORS.uniqueIdentifier(),
  ],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}occurrenceID`,
  label: "Occurrence ID",
  definition:
    "An identifier for the dwc:Occurrence (as opposed to a particular digital record of the dwc:Occurrence). In the absence of a persistent global unique identifier, construct one from a combination of identifiers in the record that will most closely make the dwc:occurrenceID globally unique.",
  examples: ["urn:catalog:UWBM:Bird:89776", "http://arctos.database.museum/guid/MSB:Mamm:233627"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  identifier: {
    identifierType: "uri",
    globallyUnique: true,
    persistentIdentifier: true,
    resolvable: true,
  },
};

/**
 * Event ID - Foreign key reference to the sampling event
 *
 * Note: In Occurrence tables, eventID is a foreign key (not unique) referencing the Event table.
 * Multiple occurrences can share the same eventID.
 */
export const eventID: FieldDefinition = {
  id: "dwc-occurrence-eventID",
  schemaId: "dwc",
  name: "eventID",
  semanticType: "identifier",
  validators: [
    DARWIN_CORE_VALIDATORS.required(),
    // No uniqueIdentifier() validator - this is a foreign key, not a primary key
  ],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}eventID`,
  label: "Event ID",
  definition:
    "An identifier for the set of information associated with a dwc:Event (something that occurs at a place and time). In Occurrence records, this is a foreign key referencing the Event table.",
  examples: ["INBO:VIS:Ev:00009375"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2023-06-28"),
  identifier: {
    identifierType: "local",
    globallyUnique: false,
    persistentIdentifier: true,
    resolvable: false,
  },
};

/**
 * Basis of Record - Nature of the data record
 */
export const basisOfRecord: FieldDefinition = {
  id: "dwc-basisOfRecord",
  schemaId: "dwc",
  name: "basisOfRecord",
  semanticType: "controlled-vocabulary",
  validators: [DARWIN_CORE_VALIDATORS.required()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}basisOfRecord`,
  label: "Basis of Record",
  definition: "The specific nature of the data record.",
  examples: ["PreservedSpecimen", "HumanObservation", "MachineObservation"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  vocabulary: createVocabularyConfig("basisOfRecord", "strict"),
};

/**
 * Scientific Name - Complete scientific name
 */
export const scientificName: FieldDefinition = {
  id: "dwc-scientificName",
  schemaId: "dwc",
  name: "scientificName",
  semanticType: "taxonomy",
  validators: [DARWIN_CORE_VALIDATORS.required()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}scientificName`,
  label: "Scientific Name",
  definition:
    "The full scientific name, with authorship and date information if known. When forming part of a dwc:Identification, this should be the name in lowest level taxonomic rank that can be determined. This term should not contain identification qualifications, which should instead be supplied in the dwc:identificationQualifier term.",
  examples: [
    "Coleoptera",
    "Vespertilionidae",
    "Manis",
    "Ctenomys sociabilis",
    "Ambystoma tigrinum diaboli",
  ],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  taxonomy: {
    nomenclaturalCode: "ICZN",
    hybridFormula: false,
  },
};

/**
 * Scientific Name ID - Identifier for the scientific name
 */
export const scientificNameID: FieldDefinition = {
  id: "dwc-scientificNameID",
  schemaId: "dwc",
  name: "scientificNameID",
  semanticType: "identifier",
  validators: [
    DARWIN_CORE_VALIDATORS.recommended(),
    DARWIN_CORE_VALIDATORS.url(),
  ],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}scientificNameID`,
  label: "Scientific Name ID",
  definition: "An identifier for the nomenclatural (not taxonomic) details of a scientific name.",
  examples: ["urn:lsid:ipni.org:names:37829-1:1.3"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  identifier: {
    identifierType: "uri",
    globallyUnique: true,
    persistentIdentifier: true,
    resolvable: true,
  },
};

/**
 * Taxon Rank - Taxonomic rank of the name
 */
export const taxonRank: FieldDefinition = {
  id: "dwc-taxonRank",
  schemaId: "dwc",
  name: "taxonRank",
  semanticType: "controlled-vocabulary",
  validators: [DARWIN_CORE_VALIDATORS.recommended()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}taxonRank`,
  label: "Taxon Rank",
  definition: "The taxonomic rank of the most specific name in the dwc:scientificName.",
  examples: ["subspecies", "varietas", "forma", "species", "genus"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  vocabulary: createVocabularyConfig("taxonRank", "recommended"),
  taxonomy: {
    rankVocabularyKey: "taxonRank",
  },
};

/**
 * Kingdom - Kingdom name
 */
export const kingdom: FieldDefinition = {
  id: "dwc-kingdom",
  schemaId: "dwc",
  name: "kingdom",
  semanticType: "taxonomy",
  validators: [DARWIN_CORE_VALIDATORS.recommended()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}kingdom`,
  label: "Kingdom",
  definition: "The full scientific name of the kingdom in which the dwc:Taxon is classified.",
  examples: [
    "Animalia",
    "Archaea",
    "Bacteria",
    "Chromista",
    "Fungi",
    "Plantae",
    "Protozoa",
    "Viruses",
  ],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  taxonomy: {
    rank: "kingdom",
  },
};

/**
 * Phylum - Phylum name
 */
export const phylum: FieldDefinition = {
  id: "dwc-phylum",
  schemaId: "dwc",
  name: "phylum",
  semanticType: "taxonomy",
  validators: [DARWIN_CORE_VALIDATORS.recommended()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}phylum`,
  label: "Phylum",
  definition:
    "The full scientific name of the phylum or division in which the dwc:Taxon is classified.",
  examples: ["Chordata", "Bryophyta"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  taxonomy: {
    rank: "phylum",
  },
};

/**
 * Class - Class name
 */
export const taxonClass: FieldDefinition = {
  id: "dwc-class",
  schemaId: "dwc",
  name: "class",
  semanticType: "taxonomy",
  validators: [DARWIN_CORE_VALIDATORS.recommended()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}class`,
  label: "Class",
  definition: "The full scientific name of the class in which the dwc:Taxon is classified.",
  examples: ["Mammalia", "Hepaticopsida"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  taxonomy: {
    rank: "class",
  },
};

/**
 * Order - Order name
 */
export const order: FieldDefinition = {
  id: "dwc-order",
  schemaId: "dwc",
  name: "order",
  semanticType: "taxonomy",
  validators: [DARWIN_CORE_VALIDATORS.recommended()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}order`,
  label: "Order",
  definition: "The full scientific name of the order in which the dwc:Taxon is classified.",
  examples: ["Carnivora", "Monocleales"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  taxonomy: {
    rank: "order",
  },
};

/**
 * Family - Family name
 */
export const family: FieldDefinition = {
  id: "dwc-family",
  schemaId: "dwc",
  name: "family",
  semanticType: "taxonomy",
  validators: [DARWIN_CORE_VALIDATORS.recommended()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}family`,
  label: "Family",
  definition: "The full scientific name of the family in which the dwc:Taxon is classified.",
  examples: ["Felidae", "Monocleaceae"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  taxonomy: {
    rank: "family",
  },
};

/**
 * Genus - Genus name
 */
export const genus: FieldDefinition = {
  id: "dwc-genus",
  schemaId: "dwc",
  name: "genus",
  semanticType: "taxonomy",
  validators: [DARWIN_CORE_VALIDATORS.recommended()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}genus`,
  label: "Genus",
  definition: "The full scientific name of the genus in which the dwc:Taxon is classified.",
  examples: ["Puma", "Monoclea"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  taxonomy: {
    rank: "genus",
  },
};

/**
 * Occurrence Status - Whether taxon was present or absent
 */
export const occurrenceStatus: FieldDefinition = {
  id: "dwc-occurrenceStatus",
  schemaId: "dwc",
  name: "occurrenceStatus",
  semanticType: "controlled-vocabulary",
  validators: [DARWIN_CORE_VALIDATORS.recommended()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}occurrenceStatus`,
  label: "Occurrence Status",
  definition: "A statement about the presence or absence of a dwc:Taxon at a dcterms:Location.",
  examples: ["present", "absent"],
  createdAt: new Date("2020-08-12"),
  updatedAt: new Date("2021-07-15"),
  vocabulary: createVocabularyConfig("occurrenceStatus", "recommended"),
};

/**
 * Life Stage - Age class or life stage
 */
export const lifeStage: FieldDefinition = {
  id: "dwc-lifeStage",
  schemaId: "dwc",
  name: "lifeStage",
  semanticType: "controlled-vocabulary",
  validators: [DARWIN_CORE_VALIDATORS.recommended()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}lifeStage`,
  label: "Life Stage",
  definition:
    "The age class or life stage of the dwc:Organism(s) at the time the dwc:Occurrence was recorded.",
  examples: ["adult", "mature", "juvenile", "eft", "nymph", "larva"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  vocabulary: createVocabularyConfig("lifeStage", "recommended"),
};

/**
 * Organism Quantity - Number or count of organisms
 */
export const organismQuantity: FieldDefinition = {
  id: "dwc-organismQuantity",
  schemaId: "dwc",
  name: "organismQuantity",
  semanticType: "measurement",
  validators: [DARWIN_CORE_VALIDATORS.recommended()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}organismQuantity`,
  label: "Organism Quantity",
  definition: "A number or enumeration value for the quantity of dwc:Organism(s).",
  examples: ["27", "12-18", "> 100", "uncertain"],
  createdAt: new Date("2015-03-27"),
  updatedAt: new Date("2021-07-15"),
  measurement: {
    measurementType: "count",
    precision: 0,
  },
};

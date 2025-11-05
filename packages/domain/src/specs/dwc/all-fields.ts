/**
 * Complete Darwin Core Field Definitions
 *
 * Auto-generated from TDWG Darwin Core vocabulary.
 * Source: https://raw.githubusercontent.com/tdwg/dwc/master/vocabulary/term_versions.csv
 * Generated: 2025-10-06T22:17:11.128Z
 *
 * DO NOT EDIT MANUALLY - Regenerate using scripts/generate-dwc-fields.ts
 */

import type { FieldDefinition } from "../field-definition.ts";

export const DWC_NAMESPACE = "http://rs.tdwg.org/dwc/terms/";
/**
 * Feedback URL
 */
export const feedbackURL: FieldDefinition = {
  id: "dwc-feedbackURL",
  schemaId: "dwc",
  name: "feedbackURL",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/feedbackURL",
  label: "Feedback URL",
  definition:
    "A uniform resource locator (URL) that points to a webpage on which a form may be submitted to gather feedback about the record.",
  examples: ["https://example.com/new?title=New+issue&body=This+comment+is+about+CAN12345"],
  comments:
    "Recommended best practice is to optionally include query strings that act to pre-populate web page form elements and communicate the context.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Institution ID
 */
export const institutionID: FieldDefinition = {
  id: "dwc-institutionID",
  schemaId: "dwc",
  name: "institutionID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/institutionID",
  label: "Institution ID",
  definition:
    "An identifier for the institution having custody of the object(s) or information referred to in the record.",
  examples: [
    "https://ror.org/015hz7p22",
    "http://grscicoll.org/institution/museum-southwestern-biology",
    "https://www.gbif.org/grscicoll/institution/e3d4dcc4-81e2-444c-8a5c-41d1044b5381",
  ],
  comments:
    "For physical specimens, the recommended best practice is to use a globally unique and resolvable identifier from a collections registry such as the Research Organization Registry (ROR) or the Global Registry of Scientific Collections (https://scientific-collections.gbif.org/)",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Collection ID
 */
export const collectionID: FieldDefinition = {
  id: "dwc-collectionID",
  schemaId: "dwc",
  name: "collectionID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/collectionID",
  label: "Collection ID",
  definition: "An identifier for the collection or dataset from which the record was derived.",
  examples: [
    "https://scientific-collections.gbif.org/collection/fbd3ed74-5a21-4e01-b86a-33d36f032d9c",
  ],
  comments:
    "For physical specimens, the recommended best practice is to use a globally unique and resolvable identifier from a collections registry such as the Global Registry of Scientific Collections (https://scientific-collections.gbif.org/).",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Dataset ID
 */
export const datasetID: FieldDefinition = {
  id: "dwc-datasetID",
  schemaId: "dwc",
  name: "datasetID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/datasetID",
  label: "Dataset ID",
  definition:
    "An identifier for the set of data. May be a global unique identifier or an identifier specific to a collection or institution.",
  examples: ["b15d4952-7d20-46f1-8a3e-556a512b04c5"],

  createdAt: new Date("2017-10-06"),
  updatedAt: new Date("2017-10-06"),
};

/**
 * Institution Code
 */
export const institutionCode: FieldDefinition = {
  id: "dwc-institutionCode",
  schemaId: "dwc",
  name: "institutionCode",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/institutionCode",
  label: "Institution Code",
  definition:
    "The name (or acronym) in use by the institution having custody of the object(s) or information referred to in the record.",
  examples: ["MVZ", "FMNH", "CLO"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Collection Code
 */
export const collectionCode: FieldDefinition = {
  id: "dwc-collectionCode",
  schemaId: "dwc",
  name: "collectionCode",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/collectionCode",
  label: "Collection Code",
  definition:
    "The name, acronym, coden, or initialism identifying the collection or data set from which the record was derived.",
  examples: ["Mammals", "Hildebrandt", "EBIRD"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Dataset Name
 */
export const datasetName: FieldDefinition = {
  id: "dwc-datasetName",
  schemaId: "dwc",
  name: "datasetName",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/datasetName",
  label: "Dataset Name",
  definition: "The name identifying the data set from which the record was derived.",
  examples: ["Grinnell Resurvey Mammals", "Lacey Ctenomys Recaptures"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Owner Institution Code
 */
export const ownerInstitutionCode: FieldDefinition = {
  id: "dwc-ownerInstitutionCode",
  schemaId: "dwc",
  name: "ownerInstitutionCode",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/ownerInstitutionCode",
  label: "Owner Institution Code",
  definition:
    "The name (or acronym) in use by the institution having ownership of the object(s) or information referred to in the record.",
  examples: ["NPS", "APN", "InBio"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Basis Of Record
 */
export const basisOfRecord: FieldDefinition = {
  id: "dwc-basisOfRecord",
  schemaId: "dwc",
  name: "basisOfRecord",
  semanticType: "controlled-vocabulary",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/basisOfRecord",
  label: "Basis Of Record",
  definition: "The specific nature of the data record.",
  examples: ["MaterialEntity", "PreservedSpecimen", "FossilSpecimen"],
  comments:
    "Recommended best practice is to use a controlled vocabulary such as the set of local names of the identifiers for classes in Darwin Core.",
  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Information Withheld
 */
export const informationWithheld: FieldDefinition = {
  id: "dwc-informationWithheld",
  schemaId: "dwc",
  name: "informationWithheld",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/informationWithheld",
  label: "Information Withheld",
  definition:
    "Additional information that exists, but that has not been shared in the given record.",
  examples: [
    "location information not given for endangered species",
    "collector identities withheld | ask about tissue samples",
  ],
  comments:
    "This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Data Generalizations
 */
export const dataGeneralizations: FieldDefinition = {
  id: "dwc-dataGeneralizations",
  schemaId: "dwc",
  name: "dataGeneralizations",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/dataGeneralizations",
  label: "Data Generalizations",
  definition:
    "Actions taken to make the shared data less specific or complete than in its original form. Suggests that alternative data of higher quality may be available on request.",
  examples: [
    "Coordinates generalized from original GPS coordinates to the nearest half degree grid cell`.",
  ],
  comments:
    "This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Dynamic Properties
 */
export const dynamicProperties: FieldDefinition = {
  id: "dwc-dynamicProperties",
  schemaId: "dwc",
  name: "dynamicProperties",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/dynamicProperties",
  label: "Dynamic Properties",
  definition:
    "A list of additional measurements, facts, characteristics, or assertions about the record. Meant to provide a mechanism for structured content.",
  examples: [
    "{heightInMeters:1.5}",
    "{targusLengthInMeters:0.014, weightInGrams:120}",
    "{natureOfID:expert identification, identificationEvidence:cytochrome B sequence}",
  ],
  comments:
    "Recommended best practice is to use a key:value encoding schema for a data interchange format such as JSON.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Occurrence
 */
export const Occurrence: FieldDefinition = {
  id: "dwc-Occurrence",
  schemaId: "dwc",
  name: "Occurrence",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/Occurrence",
  label: "Occurrence",
  definition: "An existence of a dwc:Organism at a particular place at a particular time.",
  examples: [
    "a wolf pack on the shore of Kluane Lake in 1988",
    "a virus in a plant leaf in the New York Botanical Garden at 15:29 on 2014-10-23",
    "a fungus in Central Park in the summer of 1929",
  ],

  createdAt: new Date("2023-09-18"),
  updatedAt: new Date("2023-09-18"),
};

/**
 * Occurrence ID
 */
export const occurrenceID: FieldDefinition = {
  id: "dwc-occurrenceID",
  schemaId: "dwc",
  name: "occurrenceID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/occurrenceID",
  label: "Occurrence ID",
  definition:
    "An identifier for the dwc:Occurrence (as opposed to a particular digital record of the dwc:Occurrence). In the absence of a persistent global unique identifier, construct one from a combination of identifiers in the record that will most closely make the dwc:occurrenceID globally unique.",
  examples: [
    "http://arctos.database.museum/guid/MSB:Mamm:233627",
    "000866d2-c177-4648-a200-ead4007051b9",
    "urn:catalog:UWBM:Bird:89776",
  ],
  comments: "Recommended best practice is to use a persistent, globally unique identifier.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Catalog Number
 */
export const catalogNumber: FieldDefinition = {
  id: "dwc-catalogNumber",
  schemaId: "dwc",
  name: "catalogNumber",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/catalogNumber",
  label: "Catalog Number",
  definition: "An identifier (preferably unique) for the record within the data set or collection.",
  examples: ["145732", "145732a", "2008.1334"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Record Number
 */
export const recordNumber: FieldDefinition = {
  id: "dwc-recordNumber",
  schemaId: "dwc",
  name: "recordNumber",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/recordNumber",
  label: "Record Number",
  definition:
    "An identifier given to the dwc:Occurrence at the time it was recorded. Often serves as a link between field notes and a dwc:Occurrence record, such as a specimen collector's number.",
  examples: ["OPP 7101"],
  comments:
    "This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Recorded By
 */
export const recordedBy: FieldDefinition = {
  id: "dwc-recordedBy",
  schemaId: "dwc",
  name: "recordedBy",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/recordedBy",
  label: "Recorded By",
  definition:
    "A list (concatenated and separated) of names of people, groups, or organizations responsible for recording the original dwc:Occurrence. The primary collector or observer, especially one who applies a personal identifier (dwc:recordNumber), should be listed first.",
  examples: [
    "José E. Crespo",
    "Oliver P. Pearson | Anita K. Pearson` (where the value in recordNumber `OPP 7101` corresponds to the collector number for the specimen in the field catalog of Oliver P. Pearson)",
  ],
  comments:
    "Recommended best practice is to separate the values in a list with space vertical bar space (` | `). This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Recorded By ID
 */
export const recordedByID: FieldDefinition = {
  id: "dwc-recordedByID",
  schemaId: "dwc",
  name: "recordedByID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/recordedByID",
  label: "Recorded By ID",
  definition:
    "A list (concatenated and separated) of the globally unique identifier for the person, people, groups, or organizations responsible for recording the original dwc:Occurrence.",
  examples: [
    "https://orcid.org/0000-0002-1825-0097` (for an individual)",
    "https://orcid.org/0000-0002-1825-0097 | https://orcid.org/0000-0002-1825-0098` (for a list of people)",
  ],
  comments:
    "Recommended best practice is to provide a single identifier that disambiguates the details of the identifying agent. If a list is used, it is recommended to separate the values in the list with space vertical bar space (` | `). The order of the identifiers on any list for this term can not be guaranteed to convey any semantics.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Individual Count
 */
export const individualCount: FieldDefinition = {
  id: "dwc-individualCount",
  schemaId: "dwc",
  name: "individualCount",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/individualCount",
  label: "Individual Count",
  definition: "The number of individuals present at the time of the dwc:Occurrence.",
  examples: ["0", "1", "25"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Organism Quantity
 */
export const organismQuantity: FieldDefinition = {
  id: "dwc-organismQuantity",
  schemaId: "dwc",
  name: "organismQuantity",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/organismQuantity",
  label: "Organism Quantity",
  definition: "A number or enumeration value for the quantity of dwc:Organisms.",
  examples: [
    "27` (organismQuantity) with `individuals` (organismQuantityType)",
    "12.5` (organismQuantity) with `% biomass` (organismQuantityType)",
    "r` (organismQuantity) with `Braun-Blanquet Scale` (organismQuantityType)",
  ],
  comments: "A dwc:organismQuantity must have a corresponding dwc:organismQuantityType.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Organism Quantity Type
 */
export const organismQuantityType: FieldDefinition = {
  id: "dwc-organismQuantityType",
  schemaId: "dwc",
  name: "organismQuantityType",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/organismQuantityType",
  label: "Organism Quantity Type",
  definition: "The type of quantification system used for the quantity of dwc:Organisms.",
  examples: [
    "27` (organismQuantity) with `individuals` (organismQuantityType)",
    "12.5` (organismQuantity) with `% biomass` (organismQuantityType)",
    "r` (organismQuantity) with `Braun-Blanquet Scale` (organismQuantityType)",
  ],
  comments:
    "A dwc:organismQuantityType must have a corresponding dwc:organismQuantity. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Sex
 */
export const sex: FieldDefinition = {
  id: "dwc-sex",
  schemaId: "dwc",
  name: "sex",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/sex",
  label: "Sex",
  definition: "The sex of the biological individual(s) represented in the dwc:Occurrence.",
  examples: ["female", "male", "hermaphrodite"],
  comments:
    "Recommended best practice is to use a controlled vocabulary. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Life Stage
 */
export const lifeStage: FieldDefinition = {
  id: "dwc-lifeStage",
  schemaId: "dwc",
  name: "lifeStage",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/lifeStage",
  label: "Life Stage",
  definition:
    "The age class or life stage of the dwc:Organism(s) at the time the dwc:Occurrence was recorded.",
  examples: ["zygote", "larva", "juvenile"],
  comments:
    "Recommended best practice is to use a controlled vocabulary. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Reproductive Condition
 */
export const reproductiveCondition: FieldDefinition = {
  id: "dwc-reproductiveCondition",
  schemaId: "dwc",
  name: "reproductiveCondition",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/reproductiveCondition",
  label: "Reproductive Condition",
  definition:
    "The reproductive condition of the biological individual(s) represented in the dwc:Occurrence.",
  examples: ["non-reproductive", "pregnant", "in bloom"],
  comments:
    "Recommended best practice is to use a controlled vocabulary. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Caste
 */
export const caste: FieldDefinition = {
  id: "dwc-caste",
  schemaId: "dwc",
  name: "caste",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/caste",
  label: "Caste",
  definition:
    "Categorisation of individuals for eusocial species (including some mammals and arthropods).",
  examples: ["queen", "male alate", "intercaste"],
  comments:
    "Recommended best practice is to use a controlled vocabulary that aligns best with the dwc:Taxon. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Behavior
 */
export const behavior: FieldDefinition = {
  id: "dwc-behavior",
  schemaId: "dwc",
  name: "behavior",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/behavior",
  label: "Behavior",
  definition: "The behavior shown by the subject at the time the dwc:Occurrence was recorded.",
  examples: ["roosting", "foraging", "running"],
  comments:
    "This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Vitality
 */
export const vitality: FieldDefinition = {
  id: "dwc-vitality",
  schemaId: "dwc",
  name: "vitality",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/vitality",
  label: "Vitality",
  definition:
    "An indication of whether a dwc:Organism was alive or dead at the time of collection or observation.",
  examples: ["alive", "dead", "mixedLot"],
  comments:
    "Recommended best practice is to use a controlled vocabulary. Intended to be used with records having a dwc:basisOfRecord of `PreservedSpecimen`, `MaterialEntity`, `MaterialSample`, or `HumanObservation`. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Establishment Means
 */
export const establishmentMeans: FieldDefinition = {
  id: "dwc-establishmentMeans",
  schemaId: "dwc",
  name: "establishmentMeans",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/establishmentMeans",
  label: "Establishment Means",
  definition:
    "Statement about whether a dwc:Organism has been introduced to a given place and time through the direct or indirect activity of modern humans.",
  examples: ["native", "nativeReintroduced", "introduced"],
  comments:
    "Recommended best practice is to use controlled value strings from the controlled vocabulary designated for use with this term, listed at http://rs.tdwg.org/dwc/doc/em/. For details, refer to https://doi.org/10.3897/biss.3.38084. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Degree of Establishment
 */
export const degreeOfEstablishment: FieldDefinition = {
  id: "dwc-degreeOfEstablishment",
  schemaId: "dwc",
  name: "degreeOfEstablishment",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/degreeOfEstablishment",
  label: "Degree of Establishment",
  definition:
    "The degree to which a dwc:Organism survives, reproduces, and expands its range at the given place and time.",
  examples: ["native", "captive", "cultivated"],
  comments:
    "Recommended best practice is to use controlled value strings from the controlled vocabulary designated for use with this term, listed at http://rs.tdwg.org/dwc/doc/doe/. For details, refer to https://doi.org/10.3897/biss.3.38084. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Pathway
 */
export const pathway: FieldDefinition = {
  id: "dwc-pathway",
  schemaId: "dwc",
  name: "pathway",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/pathway",
  label: "Pathway",
  definition: "The process by which a dwc:Organism came to be in a given place at a given time.",
  examples: ["releasedForUse", "otherEscape", "transportContaminant"],
  comments:
    "Recommended best practice is to use controlled value strings from the controlled vocabulary designated for use with this term, listed at http://rs.tdwg.org/dwc/doc/pw/. For details, refer to https://doi.org/10.3897/biss.3.38084. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Georeference Verification Status
 */
export const georeferenceVerificationStatus: FieldDefinition = {
  id: "dwc-georeferenceVerificationStatus",
  schemaId: "dwc",
  name: "georeferenceVerificationStatus",
  semanticType: "controlled-vocabulary",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/georeferenceVerificationStatus",
  label: "Georeference Verification Status",
  definition:
    "A categorical description of the extent to which the georeference has been verified to represent the best possible spatial description for the dcterms:Location of the dwc:Occurrence.",
  examples: ["unable to georeference", "requires georeference", "requires verification"],
  comments:
    "Recommended best practice is to use a controlled vocabulary. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Occurrence Status
 */
export const occurrenceStatus: FieldDefinition = {
  id: "dwc-occurrenceStatus",
  schemaId: "dwc",
  name: "occurrenceStatus",
  semanticType: "controlled-vocabulary",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/occurrenceStatus",
  label: "Occurrence Status",
  definition: "A statement about the presence or absence of a dwc:Taxon at a dcterms:Location.",
  examples: ["present", "absent"],
  comments:
    "For dwc:Occurrences, the default vocabulary is recommended to consist of `present` and `absent`, but can be extended by implementers with good justification. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Associated Media
 */
export const associatedMedia: FieldDefinition = {
  id: "dwc-associatedMedia",
  schemaId: "dwc",
  name: "associatedMedia",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/associatedMedia",
  label: "Associated Media",
  definition:
    "A list (concatenated and separated) of identifiers (publication, global unique identifier, URI) of media associated with the dwc:Occurrence.",
  examples: [
    "https://arctos.database.museum/media/10520962 | https://arctos.database.museum/media/10520964",
  ],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Associated Occurrences
 */
export const associatedOccurrences: FieldDefinition = {
  id: "dwc-associatedOccurrences",
  schemaId: "dwc",
  name: "associatedOccurrences",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/associatedOccurrences",
  label: "Associated Occurrences",
  definition:
    "A list (concatenated and separated) of identifiers of other dwc:Occurrence records and their associations to this dwc:Occurrence.",
  examples: [
    "parasite collected from:https://arctos.database.museum/guid/MSB:Mamm:215895?seid=950760",
    "encounter previous to:http://arctos.database.museum/guid/MSB:Mamm:292063?seid=3175067 | encounter previous to:http://arctos.database.museum/guid/MSB:Mamm:292063?seid=3177393 | encounter previous to:http://arctos.database.museum/guid/MSB:Mamm:292063?seid=3177394 | encounter previous to:http://arctos.database.museum/guid/MSB:Mamm:292063?seid=3177392 | encounter previous to:http://arctos.database.museum/guid/MSB:Mamm:292063?seid=3609139",
  ],
  comments:
    "This term can be used to provide a list of associations to other dwc:Occurrences. Note that the dwc:ResourceRelationship class is an alternative means of representing associations, and with more detail. Recommended best practice is to separate the values in a list with space vertical bar space (` | `).",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Associated References
 */
export const associatedReferences: FieldDefinition = {
  id: "dwc-associatedReferences",
  schemaId: "dwc",
  name: "associatedReferences",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/associatedReferences",
  label: "Associated References",
  definition:
    "A list (concatenated and separated) of identifiers (publication, bibliographic reference, global unique identifier, URI) of literature associated with the dwc:Occurrence.",
  examples: [
    "http://www.sciencemag.org/cgi/content/abstract/322/5899/261",
    "Christopher J. Conroy, Jennifer L. Neuwald. 2008. Phylogeographic study of the California vole, Microtus californicus Journal of Mammalogy, 89(3):755-767.",
    "Steven R. Hoofer and Ronald A. Van Den Bussche. 2001. Phylogenetic Relationships of Plecotine Bats and Allies Based on Mitochondrial Ribosomal Sequences. Journal of Mammalogy 82(1):131-137. | Walker, Faith M., Jeffrey T. Foster, Kevin P. Drees, Carol L. Chambers. 2014. Spotted bat (Euderma maculatum) microsatellite discovery using illumina sequencing. Conservation Genetics Resources.",
  ],
  comments:
    "Recommended best practice is to separate the values in a list with space vertical bar space (` | `). Note that the dwc:ResourceRelationship class is an alternative means of representing associations, and with more detail. Note also that the intended usage of the term dcterms:references in Darwin Core when applied to a dwc:Occurrence is to point to the definitive source representation of that dwc:Occurrence if one is available. Note also that the intended usage of dcterms:bibliographicCitation in Darwin Core when applied to a dwc:Occurrence is to provide the preferred way to cite the dwc:Occurrence itself.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Associated Taxa
 */
export const associatedTaxa: FieldDefinition = {
  id: "dwc-associatedTaxa",
  schemaId: "dwc",
  name: "associatedTaxa",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/associatedTaxa",
  label: "Associated Taxa",
  definition:
    "A list (concatenated and separated) of identifiers or names of dwc:Taxon records and the associations of this dwc:Occurrence to each of them.",
  examples: [
    "host:Quercus alba",
    "host:gbif.org/species/2879737",
    "parasitoid of:Cyclocephala signaticollis | predator of:Apis mellifera",
  ],
  comments:
    "This term can be used to provide a list of associations to dwc:Taxon records other than the one defined in the dwc:Occurrence. Note that the dwc:ResourceRelationship class is an alternative means of representing associations, and with more detail. This term is not apt for establishing relationships between dwc:Taxon records, only between specific dwc:Occurrences of a dwc:Organism with other dwc:Taxon records. Recommended best practice is to separate the values in a list with space vertical bar space (` | `).",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Other Catalog Numbers
 */
export const otherCatalogNumbers: FieldDefinition = {
  id: "dwc-otherCatalogNumbers",
  schemaId: "dwc",
  name: "otherCatalogNumbers",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/otherCatalogNumbers",
  label: "Other Catalog Numbers",
  definition:
    "A list (concatenated and separated) of previous or alternate fully qualified catalog numbers or other human-used identifiers for the same dwc:Occurrence, whether in the current or any other data set or collection.",
  examples: ["FMNH:Mammal:1234", "NPS YELLO6778 | MBG 33424"],
  comments:
    "Recommended best practice is to separate the values in a list with space vertical bar space (` | `).",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Occurrence Remarks
 */
export const occurrenceRemarks: FieldDefinition = {
  id: "dwc-occurrenceRemarks",
  schemaId: "dwc",
  name: "occurrenceRemarks",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/occurrenceRemarks",
  label: "Occurrence Remarks",
  definition: "Comments or notes about the dwc:Occurrence.",
  examples: ["found dead on road"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Organism
 */
export const Organism: FieldDefinition = {
  id: "dwc-Organism",
  schemaId: "dwc",
  name: "Organism",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/Organism",
  label: "Organism",
  definition:
    "A particular organism or defined group of organisms considered to be taxonomically homogeneous.",
  examples: [
    "a specific bird",
    "a specific wolf pack",
    "a specific instance of a bacterial culture",
  ],
  comments:
    "Instances of the dwc:Organism class are intended to facilitate linking one or more dwc:Identification instances to one or more dwc:Occurrence instances. Therefore, things that are typically assigned scientific names (such as viruses, hybrids, and lichens) and aggregates whose dwc:Occurrences are typically recorded (such as packs, clones, and colonies) are included in the scope of this class.",
  createdAt: new Date("2023-09-18"),
  updatedAt: new Date("2023-09-18"),
};

/**
 * Organism ID
 */
export const organismID: FieldDefinition = {
  id: "dwc-organismID",
  schemaId: "dwc",
  name: "organismID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/organismID",
  label: "Organism ID",
  definition:
    "An identifier for the dwc:Organism instance (as opposed to a particular digital record of the dwc:Organism). May be a globally unique identifier or an identifier specific to the data set.",
  examples: ["http://arctos.database.museum/guid/WNMU:Mamm:1249"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Organism Name
 */
export const organismName: FieldDefinition = {
  id: "dwc-organismName",
  schemaId: "dwc",
  name: "organismName",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/organismName",
  label: "Organism Name",
  definition: "A textual name or label assigned to a dwc:Organism instance.",
  examples: ["Huberta", "Boab Prison Tree", "J pod"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Organism Scope
 */
export const organismScope: FieldDefinition = {
  id: "dwc-organismScope",
  schemaId: "dwc",
  name: "organismScope",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/organismScope",
  label: "Organism Scope",
  definition:
    "A description of the kind of dwc:Organism instance. Can be used to indicate whether the dwc:Organism instance represents a discrete organism or if it represents a particular type of aggregation.",
  examples: ["multicellular organism", "virus", "clone"],
  comments:
    "Recommended best practice is to use a controlled vocabulary. This term is not intended to be used to specify a type of dwc:Taxon. To describe the kind of dwc:Organism using a URI object in RDF, use rdf:type (http://www.w3.org/1999/02/22-rdf-syntax-ns#type) instead.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Cause Of Death
 */
export const causeOfDeath: FieldDefinition = {
  id: "dwc-causeOfDeath",
  schemaId: "dwc",
  name: "causeOfDeath",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/causeOfDeath",
  label: "Cause Of Death",
  definition: "An indication of the known or suspected cause of death of a dwc:Organism.",
  examples: ["trap", "poison", "starvation"],
  comments:
    "The cause may be due to natural causes (e.g., disease, predation), human-related activities (e.g., roadkill, pollution), or other environmental factors (e.g., extreme weather events).",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Associated Organisms
 */
export const associatedOrganisms: FieldDefinition = {
  id: "dwc-associatedOrganisms",
  schemaId: "dwc",
  name: "associatedOrganisms",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/associatedOrganisms",
  label: "Associated Organisms",
  definition:
    "A list (concatenated and separated) of identifiers of other dwc:Organisms and the associations of this dwc:Organism to each of them.",
  examples: [
    "sibling of:http://arctos.database.museum/guid/DMNS:Mamm:14171",
    "parent of:http://arctos.database.museum/guid/MSB:Mamm:196208 | parent of:http://arctos.database.museum/guid/MSB:Mamm:196523 | sibling of:http://arctos.database.museum/guid/MSB:Mamm:142638",
  ],
  comments:
    "This term can be used to provide a list of associations to other dwc:Organisms. Note that the dwc:ResourceRelationship class is an alternative means of representing associations, and with more detail. Recommended best practice is to separate the values in a list with space vertical bar space (` | `).",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Previous Identifications
 */
export const previousIdentifications: FieldDefinition = {
  id: "dwc-previousIdentifications",
  schemaId: "dwc",
  name: "previousIdentifications",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/previousIdentifications",
  label: "Previous Identifications",
  definition:
    "A list (concatenated and separated) of previous assignments of names to the dwc:Organism.",
  examples: [
    "Chalepidae",
    "Pinus abies",
    "Anthus sp., field ID by G. Iglesias | Anthus correndera, expert ID by C. Cicero 2009-02-12 based on morphology",
  ],
  comments:
    "Recommended best practice is to separate the values in a list with space vertical bar space (` | `).",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Organism Remarks
 */
export const organismRemarks: FieldDefinition = {
  id: "dwc-organismRemarks",
  schemaId: "dwc",
  name: "organismRemarks",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/organismRemarks",
  label: "Organism Remarks",
  definition: "Comments or notes about the dwc:Organism instance.",
  examples: ["One of a litter of six"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Material Entity
 */
export const MaterialEntity: FieldDefinition = {
  id: "dwc-MaterialEntity",
  schemaId: "dwc",
  name: "MaterialEntity",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/MaterialEntity",
  label: "Material Entity",
  definition:
    "An entity that can be identified, exists for some period of time, and consists in whole or in part of physical matter while it exists.",
  examples: [
    "an instance of a fossil",
    "an instance of a herbarium sheet with its attached plant specimen",
    "a particular part of the plant-derived material affixed to a herbarium sheet",
  ],
  comments:
    "The term is defined at the most general level to admit descriptions of any subtype of material entity within the scope of Darwin Core. In particular, any kind of material sample, preserved specimen, fossil, or exemplar from living collections is intended to be subsumed under this term.",
  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Material Entity ID
 */
export const materialEntityID: FieldDefinition = {
  id: "dwc-materialEntityID",
  schemaId: "dwc",
  name: "materialEntityID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/materialEntityID",
  label: "Material Entity ID",
  definition: "An identifier for a particular instance of a dwc:MaterialEntity.",
  examples: ["06809dc5-f143-459a-be1a-6f03e63fc083"],
  comments:
    "Values of dwc:materialEntityID are intended to uniquely and persistently identify a particular dwc:MaterialEntity within some context. Examples of context include a particular sample collection, an organization, or the worldwide scale. Recommended best practice is to use a persistent, globally unique identifier. The identifier is bound to a physical object (the dwc:MaterialEntity) as opposed to a particular digital record (representation) of that physical object.",
  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Digital Specimen Identifier
 */
export const digitalSpecimenID: FieldDefinition = {
  id: "dwc-digitalSpecimenID",
  schemaId: "dwc",
  name: "digitalSpecimenID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/digitalSpecimenID",
  label: "Digital Specimen Identifier",
  definition: "An identifier for a particular instance of a Digital Specimen.",
  examples: [
    "https://doi.org/10.3535/M42-Z4P-DRD",
    "https://doi.org/10.3535/M42-Z4P-DRD?urlappend=/1",
    "https://doi.org/10.3535/M42-Z4P-DRD?locatt=/1",
  ],
  comments:
    "A Digital Specimen is defined in https://doi.org/10.3897/rio.7.e67379. A dwc:digitalSpecimenID is intended to uniquely and persistently identify a Digital Specimen. Recommended best practice is to use a DOI with machine readable metadata in the DOI record that uses a community agreed metadata profile (also known as FDO profile) for a Digital Specimen. For an example see: https://doi.org/10.3535/N75-CR4-0SM?noredirect. The identifier is for a digital information artifact (the Digital Specimen) as opposed to an identifier for a specific instance of a dwc:MaterialEntity.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Material Entity Type
 */
export const materialEntityType: FieldDefinition = {
  id: "dwc-materialEntityType",
  schemaId: "dwc",
  name: "materialEntityType",
  semanticType: "controlled-vocabulary",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/materialEntityType",
  label: "Material Entity Type",
  definition: "A category that best matches the nature of a dwc:MaterialEntity.",
  examples: ["Macro-object", "Micro-object", "Oversized object"],
  comments:
    "A more generic classification of a dwc:MaterialEntity than dwc:preparations. Recommended best practice is to use a controlled vocabulary. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Discipline
 */
export const discipline: FieldDefinition = {
  id: "dwc-discipline",
  schemaId: "dwc",
  name: "discipline",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/discipline",
  label: "Discipline",
  definition: "The primary branch or branches of knowledge represented by the record.",
  examples: ["Botany", "Botany | Virology | Taxonomy"],
  comments:
    "This term can be used to classify records according to branches of knowledge. Recommended best practice is to use a controlled vocabulary and to separate the values in a list with space vertical bar space ( | ).This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.  It is also recommended to use this field to describe specimenType in MIDS.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Preparations
 */
export const preparations: FieldDefinition = {
  id: "dwc-preparations",
  schemaId: "dwc",
  name: "preparations",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/preparations",
  label: "Preparations",
  definition:
    "A list (concatenated and separated) of preparations and preservation methods for a dwc:MaterialEntity.",
  examples: ["fossil", "cast", "photograph"],
  comments:
    "Recommended best practice is to separate the values in a list with space vertical bar space ( | ). This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Disposition
 */
export const disposition: FieldDefinition = {
  id: "dwc-disposition",
  schemaId: "dwc",
  name: "disposition",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/disposition",
  label: "Disposition",
  definition: "The current state of a dwc:MaterialEntity with respect to a collection.",
  examples: ["in collection", "missing", "on loan"],
  comments:
    "Recommended best practice is to use a controlled vocabulary. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Verbatim Label
 */
export const verbatimLabel: FieldDefinition = {
  id: "dwc-verbatimLabel",
  schemaId: "dwc",
  name: "verbatimLabel",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/verbatimLabel",
  label: "Verbatim Label",
  definition:
    "The content of this term should include no embellishments, prefixes, headers or other additions made to the text. Abbreviations must not be expanded and supposed misspellings must not be corrected. Lines or breakpoints between blocks of text that could be verified by seeing the original labels or images of them may be used. Examples of material entities include preserved specimens, fossil specimens, and material samples. Best practice is to use UTF-8 for all characters. Best practice is to add comment “verbatimLabel derived from human transcription” in dwc:occurrenceRemarks.",

  comments: "Examples can be found at https://dwc.tdwg.org/examples/verbatimLabel.",
  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Associated Sequences
 */
export const associatedSequences: FieldDefinition = {
  id: "dwc-associatedSequences",
  schemaId: "dwc",
  name: "associatedSequences",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/associatedSequences",
  label: "Associated Sequences",
  definition:
    "A list (concatenated and separated) of identifiers (publication, global unique identifier, URI) of genetic sequence information associated with the dwc:MaterialEntity.",
  examples: [
    "http://www.ncbi.nlm.nih.gov/nuccore/U34853.1",
    "http://www.ncbi.nlm.nih.gov/nuccore/GU328060 | http://www.ncbi.nlm.nih.gov/nuccore/AF326093",
  ],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Material Entity Remarks
 */
export const materialEntityRemarks: FieldDefinition = {
  id: "dwc-materialEntityRemarks",
  schemaId: "dwc",
  name: "materialEntityRemarks",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/materialEntityRemarks",
  label: "Material Entity Remarks",
  definition: "Comments or notes about the dwc:MaterialEntity instance.",
  examples: ["found in association with charred remains", "some original fragments missing"],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Material Sample
 */
export const MaterialSample: FieldDefinition = {
  id: "dwc-MaterialSample",
  schemaId: "dwc",
  name: "MaterialSample",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/MaterialSample",
  label: "Material Sample",
  definition: "A material entity that represents an entity of interest in whole or in part.",
  examples: [
    "a whole organism preserved in a collection",
    "a part of an organism isolated for some purpose",
    "a soil sample",
  ],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Material Sample ID
 */
export const materialSampleID: FieldDefinition = {
  id: "dwc-materialSampleID",
  schemaId: "dwc",
  name: "materialSampleID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/materialSampleID",
  label: "Material Sample ID",
  definition:
    "An identifier for the dwc:MaterialSample (as opposed to a particular digital record of the dwc:MaterialSample). In the absence of a persistent global unique identifier, construct one from a combination of identifiers in the record that will most closely make the dwc:materialSampleID globally unique.",
  examples: ["06809dc5-f143-459a-be1a-6f03e63fc083"],
  comments: "Recommended best practice is to use a persistent, globally unique identifier.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Event
 */
export const Event: FieldDefinition = {
  id: "dwc-Event",
  schemaId: "dwc",
  name: "Event",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/Event",
  label: "Event",
  definition: "An action that occurs at some location during some time.",
  examples: ["a specimen collecting event", "a camera trap image capture", "a marine trawl"],

  createdAt: new Date("2023-09-18"),
  updatedAt: new Date("2023-09-18"),
};

/**
 * Event ID
 */
export const eventID: FieldDefinition = {
  id: "dwc-eventID",
  schemaId: "dwc",
  name: "eventID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/eventID",
  label: "Event ID",
  definition:
    "An identifier for the set of information associated with a dwc:Event (something that occurs at a place and time). May be a global unique identifier or an identifier specific to the data set.",
  examples: ["INBO:VIS:Ev:00009375"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Parent Event ID
 */
export const parentEventID: FieldDefinition = {
  id: "dwc-parentEventID",
  schemaId: "dwc",
  name: "parentEventID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/parentEventID",
  label: "Parent Event ID",
  definition:
    "An identifier for the broader dwc:Event that groups this and potentially other dwc:Events.",
  examples: [
    "A1` (parentEventID to identify the main Whittaker Plot in nested samples, each with its own eventID - `A1:1`, `A1:2`).",
  ],
  comments:
    "Use a globally unique identifier for a dwc:Event or an identifier for a dwc:Event that is specific to the data set.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Event Type
 */
export const eventType: FieldDefinition = {
  id: "dwc-eventType",
  schemaId: "dwc",
  name: "eventType",
  semanticType: "controlled-vocabulary",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/eventType",
  label: "Event Type",
  definition: "The nature of the dwc:Event.",
  examples: ["Sample", "Observation", "Site Visit"],
  comments:
    "Recommended best practice is to use a controlled vocabulary. Regardless of the dwc:eventType, the interval of the dwc:Event can be captured in dwc:eventDate. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Field Number
 */
export const fieldNumber: FieldDefinition = {
  id: "dwc-fieldNumber",
  schemaId: "dwc",
  name: "fieldNumber",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/fieldNumber",
  label: "Field Number",
  definition:
    "An identifier given to the dwc:Event in the field. Often serves as a link between field notes and the dwc:Event.",
  examples: ["RV Sol 87-03-08"],
  comments:
    "This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Project Title
 */
export const projectTitle: FieldDefinition = {
  id: "dwc-projectTitle",
  schemaId: "dwc",
  name: "projectTitle",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/projectTitle",
  label: "Project Title",
  definition:
    "A list (concatenated and separated) of titles or names for projects that contributed to a dwc:Event.",
  examples: ["The Nansen Legacy", "Scalidophora i Noreg", "Arctic Deep"],
  comments:
    "Use this term to provide the official name or title of a project as it is commonly known and cited. Avoid abbreviations unless they are widely understood. The recommended best practice is to separate the values in a list with space vertical bar space ( | ).",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Project ID
 */
export const projectID: FieldDefinition = {
  id: "dwc-projectID",
  schemaId: "dwc",
  name: "projectID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/projectID",
  label: "Project ID",
  definition:
    "A list (concatenated and separated) of identifiers for projects that contributed to a dwc:Event.",
  examples: ["RCN276730", "RCN276730 | Artsproject_7-24", "OC202405"],
  comments:
    "A projectID may be shared in multiple distinct datasets. The nature of the association can be described in the metadata project description element. This term should be used to provide a globally unique identifier (GUID) for a project, if available. This could be a DOI, URI, or any other persistent identifier that ensures a project can be uniquely distinguished from others. The recommended best practice is to separate the values in a list with space vertical bar space ( | ).",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Funding Attribution ID
 */
export const fundingAttributionID: FieldDefinition = {
  id: "dwc-fundingAttributionID",
  schemaId: "dwc",
  name: "fundingAttributionID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/fundingAttributionID",
  label: "Funding Attribution ID",
  definition:
    "A list (concatenated and separated) of the globally unique identifiers for the funding organizations or agencies that supported the project.",
  examples: [
    "https://ror.org/00epmv149",
    "https://ror.org/00epmv149 | https://ror.org/04jnzhb65",
    "https://www.wikidata.org/wiki/Q13102615",
  ],
  comments:
    "Provide a unique identifier for the funding body, such as an identifier used in governmental or international databases. If no official identifier exists, use a persistent and unique identifier within your organization or dataset. The recommended best practice is to separate the values in a list with space vertical bar space ( | ).",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Event Date
 */
export const eventDate: FieldDefinition = {
  id: "dwc-eventDate",
  schemaId: "dwc",
  name: "eventDate",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/eventDate",
  label: "Event Date",
  definition:
    "The date-time or interval during which a dwc:Event occurred. For occurrences, this is the date-time when the dwc:Event was recorded. Not suitable for a time in a geological context.",
  examples: [
    "1963-03-08T14:07-06:00` (8 Mar 1963 at or after 2:07pm and before 2:08pm in the time zone six hours earlier than UTC)",
    "2009-02-20T08:40Z` (20 February 2009 at or after 8:40am and before 8:41 UTC)",
    "2018-08-29T15:19` (29 August 2018 at or after 3:19pm and before 3:20pm local time)",
  ],
  comments: "Recommended best practice is to use a date that conforms to ISO 8601-1:2019.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Event Time
 */
export const eventTime: FieldDefinition = {
  id: "dwc-eventTime",
  schemaId: "dwc",
  name: "eventTime",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/eventTime",
  label: "Event Time",
  definition: "The time or interval during which a dwc:Event occurred.",
  examples: [
    "14:07-06:00` (at or after 2:07pm and before 2:08pm in the time zone six hours earlier than UTC)",
    "08:40:21Z` (at or after 8:40:21am and before 8:41:22am UTC)",
    "13:00:00Z/15:30:00Z` (at or after 1pm and before 3:30pm UTC)",
  ],
  comments: "Recommended best practice is to use a time of day that conforms to ISO 8601-1:2019.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Start Day Of Year
 */
export const startDayOfYear: FieldDefinition = {
  id: "dwc-startDayOfYear",
  schemaId: "dwc",
  name: "startDayOfYear",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/startDayOfYear",
  label: "Start Day Of Year",
  definition:
    "The earliest integer day of the year on which the dwc:Event occurred (1 for January 1, 365 for December 31, except in a leap year, in which case it is 366).",
  examples: [
    "1` (1 January)",
    "366` (31 December)",
    "365` (30 December in a leap year, 31 December in a non-leap year)",
  ],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * End Day Of Year
 */
export const endDayOfYear: FieldDefinition = {
  id: "dwc-endDayOfYear",
  schemaId: "dwc",
  name: "endDayOfYear",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/endDayOfYear",
  label: "End Day Of Year",
  definition:
    "The latest integer day of the year on which the dwc:Event occurred (1 for January 1, 365 for December 31, except in a leap year, in which case it is 366).",
  examples: ["1` (1 January)", "32` (1 February)", "366` (31 December)"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Year
 */
export const year: FieldDefinition = {
  id: "dwc-year",
  schemaId: "dwc",
  name: "year",
  semanticType: "temporal",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/year",
  label: "Year",
  definition:
    "The four-digit year in which the dwc:Event occurred, according to the Common Era Calendar.",
  examples: ["1160", "2008"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Month
 */
export const month: FieldDefinition = {
  id: "dwc-month",
  schemaId: "dwc",
  name: "month",
  semanticType: "temporal",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/month",
  label: "Month",
  definition: "The integer month in which the dwc:Event occurred.",
  examples: ["1` (January)", "10` (October)"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Day
 */
export const day: FieldDefinition = {
  id: "dwc-day",
  schemaId: "dwc",
  name: "day",
  semanticType: "temporal",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/day",
  label: "Day",
  definition: "The integer day of the month on which the dwc:Event occurred.",
  examples: ["9", "28"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Verbatim EventDate
 */
export const verbatimEventDate: FieldDefinition = {
  id: "dwc-verbatimEventDate",
  schemaId: "dwc",
  name: "verbatimEventDate",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/verbatimEventDate",
  label: "Verbatim EventDate",
  definition:
    "The verbatim original representation of the date and time information for a dwc:Event.",
  examples: ["spring 1910", "Marzo 2002", "1999-03-XX"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Habitat
 */
export const habitat: FieldDefinition = {
  id: "dwc-habitat",
  schemaId: "dwc",
  name: "habitat",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/habitat",
  label: "Habitat",
  definition: "A category or description of the habitat in which the dwc:Event occurred.",
  examples: ["oak savanna", "pre-cordilleran steppe"],
  comments:
    "This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Sampling Protocol
 */
export const samplingProtocol: FieldDefinition = {
  id: "dwc-samplingProtocol",
  schemaId: "dwc",
  name: "samplingProtocol",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/samplingProtocol",
  label: "Sampling Protocol",
  definition:
    "The names of, references to, or descriptions of the methods or protocols used during a dwc:Event.",
  examples: ["UV light trap", "mist net", "bottom trawl"],
  comments:
    "Recommended best practice is describe a dwc:Event with no more than one sampling protocol. In the case of a summary Event with multiple protocols, in which a specific protocol can not be attributed to specific dwc:Occurrences, the recommended best practice is to separate the values in a list with space vertical bar space (` | `). This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Sample Size Value
 */
export const sampleSizeValue: FieldDefinition = {
  id: "dwc-sampleSizeValue",
  schemaId: "dwc",
  name: "sampleSizeValue",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/sampleSizeValue",
  label: "Sample Size Value",
  definition:
    "A numeric value for a measurement of the size (time duration, length, area, or volume) of a sample in a sampling dwc:Event.",
  examples: ["5` (sampleSizeValue) with `metre` (sampleSizeUnit)"],
  comments: "A dwc:sampleSizeValue must have a corresponding dwc:sampleSizeUnit.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Sample Size Unit
 */
export const sampleSizeUnit: FieldDefinition = {
  id: "dwc-sampleSizeUnit",
  schemaId: "dwc",
  name: "sampleSizeUnit",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/sampleSizeUnit",
  label: "Sample Size Unit",
  definition:
    "The unit of measurement of the size (time duration, length, area, or volume) of a sample in a sampling dwc:Event.",
  examples: ["minute", "hour", "day"],
  comments:
    "A dwc:sampleSizeUnit must have a corresponding dwc:sampleSizeValue, e.g., `5` for dwc:sampleSizeValue with `m` for dwc:sampleSizeUnit. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Sampling Effort
 */
export const samplingEffort: FieldDefinition = {
  id: "dwc-samplingEffort",
  schemaId: "dwc",
  name: "samplingEffort",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/samplingEffort",
  label: "Sampling Effort",
  definition: "The amount of effort expended during a dwc:Event.",
  examples: ["40 trap-nights", "10 observer-hours", "10 km by foot"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Field Notes
 */
export const fieldNotes: FieldDefinition = {
  id: "dwc-fieldNotes",
  schemaId: "dwc",
  name: "fieldNotes",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/fieldNotes",
  label: "Field Notes",
  definition:
    "One of a) an indicator of the existence of, b) a reference to (publication, URI), or c) the text of notes taken in the field about the dwc:Event.",
  examples: ["Notes available in the Grinnell-Miller Library."],
  comments:
    "This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Event Remarks
 */
export const eventRemarks: FieldDefinition = {
  id: "dwc-eventRemarks",
  schemaId: "dwc",
  name: "eventRemarks",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/eventRemarks",
  label: "Event Remarks",
  definition: "Comments or notes about the dwc:Event.",
  examples: ["After the recent rains the river is nearly at flood stage."],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Location ID
 */
export const locationID: FieldDefinition = {
  id: "dwc-locationID",
  schemaId: "dwc",
  name: "locationID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/locationID",
  label: "Location ID",
  definition:
    "An identifier for the set of dcterms:Location information. May be a global unique identifier or an identifier specific to the data set.",
  examples: ["https://opencontext.org/subjects/768A875F-E205-4D0B-DE55-BAB7598D0FD1"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Higher Geography ID
 */
export const higherGeographyID: FieldDefinition = {
  id: "dwc-higherGeographyID",
  schemaId: "dwc",
  name: "higherGeographyID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/higherGeographyID",
  label: "Higher Geography ID",
  definition: "An identifier for the geographic region within which the dcterms:Location occurred.",
  examples: [
    "http://vocab.getty.edu/tgn/1002002` (Antártida e Islas del Atlántico Sur, Territorio Nacional de la Tierra del Fuego, Argentina).",
  ],
  comments:
    "Recommended best practice is to use a persistent identifier from a controlled vocabulary such as the Getty Thesaurus of Geographic Names.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Higher Geography
 */
export const higherGeography: FieldDefinition = {
  id: "dwc-higherGeography",
  schemaId: "dwc",
  name: "higherGeography",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/higherGeography",
  label: "Higher Geography",
  definition:
    "A list (concatenated and separated) of geographic names less specific than the information captured in the dwc:locality term.",
  examples: [
    "North Atlantic Ocean",
    "South America | Argentina | Patagonia | Parque Nacional Nahuel Huapi | Neuquén | Los Lagos` with accompanying values `South America` (continent) `Argentina` (country), `Neuquén` (first order division), and `Los Lagos` (second order division)",
  ],
  comments:
    "Recommended best practice is to separate the values in a list with space vertical bar space (` | `), with terms in order from least specific to most specific.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Continent
 */
export const continent: FieldDefinition = {
  id: "dwc-continent",
  schemaId: "dwc",
  name: "continent",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/continent",
  label: "Continent",
  definition: "The name of the continent in which the dcterms:Location occurs.",
  examples: ["Africa", "Antarctica", "Asia"],
  comments:
    "Recommended best practice is to use a controlled vocabulary such as the Getty Thesaurus of Geographic Names. Recommended best practice is to leave this field blank if the dcterms:Location spans multiple entities at this administrative level or if the dcterms:Location might be in one or another of multiple possible entities at this level. Multiplicity and uncertainty of the geographic entity can be captured either in the term dwc:higherGeography or in the term dwc:locality, or both.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Water Body
 */
export const waterBody: FieldDefinition = {
  id: "dwc-waterBody",
  schemaId: "dwc",
  name: "waterBody",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/waterBody",
  label: "Water Body",
  definition: "The name of the water body in which the dcterms:Location occurs.",
  examples: ["Indian Ocean", "Baltic Sea", "Hudson River"],
  comments:
    "Recommended best practice is to use a controlled vocabulary such as the Getty Thesaurus of Geographic Names.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Island Group
 */
export const islandGroup: FieldDefinition = {
  id: "dwc-islandGroup",
  schemaId: "dwc",
  name: "islandGroup",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/islandGroup",
  label: "Island Group",
  definition: "The name of the island group in which the dcterms:Location occurs.",
  examples: ["Alexander Archipelago", "Archipiélago Diego Ramírez", "Seychelles"],
  comments:
    "Recommended best practice is to use a controlled vocabulary such as the Getty Thesaurus of Geographic Names.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Island
 */
export const island: FieldDefinition = {
  id: "dwc-island",
  schemaId: "dwc",
  name: "island",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/island",
  label: "Island",
  definition: "The name of the island on or near which the dcterms:Location occurs.",
  examples: ["Nosy Be", "Bikini Atoll", "Vancouver"],
  comments:
    "Recommended best practice is to use a controlled vocabulary such as the Getty Thesaurus of Geographic Names.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Country
 */
export const country: FieldDefinition = {
  id: "dwc-country",
  schemaId: "dwc",
  name: "country",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/country",
  label: "Country",
  definition:
    "The name of the country or major administrative unit in which the dcterms:Location occurs.",
  examples: ["Denmark", "Colombia", "España"],
  comments:
    "Recommended best practice is to use a controlled vocabulary such as the Getty Thesaurus of Geographic Names. Recommended best practice is to leave this field blank if the dcterms:Location spans multiple entities at this administrative level or if the dcterms:Location might be in one or another of multiple possible entities at this level. Multiplicity and uncertainty of the geographic entity can be captured either in the term dwc:higherGeography or in the term dwc:locality, or both.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Country Code
 */
export const countryCode: FieldDefinition = {
  id: "dwc-countryCode",
  schemaId: "dwc",
  name: "countryCode",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/countryCode",
  label: "Country Code",
  definition: "The standard code for the country in which the dcterms:Location occurs.",
  examples: ["AR", "SV", "XZ"],
  comments:
    "Recommended best practice is to use an ISO 3166-1-alpha-2 country code, or `ZZ` (for an unknown location or a location unassignable to a single country code), or `XZ` (for the high seas beyond national jurisdictions).",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * First Order Division
 */
export const stateProvince: FieldDefinition = {
  id: "dwc-stateProvince",
  schemaId: "dwc",
  name: "stateProvince",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/stateProvince",
  label: "First Order Division",
  definition:
    "The name of the next smaller administrative region than country (state, province, canton, department, region, etc.) in which the dcterms:Location occurs.",
  examples: ["Montana", "Minas Gerais", "Córdoba"],
  comments:
    "Recommended best practice is to use a controlled vocabulary such as the Getty Thesaurus of Geographic Names. Recommended best practice is to leave this field blank if the dcterms:Location spans multiple entities at this administrative level or if the dcterms:Location might be in one or another of multiple possible entities at this level. Multiplicity and uncertainty of the geographic entity can be captured either in the term dwc:higherGeography or in the term dwc:locality, or both.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Second Order Division
 */
export const county: FieldDefinition = {
  id: "dwc-county",
  schemaId: "dwc",
  name: "county",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/county",
  label: "Second Order Division",
  definition:
    "The full, unabbreviated name of the next smaller administrative region than stateProvince (county, shire, department, etc.) in which the dcterms:Location occurs.",
  examples: ["Missoula", "Los Lagos", "Mataró"],
  comments:
    "Recommended best practice is to use a controlled vocabulary such as the Getty Thesaurus of Geographic Names. Recommended best practice is to leave this field blank if the dcterms:Location spans multiple entities at this administrative level or if the dcterms:Location might be in one or another of multiple possible entities at this level. Multiplicity and uncertainty of the geographic entity can be captured either in the term dwc:higherGeography or in the term dwc:locality, or both.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Third Order Division
 */
export const municipality: FieldDefinition = {
  id: "dwc-municipality",
  schemaId: "dwc",
  name: "municipality",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/municipality",
  label: "Third Order Division",
  definition:
    "The full, unabbreviated name of the next smaller administrative region than county (city, municipality, etc.) in which the dcterms:Location occurs. Do not use this term for a nearby named place that does not contain the actual dcterms:Location.",
  examples: ["Holzminden", "Araçatuba", "Ga-Segonyana"],
  comments:
    "Recommended best practice is to use a controlled vocabulary such as the Getty Thesaurus of Geographic Names. Recommended best practice is to leave this field blank if the dcterms:Location spans multiple entities at this administrative level or if the dcterms:Location might be in one or another of multiple possible entities at this level. Multiplicity and uncertainty of the geographic entity can be captured either in the term dwc:higherGeography or in the term dwc:locality, or both.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Locality
 */
export const locality: FieldDefinition = {
  id: "dwc-locality",
  schemaId: "dwc",
  name: "locality",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/locality",
  label: "Locality",
  definition: "The specific description of the place.",
  examples: [
    "Bariloche, 25 km NNE via Ruta Nacional 40 (=Ruta 237)",
    "Queets Rainforest, Olympic National Park",
  ],
  comments:
    "Less specific geographic information can be provided in other geographic terms (dwc:higherGeography, dwc:continent, dwc:country, dwc:stateProvince, dwc:county, dwc:municipality, dwc:waterBody, dwc:island, dwc:islandGroup). This term may contain information modified from the original to correct perceived errors or standardize the description.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Verbatim Locality
 */
export const verbatimLocality: FieldDefinition = {
  id: "dwc-verbatimLocality",
  schemaId: "dwc",
  name: "verbatimLocality",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/verbatimLocality",
  label: "Verbatim Locality",
  definition: "The original textual description of the place.",
  examples: ["25 km NNE Bariloche por R. Nac. 237"],

  createdAt: new Date("2021-07-15"),
  updatedAt: new Date("2021-07-15"),
};

/**
 * Minimum Elevation In Meters
 */
export const minimumElevationInMeters: FieldDefinition = {
  id: "dwc-minimumElevationInMeters",
  schemaId: "dwc",
  name: "minimumElevationInMeters",
  semanticType: "location",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/minimumElevationInMeters",
  label: "Minimum Elevation In Meters",
  definition:
    "The lower limit of the range of elevation (altitude, usually above sea level), in meters.",
  examples: ["-100", "802"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Maximum Elevation In Meters
 */
export const maximumElevationInMeters: FieldDefinition = {
  id: "dwc-maximumElevationInMeters",
  schemaId: "dwc",
  name: "maximumElevationInMeters",
  semanticType: "location",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/maximumElevationInMeters",
  label: "Maximum Elevation In Meters",
  definition:
    "The upper limit of the range of elevation (altitude, usually above sea level), in meters.",
  examples: ["-205", "1236"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Verbatim Elevation
 */
export const verbatimElevation: FieldDefinition = {
  id: "dwc-verbatimElevation",
  schemaId: "dwc",
  name: "verbatimElevation",
  semanticType: "location",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/verbatimElevation",
  label: "Verbatim Elevation",
  definition:
    "The original description of the elevation (altitude, usually above sea level) of the Location.",
  examples: ["100-200 m"],

  createdAt: new Date("2017-10-06"),
  updatedAt: new Date("2017-10-06"),
};

/**
 * Vertical Datum
 */
export const verticalDatum: FieldDefinition = {
  id: "dwc-verticalDatum",
  schemaId: "dwc",
  name: "verticalDatum",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/verticalDatum",
  label: "Vertical Datum",
  definition:
    "The vertical datum used as the reference upon which the values in the elevation terms are based.",
  examples: ["EGM84", "EGM96", "EGM2008"],
  comments:
    "Recommended best practice is to use a controlled vocabulary. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Minimum Depth In Meters
 */
export const minimumDepthInMeters: FieldDefinition = {
  id: "dwc-minimumDepthInMeters",
  schemaId: "dwc",
  name: "minimumDepthInMeters",
  semanticType: "location",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/minimumDepthInMeters",
  label: "Minimum Depth In Meters",
  definition: "The lesser depth of a range of depth below the local surface, in meters.",
  examples: ["0", "100"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Maximum Depth In Meters
 */
export const maximumDepthInMeters: FieldDefinition = {
  id: "dwc-maximumDepthInMeters",
  schemaId: "dwc",
  name: "maximumDepthInMeters",
  semanticType: "location",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/maximumDepthInMeters",
  label: "Maximum Depth In Meters",
  definition: "The greater depth of a range of depth below the local surface, in meters.",
  examples: ["0", "200"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Verbatim Depth
 */
export const verbatimDepth: FieldDefinition = {
  id: "dwc-verbatimDepth",
  schemaId: "dwc",
  name: "verbatimDepth",
  semanticType: "location",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/verbatimDepth",
  label: "Verbatim Depth",
  definition: "The original description of the depth below the local surface.",
  examples: ["100-200 m"],

  createdAt: new Date("2017-10-06"),
  updatedAt: new Date("2017-10-06"),
};

/**
 * Minimum Distance Above Surface In Meters
 */
export const minimumDistanceAboveSurfaceInMeters: FieldDefinition = {
  id: "dwc-minimumDistanceAboveSurfaceInMeters",
  schemaId: "dwc",
  name: "minimumDistanceAboveSurfaceInMeters",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/minimumDistanceAboveSurfaceInMeters",
  label: "Minimum Distance Above Surface In Meters",
  definition:
    "The lesser distance in a range of distance from a reference surface in the vertical direction, in meters. Use positive values for locations above the surface, negative values for locations below. If depth measures are given, the reference surface is the location given by the depth, otherwise the reference surface is the location given by the elevation.",
  examples: [
    "-1.5` (below the surface)",
    "4.2` (above the surface)",
    "For a 1.5 meter sediment core from the bottom of a lake (at depth 20m) at 300m elevation: verbatimElevation: `300m` minimumElevationInMeters: `300`, maximumElevationInMeters: `300`, verbatimDepth: `20m`, minimumDepthInMeters: `20`, maximumDepthInMeters: `20`, minimumDistanceAboveSurfaceInMeters: `0`, maximumDistanceAboveSurfaceInMeters: `-1.5`.",
  ],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Maximum Distance Above Surface In Meters
 */
export const maximumDistanceAboveSurfaceInMeters: FieldDefinition = {
  id: "dwc-maximumDistanceAboveSurfaceInMeters",
  schemaId: "dwc",
  name: "maximumDistanceAboveSurfaceInMeters",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/maximumDistanceAboveSurfaceInMeters",
  label: "Maximum Distance Above Surface In Meters",
  definition:
    "The greater distance in a range of distance from a reference surface in the vertical direction, in meters. Use positive values for locations above the surface, negative values for locations below. If depth measures are given, the reference surface is the location given by the depth, otherwise the reference surface is the location given by the elevation.",
  examples: [
    "-1.5` (below the surface)",
    "4.2` (above the surface)",
    "For a 1.5 meter sediment core from the bottom of a lake (at depth 20m) at 300m elevation: verbatimElevation: `300m` minimumElevationInMeters: `300`, maximumElevationInMeters: `300`, verbatimDepth: `20m`, minimumDepthInMeters: `20`, maximumDepthInMeters: `20`, minimumDistanceAboveSurfaceInMeters: `0`, maximumDistanceAboveSurfaceInMeters: `-1.5`.",
  ],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Location According To
 */
export const locationAccordingTo: FieldDefinition = {
  id: "dwc-locationAccordingTo",
  schemaId: "dwc",
  name: "locationAccordingTo",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/locationAccordingTo",
  label: "Location According To",
  definition:
    "Information about the source of this dcterms:Location information. Could be a publication (gazetteer), institution, or team of individuals.",
  examples: ["Getty Thesaurus of Geographic Names", "GADM"],
  comments:
    "This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Location Remarks
 */
export const locationRemarks: FieldDefinition = {
  id: "dwc-locationRemarks",
  schemaId: "dwc",
  name: "locationRemarks",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/locationRemarks",
  label: "Location Remarks",
  definition: "Comments or notes about the dcterms:Location.",
  examples: ["under water since 2005"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Decimal Latitude
 */
export const decimalLatitude: FieldDefinition = {
  id: "dwc-decimalLatitude",
  schemaId: "dwc",
  name: "decimalLatitude",
  semanticType: "location",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/decimalLatitude",
  label: "Decimal Latitude",
  definition:
    "The geographic latitude (in decimal degrees, using the spatial reference system given in dwc:geodeticDatum) of the geographic center of a dcterms:Location. Positive values are north of the Equator, negative values are south of it. Legal values lie between -90 and 90, inclusive.",
  examples: ["-41.0983423"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Decimal Longitude
 */
export const decimalLongitude: FieldDefinition = {
  id: "dwc-decimalLongitude",
  schemaId: "dwc",
  name: "decimalLongitude",
  semanticType: "location",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/decimalLongitude",
  label: "Decimal Longitude",
  definition:
    "The geographic longitude (in decimal degrees, using the spatial reference system given in dwc:geodeticDatum) of the geographic center of a dcterms:Location. Positive values are east of the Greenwich Meridian, negative values are west of it. Legal values lie between -180 and 180, inclusive.",
  examples: ["-121.1761111"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Geodetic Datum
 */
export const geodeticDatum: FieldDefinition = {
  id: "dwc-geodeticDatum",
  schemaId: "dwc",
  name: "geodeticDatum",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/geodeticDatum",
  label: "Geodetic Datum",
  definition:
    "The ellipsoid, geodetic datum, or spatial reference system (SRS) upon which the geographic coordinates given in dwc:decimalLatitude and dwc:decimalLongitude are based.",
  examples: ["EPSG:4326", "WGS84", "NAD27"],
  comments:
    "Recommended best practice is to use the EPSG code of the SRS, if known. Otherwise use a controlled vocabulary for the name or code of the geodetic datum, if known. Otherwise use a controlled vocabulary for the name or code of the ellipsoid, if known. If none of these is known, use the value `not recorded`. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for a string literal value.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Coordinate Uncertainty In Meters
 */
export const coordinateUncertaintyInMeters: FieldDefinition = {
  id: "dwc-coordinateUncertaintyInMeters",
  schemaId: "dwc",
  name: "coordinateUncertaintyInMeters",
  semanticType: "location",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/coordinateUncertaintyInMeters",
  label: "Coordinate Uncertainty In Meters",
  definition:
    "The horizontal distance (in meters) from the given dwc:decimalLatitude and dwc:decimalLongitude describing the smallest circle containing the whole of the dcterms:Location. Leave the value empty if the uncertainty is unknown, cannot be estimated, or is not applicable (because there are no coordinates). Zero is not a valid value for this term.",
  examples: [
    "30` (reasonable lower limit on or after 2000-05-01 of a GPS reading under good conditions if the actual precision was not recorded at the time)",
    "100` (reasonable lower limit before 2000-05-01 of a GPS reading under good conditions if the actual precision was not recorded at the time)",
    "71` (uncertainty for a UTM coordinate having 100 meter precision and a known spatial reference system)",
  ],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Coordinate Precision
 */
export const coordinatePrecision: FieldDefinition = {
  id: "dwc-coordinatePrecision",
  schemaId: "dwc",
  name: "coordinatePrecision",
  semanticType: "location",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/coordinatePrecision",
  label: "Coordinate Precision",
  definition:
    "A decimal representation of the precision of the coordinates given in the dwc:decimalLatitude and dwc:decimalLongitude.",
  examples: [
    "0.00001` (normal GPS limit for decimal degrees)",
    "0.000278` (nearest second)",
    "0.01667` (nearest minute)",
  ],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Point Radius Spatial Fit
 */
export const pointRadiusSpatialFit: FieldDefinition = {
  id: "dwc-pointRadiusSpatialFit",
  schemaId: "dwc",
  name: "pointRadiusSpatialFit",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/pointRadiusSpatialFit",
  label: "Point Radius Spatial Fit",
  definition:
    "The ratio of the area of the point-radius (dwc:decimalLatitude, dwc:decimalLongitude, dwc:coordinateUncertaintyInMeters) to the area of the true (original, or most specific) spatial representation of the dcterms:Location. Legal values are 0, greater than or equal to 1, or undefined. A value of 1 is an exact match or 100% overlap. A value of 0 should be used if the given point-radius does not completely contain the original representation. The dwc:pointRadiusSpatialFit is undefined (and should be left empty) if the original representation is any geometry without area (e.g., a point or polyline) and without uncertainty and the given georeference is not that same geometry (without uncertainty). If both the original and the given georeference are the same point, the dwc:pointRadiusSpatialFit is 1.",
  examples: ["0", "1", "1.5708"],
  comments:
    "Detailed explanations with graphical examples can be found in the Georeferencing Best Practices, Chapman and Wieczorek, 2020 (https://doi.org/10.15468/doc-gg7h-s853).",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Verbatim Coordinates
 */
export const verbatimCoordinates: FieldDefinition = {
  id: "dwc-verbatimCoordinates",
  schemaId: "dwc",
  name: "verbatimCoordinates",
  semanticType: "location",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/verbatimCoordinates",
  label: "Verbatim Coordinates",
  definition:
    "The verbatim original spatial coordinates of the dcterms:Location. The coordinate ellipsoid, geodeticDatum, or full Spatial Reference System (SRS) for these coordinates should be stored in dwc:verbatimSRS and the coordinate system should be stored in dwc:verbatimCoordinateSystem.",
  examples: ["41 05 54S 121 05 34W", "17T 630000 4833400"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Verbatim Latitude
 */
export const verbatimLatitude: FieldDefinition = {
  id: "dwc-verbatimLatitude",
  schemaId: "dwc",
  name: "verbatimLatitude",
  semanticType: "location",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/verbatimLatitude",
  label: "Verbatim Latitude",
  definition:
    "The verbatim original latitude of the dcterms:Location. The coordinate ellipsoid, geodeticDatum, or full Spatial Reference System (SRS) for these coordinates should be stored in dwc:verbatimSRS and the coordinate system should be stored in dwc:verbatimCoordinateSystem.",
  examples: ["41 05 54.03S"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Verbatim Longitude
 */
export const verbatimLongitude: FieldDefinition = {
  id: "dwc-verbatimLongitude",
  schemaId: "dwc",
  name: "verbatimLongitude",
  semanticType: "location",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/verbatimLongitude",
  label: "Verbatim Longitude",
  definition:
    "The verbatim original longitude of the dcterms:Location. The coordinate ellipsoid, geodeticDatum, or full Spatial Reference System (SRS) for these coordinates should be stored in dwc:verbatimSRS and the coordinate system should be stored in dwc:verbatimCoordinateSystem.",
  examples: ["121d 10' 34 W"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Verbatim Coordinate System
 */
export const verbatimCoordinateSystem: FieldDefinition = {
  id: "dwc-verbatimCoordinateSystem",
  schemaId: "dwc",
  name: "verbatimCoordinateSystem",
  semanticType: "location",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/verbatimCoordinateSystem",
  label: "Verbatim Coordinate System",
  definition:
    "The coordinate format for the dwc:verbatimLatitude and dwc:verbatimLongitude or the dwc:verbatimCoordinates of the dcterms:Location.",
  examples: ["decimal degrees", "degrees decimal minutes", "degrees minutes seconds"],
  comments:
    "Recommended best practice is to use a controlled vocabulary. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Verbatim SRS
 */
export const verbatimSRS: FieldDefinition = {
  id: "dwc-verbatimSRS",
  schemaId: "dwc",
  name: "verbatimSRS",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/verbatimSRS",
  label: "Verbatim SRS",
  definition:
    "The ellipsoid, geodetic datum, or spatial reference system (SRS) upon which coordinates given in dwc:verbatimLatitude and dwc:verbatimLongitude, or dwc:verbatimCoordinates are based.",
  examples: ["EPSG:4326", "WGS84", "NAD27"],
  comments:
    "Recommended best practice is to use the EPSG code of the SRS, if known. Otherwise use a controlled vocabulary for the name or code of the geodetic datum, if known. Otherwise use a controlled vocabulary for the name or code of the ellipsoid, if known. If none of these is known, use the value `not recorded`. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Footprint WKT
 */
export const footprintWKT: FieldDefinition = {
  id: "dwc-footprintWKT",
  schemaId: "dwc",
  name: "footprintWKT",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/footprintWKT",
  label: "Footprint WKT",
  definition:
    "A Well-Known Text (WKT) representation of the shape (footprint, geometry) that defines the dcterms:Location. A dcterms:Location may have both a point-radius representation (see dwc:decimalLatitude) and a footprint representation, and they may differ from each other.",
  examples: [
    "POLYGON ((10 20, 11 20, 11 21, 10 21, 10 20))` (the one-degree bounding box with opposite corners at longitude=10, latitude=20 and longitude=11, latitude=21)",
  ],
  comments:
    "This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Footprint SRS
 */
export const footprintSRS: FieldDefinition = {
  id: "dwc-footprintSRS",
  schemaId: "dwc",
  name: "footprintSRS",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/footprintSRS",
  label: "Footprint SRS",
  definition:
    "The ellipsoid, geodetic datum, or spatial reference system (SRS) upon which the geometry given in dwc:footprintWKT is based.",
  examples: [
    "EPSG:4326",
    "GEOGCS[GCS_WGS_1984, DATUM[D_WGS_1984, SPHEROID[WGS_1984,6378137,298.257223563]], PRIMEM[Greenwich,0], UNIT[Degree,0.0174532925199433]]` (WKT for the standard WGS84 Spatial Reference System EPSG:4326)",
    "not recorded",
  ],
  comments:
    "Recommended best practice is to use the EPSG code of the SRS, if known. Otherwise use a controlled vocabulary for the name or code of the geodetic datum, if known. Otherwise use a controlled vocabulary for the name or code of the ellipsoid, if known. If none of these is known, use the value `not recorded`. It is also permitted to provide the SRS in Well-Known-Text, especially if no EPSG code provides the necessary values for the attributes of the SRS. Do not use this term to describe the SRS of the dwc:decimalLatitude and dwc:decimalLongitude, nor of any verbatim coordinates - use the dwc:geodeticDatum and dwc:verbatimSRS instead. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Footprint Spatial Fit
 */
export const footprintSpatialFit: FieldDefinition = {
  id: "dwc-footprintSpatialFit",
  schemaId: "dwc",
  name: "footprintSpatialFit",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/footprintSpatialFit",
  label: "Footprint Spatial Fit",
  definition:
    "The ratio of the area of the dwc:footprintWKT to the area of the true (original, or most specific) spatial representation of the dcterms:Location. Legal values are 0, greater than or equal to 1, or undefined. A value of 1 is an exact match or 100% overlap. A value of 0 should be used if the given dwc:footprintWKT does not completely contain the original representation. The dwc:footprintSpatialFit is undefined (and should be left empty) if the original representation is any geometry without area (e.g., a point or polyline) and without uncertainty and the given georeference is not that same geometry (without uncertainty). If both the original and the given georeference are the same point, the dwc:footprintSpatialFit is 1.",
  examples: ["0", "1", "1.5708"],
  comments:
    "Detailed explanations with graphical examples can be found in the Georeferencing Best Practices, Chapman and Wieczorek, 2020 (https://doi.org/10.15468/doc-gg7h-s853).",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Georeferenced By
 */
export const georeferencedBy: FieldDefinition = {
  id: "dwc-georeferencedBy",
  schemaId: "dwc",
  name: "georeferencedBy",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/georeferencedBy",
  label: "Georeferenced By",
  definition:
    "A list (concatenated and separated) of names of people, groups, or organizations who determined the georeference (spatial representation) for the dcterms:Location.",
  examples: ["Brad Millen (ROM)", "Kristina Yamamoto | Janet Fang"],
  comments:
    "Recommended best practice is to separate the values in a list with space vertical bar space (` | `). This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Georeferenced Date
 */
export const georeferencedDate: FieldDefinition = {
  id: "dwc-georeferencedDate",
  schemaId: "dwc",
  name: "georeferencedDate",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/georeferencedDate",
  label: "Georeferenced Date",
  definition: "The date on which the dcterms:Location was georeferenced.",
  examples: [
    "1963-03-08T14:07-06:00` (8 Mar 1963 at or after 2:07pm and before 2:08pm in the time zone six hours earlier than UTC)",
    "2009-02-20T08:40Z` (20 February 2009 at or after 8:40am and before 8:41 UTC)",
    "2018-08-29T15:19` (29 August 2018 at or after 3:19pm and before 3:20pm local time)",
  ],
  comments: "Recommended best practice is to use a date that conforms to ISO 8601-1:2019.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Georeference Protocol
 */
export const georeferenceProtocol: FieldDefinition = {
  id: "dwc-georeferenceProtocol",
  schemaId: "dwc",
  name: "georeferenceProtocol",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/georeferenceProtocol",
  label: "Georeference Protocol",
  definition:
    "A description or reference to the methods used to determine the spatial footprint, coordinates, and uncertainties.",
  examples: [
    "Georeferencing Quick Reference Guide (Zermoglio et al. 2020, https://doi.org/10.35035/e09p-h128)",
  ],
  comments:
    "This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Georeference Sources
 */
export const georeferenceSources: FieldDefinition = {
  id: "dwc-georeferenceSources",
  schemaId: "dwc",
  name: "georeferenceSources",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/georeferenceSources",
  label: "Georeference Sources",
  definition:
    "A list (concatenated and separated) of maps, gazetteers, or other resources used to georeference the dcterms:Location, described specifically enough to allow anyone in the future to use the same resources.",
  examples: [
    "https://www.geonames.org/",
    "USGS 1:24000 Florence Montana Quad 1967 | Terrametrics 2008 on Google Earth",
    "GeoLocate",
  ],
  comments:
    "Recommended best practice is to separate the values in a list with space vertical bar space (` | `). This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Georeference Remarks
 */
export const georeferenceRemarks: FieldDefinition = {
  id: "dwc-georeferenceRemarks",
  schemaId: "dwc",
  name: "georeferenceRemarks",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/georeferenceRemarks",
  label: "Georeference Remarks",
  definition:
    "Comments or notes about the spatial description determination, explaining assumptions made in addition or opposition to the those formalized in the method referred to in dwc:georeferenceProtocol.",
  examples: ["Assumed distance by road (Hwy. 101)"],

  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Geological Context
 */
export const GeologicalContext: FieldDefinition = {
  id: "dwc-GeologicalContext",
  schemaId: "dwc",
  name: "GeologicalContext",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/GeologicalContext",
  label: "Geological Context",
  definition: "Geological information, such as stratigraphy, that qualifies a region or place.",
  examples: ["a lithostratigraphic layer"],

  createdAt: new Date("2023-09-18"),
  updatedAt: new Date("2023-09-18"),
};

/**
 * Geological Context ID
 */
export const geologicalContextID: FieldDefinition = {
  id: "dwc-geologicalContextID",
  schemaId: "dwc",
  name: "geologicalContextID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/geologicalContextID",
  label: "Geological Context ID",
  definition:
    "An identifier for the set of information associated with a dwc:GeologicalContext (the location within a geological context, such as stratigraphy). May be a global unique identifier or an identifier specific to the data set.",
  examples: ["https://opencontext.org/subjects/e54377f7-4452-4315-b676-40679b10c4d9"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Earliest Eon Or Lowest Eonothem
 */
export const earliestEonOrLowestEonothem: FieldDefinition = {
  id: "dwc-earliestEonOrLowestEonothem",
  schemaId: "dwc",
  name: "earliestEonOrLowestEonothem",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/earliestEonOrLowestEonothem",
  label: "Earliest Eon Or Lowest Eonothem",
  definition:
    "The full name of the earliest possible geochronologic eon or lowest chrono-stratigraphic eonothem or the informal name (Precambrian) attributable to the stratigraphic horizon from which the dwc:MaterialEntity was collected.",
  examples: ["Phanerozoic", "Proterozoic"],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Latest Eon Or Highest Eonothem
 */
export const latestEonOrHighestEonothem: FieldDefinition = {
  id: "dwc-latestEonOrHighestEonothem",
  schemaId: "dwc",
  name: "latestEonOrHighestEonothem",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/latestEonOrHighestEonothem",
  label: "Latest Eon Or Highest Eonothem",
  definition:
    "The full name of the latest possible geochronologic eon or highest chrono-stratigraphic eonothem or the informal name (Precambrian) attributable to the stratigraphic horizon from which the dwc:MaterialEntity was collected.",
  examples: ["Phanerozoic", "Proterozoic"],

  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Earliest Era Or Lowest Erathem
 */
export const earliestEraOrLowestErathem: FieldDefinition = {
  id: "dwc-earliestEraOrLowestErathem",
  schemaId: "dwc",
  name: "earliestEraOrLowestErathem",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/earliestEraOrLowestErathem",
  label: "Earliest Era Or Lowest Erathem",
  definition:
    "The full name of the earliest possible geochronologic era or lowest chronostratigraphic erathem attributable to the stratigraphic horizon from which the dwc:MaterialEntity was collected.",
  examples: ["Cenozoic", "Mesozoic"],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Latest Era Or Highest Erathem
 */
export const latestEraOrHighestErathem: FieldDefinition = {
  id: "dwc-latestEraOrHighestErathem",
  schemaId: "dwc",
  name: "latestEraOrHighestErathem",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/latestEraOrHighestErathem",
  label: "Latest Era Or Highest Erathem",
  definition:
    "The full name of the latest possible geochronologic era or highest chronostratigraphic erathem attributable to the stratigraphic horizon from which the dwc:MaterialEntity was collected.",
  examples: ["Cenozoic", "Mesozoic"],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Earliest Period Or Lowest System
 */
export const earliestPeriodOrLowestSystem: FieldDefinition = {
  id: "dwc-earliestPeriodOrLowestSystem",
  schemaId: "dwc",
  name: "earliestPeriodOrLowestSystem",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/earliestPeriodOrLowestSystem",
  label: "Earliest Period Or Lowest System",
  definition:
    "The full name of the earliest possible geochronologic period or lowest chronostratigraphic system attributable to the stratigraphic horizon from which the dwc:MaterialEntity was collected.",
  examples: ["Neogene", "Tertiary", "Quaternary"],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Latest Period Or Highest System
 */
export const latestPeriodOrHighestSystem: FieldDefinition = {
  id: "dwc-latestPeriodOrHighestSystem",
  schemaId: "dwc",
  name: "latestPeriodOrHighestSystem",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/latestPeriodOrHighestSystem",
  label: "Latest Period Or Highest System",
  definition:
    "The full name of the latest possible geochronologic period or highest chronostratigraphic system attributable to the stratigraphic horizon from which the dwc:MaterialEntity was collected.",
  examples: ["Neogene", "Tertiary", "Quaternary"],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Earliest Epoch Or Lowest Series
 */
export const earliestEpochOrLowestSeries: FieldDefinition = {
  id: "dwc-earliestEpochOrLowestSeries",
  schemaId: "dwc",
  name: "earliestEpochOrLowestSeries",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/earliestEpochOrLowestSeries",
  label: "Earliest Epoch Or Lowest Series",
  definition:
    "The full name of the earliest possible geochronologic epoch or lowest chronostratigraphic series attributable to the stratigraphic horizon from which the dwc:MaterialEntity was collected.",
  examples: ["Holocene", "Pleistocene", "Ibexian Series"],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Latest Epoch Or Highest Series
 */
export const latestEpochOrHighestSeries: FieldDefinition = {
  id: "dwc-latestEpochOrHighestSeries",
  schemaId: "dwc",
  name: "latestEpochOrHighestSeries",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/latestEpochOrHighestSeries",
  label: "Latest Epoch Or Highest Series",
  definition:
    "The full name of the latest possible geochronologic epoch or highest chronostratigraphic series attributable to the stratigraphic horizon from which the dwc:MaterialEntity was collected.",
  examples: ["Holocene", "Pleistocene", "Ibexian Series"],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Earliest Age Or Lowest Stage
 */
export const earliestAgeOrLowestStage: FieldDefinition = {
  id: "dwc-earliestAgeOrLowestStage",
  schemaId: "dwc",
  name: "earliestAgeOrLowestStage",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/earliestAgeOrLowestStage",
  label: "Earliest Age Or Lowest Stage",
  definition:
    "The full name of the earliest possible geochronologic age or lowest chronostratigraphic stage attributable to the stratigraphic horizon from which the dwc:MaterialEntity was collected.",
  examples: ["Atlantic", "Boreal", "Skullrockian"],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Latest Age Or Highest Stage
 */
export const latestAgeOrHighestStage: FieldDefinition = {
  id: "dwc-latestAgeOrHighestStage",
  schemaId: "dwc",
  name: "latestAgeOrHighestStage",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/latestAgeOrHighestStage",
  label: "Latest Age Or Highest Stage",
  definition:
    "The full name of the latest possible geochronologic age or highest chronostratigraphic stage attributable to the stratigraphic horizon from which the dwc:MaterialEntity was collected.",
  examples: ["Atlantic", "Boreal", "Skullrockian"],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Lowest Biostratigraphic Zone
 */
export const lowestBiostratigraphicZone: FieldDefinition = {
  id: "dwc-lowestBiostratigraphicZone",
  schemaId: "dwc",
  name: "lowestBiostratigraphicZone",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/lowestBiostratigraphicZone",
  label: "Lowest Biostratigraphic Zone",
  definition:
    "The full name of the lowest possible geological biostratigraphic zone of the stratigraphic horizon from which the dwc:MaterialEntity was collected.",
  examples: ["Maastrichtian"],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Highest Biostratigraphic Zone
 */
export const highestBiostratigraphicZone: FieldDefinition = {
  id: "dwc-highestBiostratigraphicZone",
  schemaId: "dwc",
  name: "highestBiostratigraphicZone",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/highestBiostratigraphicZone",
  label: "Highest Biostratigraphic Zone",
  definition:
    "The full name of the highest possible geological biostratigraphic zone of the stratigraphic horizon from which the dwc:MaterialEntity was collected.",
  examples: ["Blancan"],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Lithostratigraphic Terms
 */
export const lithostratigraphicTerms: FieldDefinition = {
  id: "dwc-lithostratigraphicTerms",
  schemaId: "dwc",
  name: "lithostratigraphicTerms",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/lithostratigraphicTerms",
  label: "Lithostratigraphic Terms",
  definition:
    "The combination of all lithostratigraphic names for the rock from which the dwc:MaterialEntity was collected.",
  examples: ["Pleistocene-Weichselien"],

  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Group
 */
export const group: FieldDefinition = {
  id: "dwc-group",
  schemaId: "dwc",
  name: "group",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/group",
  label: "Group",
  definition:
    "The full name of the lithostratigraphic group from which the dwc:MaterialEntity was collected.",
  examples: ["Bathurst", "Lower Wealden"],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Formation
 */
export const formation: FieldDefinition = {
  id: "dwc-formation",
  schemaId: "dwc",
  name: "formation",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/formation",
  label: "Formation",
  definition:
    "The full name of the lithostratigraphic formation from which the dwc:MaterialEntity was collected.",
  examples: ["Notch Peak Formation", "House Limestone", "Fillmore Formation"],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Member
 */
export const member: FieldDefinition = {
  id: "dwc-member",
  schemaId: "dwc",
  name: "member",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/member",
  label: "Member",
  definition:
    "The full name of the lithostratigraphic member from which the dwc:MaterialEntity was collected.",
  examples: ["Lava Dam Member", "Hellnmaria Member"],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Bed
 */
export const bed: FieldDefinition = {
  id: "dwc-bed",
  schemaId: "dwc",
  name: "bed",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/bed",
  label: "Bed",
  definition:
    "The full name of the lithostratigraphic bed from which the dwc:MaterialEntity was collected.",
  examples: ["Harlem coal"],

  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Identification
 */
export const Identification: FieldDefinition = {
  id: "dwc-Identification",
  schemaId: "dwc",
  name: "Identification",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/Identification",
  label: "Identification",
  definition: "A taxonomic determination (e.g., the assignment to a dwc:Taxon).",
  examples: ["a subspecies determination of an organism"],

  createdAt: new Date("2023-09-18"),
  updatedAt: new Date("2023-09-18"),
};

/**
 * Identification ID
 */
export const identificationID: FieldDefinition = {
  id: "dwc-identificationID",
  schemaId: "dwc",
  name: "identificationID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/identificationID",
  label: "Identification ID",
  definition:
    "An identifier for the dwc:Identification (the body of information associated with the assignment of a scientific name). May be a global unique identifier or an identifier specific to the data set.",
  examples: ["9992"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Verbatim Identification
 */
export const verbatimIdentification: FieldDefinition = {
  id: "dwc-verbatimIdentification",
  schemaId: "dwc",
  name: "verbatimIdentification",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/verbatimIdentification",
  label: "Verbatim Identification",
  definition:
    "A string representing the taxonomic identification as it appeared in the original record.",
  examples: ["Peromyscus sp.", "Ministrymon sp. nov. 1", "Anser anser × Branta canadensis"],
  comments:
    "This term is meant to allow the capture of an unaltered original identification/determination, including identification qualifiers, hybrid formulas, uncertainties, etc. This term is meant to be used in addition to dwc:scientificName (and dwc:identificationQualifier etc.), not instead of it.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Identification Qualifier
 */
export const identificationQualifier: FieldDefinition = {
  id: "dwc-identificationQualifier",
  schemaId: "dwc",
  name: "identificationQualifier",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/identificationQualifier",
  label: "Identification Qualifier",
  definition:
    "A brief phrase or a standard term (cf., aff.) to express the determiner's doubts about the dwc:Identification.",
  examples: [
    "aff. agrifolia var. oxyadenia` (for `Quercus aff. agrifolia var. oxyadenia` with accompanying values `Quercus` in genus, `agrifolia`  in specificEpithet, `oxyadenia`  in infraspecificEpithet, and `var.` in taxonRank)",
    "cf. var. oxyadenia` (for `Quercus agrifolia cf. var. oxyadenia` with accompanying values `Quercus` in genus, `agrifolia` in specificEpithet, `oxyadenia` in infraspecificEpithet, and `var.` in taxonRank)",
  ],
  comments:
    "This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Type Status
 */
export const typeStatus: FieldDefinition = {
  id: "dwc-typeStatus",
  schemaId: "dwc",
  name: "typeStatus",
  semanticType: "controlled-vocabulary",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/typeStatus",
  label: "Type Status",
  definition:
    "A list (concatenated and separated) of nomenclatural types (type status, typified scientific name, publication) applied to the subject.",
  examples: [
    "holotype of Ctenomys sociabilis. Pearson O. P., and M. I. Christie. 1985. Historia Natural, 5(37):388",
    "holotype of Pinus abies | holotype of Picea abies",
  ],
  comments:
    "Recommended best practice is to separate the values in a list with space vertical bar space (` | `). This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Typified Name
 */
export const typifiedName: FieldDefinition = {
  id: "dwc-typifiedName",
  schemaId: "dwc",
  name: "typifiedName",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/typifiedName",
  label: "Typified Name",
  definition: "A scientific name that is based on a type specimen.",
  examples: ["Polysiphonia amphibolis Womersley"],
  comments: "Recommended best practice is also to indicate the dwc:typeStatus of the specimen.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Identified By
 */
export const identifiedBy: FieldDefinition = {
  id: "dwc-identifiedBy",
  schemaId: "dwc",
  name: "identifiedBy",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/identifiedBy",
  label: "Identified By",
  definition:
    "A list (concatenated and separated) of names of people, groups, or organizations who assigned the dwc:Taxon to the subject.",
  examples: ["James L. Patton`| `Theodore Pappenfuss | Robert Macey"],
  comments:
    "When used in the context of an Event (such as in the Humboldt Extension), the subject consists of all of the dwc:Organisms related to the Event. Recommended best practice is to separate the values in a list with space vertical bar space ( | ). This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Identified By ID
 */
export const identifiedByID: FieldDefinition = {
  id: "dwc-identifiedByID",
  schemaId: "dwc",
  name: "identifiedByID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/identifiedByID",
  label: "Identified By ID",
  definition:
    "A list (concatenated and separated) of the globally unique identifier for the person, people, groups, or organizations responsible for assigning the dwc:Taxon to the subject.",
  examples: [
    "https://orcid.org/0000-0002-1825-0097` (for an individual)",
    "https://orcid.org/0000-0002-1825-0097 | https://orcid.org/0000-0002-1825-0098` (for a list of people)",
  ],
  comments:
    "Recommended best practice is to provide a single identifier that disambiguates the details of the identifying agent. If a list is used, the order of the identifiers on the list should not be assumed to convey any semantics. Recommended best practice is to separate the values in a list with space vertical bar space (` | `).",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Date Identified
 */
export const dateIdentified: FieldDefinition = {
  id: "dwc-dateIdentified",
  schemaId: "dwc",
  name: "dateIdentified",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/dateIdentified",
  label: "Date Identified",
  definition: "The date on which the subject was determined as representing the dwc:Taxon.",
  examples: [
    "1963-03-08T14:07-06:00` (8 Mar 1963 at or after 2:07pm and before 2:08pm in the time zone six hours earlier than UTC)",
    "2009-02-20T08:40Z` (20 February 2009 at or after 8:40am and before 8:41 UTC)",
    "2018-08-29T15:19` (29 August 2018 at or after 3:19pm and before 3:20pm local time)",
  ],
  comments: "Recommended best practice is to use a date that conforms to ISO 8601-1:2019.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Identification References
 */
export const identificationReferences: FieldDefinition = {
  id: "dwc-identificationReferences",
  schemaId: "dwc",
  name: "identificationReferences",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/identificationReferences",
  label: "Identification References",
  definition:
    "A list (concatenated and separated) of references (publication, global unique identifier, URI) used in the dwc:Identification.",
  examples: [
    "Aves del Noroeste Patagonico. Christie et al. 2004.",
    "Stebbins, R. Field Guide to Western Reptiles and Amphibians. 3rd Edition. 2003. | Irschick, D.J. and Shaffer, H.B. (1997). The polytypic species revisited: Morphological differentiation among tiger salamanders (Ambystoma tigrinum) (Amphibia: Caudata). Herpetologica, 53(1), 30-49.",
  ],
  comments:
    "When used in the context of an Event (such as in the Humboldt Extension), the subject consists of all of the dwc:Organisms related to the Event. Recommended best practice is to separate the values in a list with space vertical bar space ( | ).",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Identification Verification Status
 */
export const identificationVerificationStatus: FieldDefinition = {
  id: "dwc-identificationVerificationStatus",
  schemaId: "dwc",
  name: "identificationVerificationStatus",
  semanticType: "controlled-vocabulary",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/identificationVerificationStatus",
  label: "Identification Verification Status",
  definition:
    "A categorical indicator of the extent to which the taxonomic identification has been verified to be correct.",
  examples: ["0` (unverified in HISPID/ABCD)."],
  comments:
    "Recommended best practice is to use a controlled vocabulary such as that used in HISPID and ABCD. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Identification Remarks
 */
export const identificationRemarks: FieldDefinition = {
  id: "dwc-identificationRemarks",
  schemaId: "dwc",
  name: "identificationRemarks",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/identificationRemarks",
  label: "Identification Remarks",
  definition: "Comments or notes about the dwc:Identification.",
  examples: [
    "Distinguished between Anthus correndera and Anthus hellmayri based on the comparative lengths of the uñas.",
  ],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Taxon
 */
export const Taxon: FieldDefinition = {
  id: "dwc-Taxon",
  schemaId: "dwc",
  name: "Taxon",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/Taxon",
  label: "Taxon",
  definition:
    "A group of organisms (sensu http://purl.obolibrary.org/obo/OBI_0100026) considered by taxonomists to form a homogeneous unit.",
  examples: [
    "the genus Truncorotaloides as published by Brönnimann et al. in 1953 in the Journal of Paleontology Vol. 27(6) p. 817-820",
  ],

  createdAt: new Date("2023-09-18"),
  updatedAt: new Date("2023-09-18"),
};

/**
 * Taxon ID
 */
export const taxonID: FieldDefinition = {
  id: "dwc-taxonID",
  schemaId: "dwc",
  name: "taxonID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/taxonID",
  label: "Taxon ID",
  definition:
    "An identifier for the set of dwc:Taxon information. May be a global unique identifier or an identifier specific to the data set.",
  examples: ["8fa58e08-08de-4ac1-b69c-1235340b7001", "32567", "https://www.gbif.org/species/212"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Scientific Name ID
 */
export const scientificNameID: FieldDefinition = {
  id: "dwc-scientificNameID",
  schemaId: "dwc",
  name: "scientificNameID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/scientificNameID",
  label: "Scientific Name ID",
  definition: "An identifier for the nomenclatural (not taxonomic) details of a scientific name.",
  examples: ["urn:lsid:ipni.org:names:37829-1:1.3"],

  createdAt: new Date("2017-10-06"),
  updatedAt: new Date("2017-10-06"),
};

/**
 * Accepted Name Usage ID
 */
export const acceptedNameUsageID: FieldDefinition = {
  id: "dwc-acceptedNameUsageID",
  schemaId: "dwc",
  name: "acceptedNameUsageID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/acceptedNameUsageID",
  label: "Accepted Name Usage ID",
  definition:
    "An identifier for the name usage (documented meaning of the name according to a source) of the currently valid (zoological) or accepted (botanical) taxon.",
  examples: ["tsn:41107` (ITIS)", "urn:lsid:ipni.org:names:320035-2` (IPNI)", "2704179` (GBIF)"],
  comments:
    "This term should be used for synonyms or misapplied names to refer to the dwc:taxonID of a dwc:Taxon record that represents the accepted (botanical) or valid (zoological) name. For Darwin Core Archives the related record should be present locally in the same archive.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Parent Name Usage ID
 */
export const parentNameUsageID: FieldDefinition = {
  id: "dwc-parentNameUsageID",
  schemaId: "dwc",
  name: "parentNameUsageID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/parentNameUsageID",
  label: "Parent Name Usage ID",
  definition:
    "An identifier for the name usage (documented meaning of the name according to a source) of the direct, most proximate higher-rank parent taxon (in a classification) of the most specific element of the dwc:scientificName.",
  examples: ["tsn:41074` (ITIS)", "urn:lsid:ipni.org:names:30001404-2` (IPNI)", "2704173` (GBIF)"],
  comments:
    "This term should be used for accepted names to refer to the dwc:taxonID of a dwc:Taxon record that represents the next higher taxon rank in the same taxonomic classification. For Darwin Core Archives the related record should be present locally in the same archive.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Original Name Usage ID
 */
export const originalNameUsageID: FieldDefinition = {
  id: "dwc-originalNameUsageID",
  schemaId: "dwc",
  name: "originalNameUsageID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/originalNameUsageID",
  label: "Original Name Usage ID",
  definition:
    "An identifier for the name usage (documented meaning of the name according to a source) in which the terminal element of the dwc:scientificName was originally established under the rules of the associated dwc:nomenclaturalCode.",
  examples: ["tsn:41107` (ITIS)", "urn:lsid:ipni.org:names:320035-2` (IPNI)", "2704179` (GBIF)"],
  comments:
    "This term should be used to refer to the dwc:taxonID of a dwc:Taxon record that represents the usage of the terminal element of the dwc:scientificName as originally established under the rules of the associated dwc:nomenclaturalCode. For example, for names governed by the ICNafp, this term would establish the relationship between a record representing a subsequent combination and the record for its corresponding basionym. Unlike basionyms, however, this term can apply to scientific names at all ranks. For Darwin Core Archives the related record should be present locally in the same archive.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Name According To ID
 */
export const nameAccordingToID: FieldDefinition = {
  id: "dwc-nameAccordingToID",
  schemaId: "dwc",
  name: "nameAccordingToID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/nameAccordingToID",
  label: "Name According To ID",
  definition:
    "An identifier for the source in which the specific taxon concept circumscription is defined or implied. See dwc:nameAccordingTo.",
  examples: ["https://doi.org/10.1016/S0269-915X(97)80026-2"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Name Published In ID
 */
export const namePublishedInID: FieldDefinition = {
  id: "dwc-namePublishedInID",
  schemaId: "dwc",
  name: "namePublishedInID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/namePublishedInID",
  label: "Name Published In ID",
  definition:
    "An identifier for the publication in which the dwc:scientificName was originally established under the rules of the associated dwc:nomenclaturalCode.",

  comments:
    "A citation of the first publication of the name in its given combination, not the basionym / original name. Recombinations are often not published in zoology, in which case dwc:namePublishedInID should be empty.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Taxon Concept ID
 */
export const taxonConceptID: FieldDefinition = {
  id: "dwc-taxonConceptID",
  schemaId: "dwc",
  name: "taxonConceptID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/taxonConceptID",
  label: "Taxon Concept ID",
  definition:
    "An identifier for the taxonomic concept to which the record refers - not for the nomenclatural details of a dwc:Taxon.",
  examples: ["8fa58e08-08de-4ac1-b69c-1235340b7001"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Scientific Name
 */
export const scientificName: FieldDefinition = {
  id: "dwc-scientificName",
  schemaId: "dwc",
  name: "scientificName",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/scientificName",
  label: "Scientific Name",
  definition:
    "The full scientific name, with authorship and date information if known. When forming part of a dwc:Identification, this should be the name in lowest level taxonomic rank that can be determined. This term should not contain identification qualifications, which should instead be supplied in the dwc:identificationQualifier term.",
  examples: ["Coleoptera` (order)", "Vespertilionidae` (family)", "Manis` (genus)"],
  comments:
    "This term should not contain identification qualifications, which should instead be supplied in the IdentificationQualifier term. When applied to an Organism or Occurrence, this term should be used to represent the scientific name that was applied to the associated Organism in accordance with the Taxon to which it was or is currently identified. Names should be compliant to the most recent nomenclatural code. For example, names of hybrids for algae, fungi and plants should follow the rules of the International Code of Nomenclature for algae, fungi, and plants (Schenzhen Code Articles H.1, H.2 and H.3). Thus, use the multiplication sign `×` (Unicode `U+00D7`, HTML `&times;`) to identify a hybrid, not `x` or `X`, if possible.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Accepted Name Usage
 */
export const acceptedNameUsage: FieldDefinition = {
  id: "dwc-acceptedNameUsage",
  schemaId: "dwc",
  name: "acceptedNameUsage",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/acceptedNameUsage",
  label: "Accepted Name Usage",
  definition:
    "The full name, with authorship and date information if known, of the currently valid (zoological) or accepted (botanical) dwc:Taxon.",
  examples: ["Tamias minimus` (valid name for `Eutamias minimus`)"],
  comments:
    "The full scientific name, with authorship and date information if known, of the accepted (botanical) or valid (zoological) name in cases where the provided dwc:scientificName is considered by the reference indicated in the dwc:nameAccordingTo property, or of the content provider, to be a synonym or misapplied name. When applied to a dwc:Organism or dwc:Occurrence, this term should be used in cases where a content provider regards the provided dwc:scientificName to be inconsistent with the taxonomic perspective of the content provider. For example, there are many discrepancies within specimen collections and observation datasets between the recorded name (e.g., the most recent identification from an expert who examined a specimen, or a field identification for an observed dwc:Organism), and the name asserted by the content provider to be taxonomically accepted.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Parent Name Usage
 */
export const parentNameUsage: FieldDefinition = {
  id: "dwc-parentNameUsage",
  schemaId: "dwc",
  name: "parentNameUsage",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/parentNameUsage",
  label: "Parent Name Usage",
  definition:
    "The full name, with authorship and date information if known, of the direct, most proximate higher-rank parent dwc:Taxon (in a classification) of the most specific element of the dwc:scientificName.",
  examples: ["Rubiaceae", "Gruiformes", "Testudinae"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Original Name Usage
 */
export const originalNameUsage: FieldDefinition = {
  id: "dwc-originalNameUsage",
  schemaId: "dwc",
  name: "originalNameUsage",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/originalNameUsage",
  label: "Original Name Usage",
  definition:
    "The taxon name, with authorship and date information if known, as it originally appeared when first established under the rules of the associated dwc:nomenclaturalCode. The basionym (botany) or basonym (bacteriology) of the dwc:scientificName or the senior/earlier homonym for replaced names.",
  examples: ["Pinus abies", "Gasterosteus saltatrix Linnaeus 1768"],
  comments:
    "The full scientific name, with authorship and date information if known, of the name usage in which the terminal element of the dwc:scientificName was originally established under the rules of the associated dwc:nomenclaturalCode. For example, for names governed by the ICNafp, this term would indicate the basionym of a record representing a subsequent combination. Unlike basionyms, however, this term can apply to scientific names at all ranks.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Name According To
 */
export const nameAccordingTo: FieldDefinition = {
  id: "dwc-nameAccordingTo",
  schemaId: "dwc",
  name: "nameAccordingTo",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/nameAccordingTo",
  label: "Name According To",
  definition:
    "The reference to the source in which the specific taxon concept circumscription is defined or implied - traditionally signified by the Latin sensu or sec. (from secundum, meaning according to). For taxa that result from identifications, a reference to the keys, monographs, experts and other sources should be given.",
  examples: [
    "Franz NM, Cardona-Duque J (2013) Description of two new species and phylogenetic reassessment of Perelleschus Wibmer & O’Brien, 1986 (Coleoptera: Curculionidae), with a complete taxonomic concept history of Perelleschus sec. Franz & Cardona-Duque, 2013. Syst Biodivers. 11: 209–236.` (as the full citation of the Franz & Cardona-Duque (2013) in Perelleschus splendida sec. Franz & Cardona-Duque (2013))",
  ],
  comments:
    "This term provides context to the dwc:scientificName. Together with the dwc:scientificName, separated by `sensu` or `sec.`, it forms the taxon concept label, which may be seen as having the same relationship to dwc:taxonConceptID as, for example, dwc:acceptedNameUsage has to dwc:acceptedNameUsageID. When not provided, in Taxon Core data sets the dwc:nameAccordingTo can be taken to be the data set. In this case the data set mostly provides sufficient context to infer the delimitation of the taxon and its relationship with other taxa. In Occurrence Core data sets, when not provided, dwc:nameAccordingTo can be an underlying taxonomy of the data set, e.g. Plants of the World Online (http://powo.science.kew.org/) for vascular plant records in iNaturalist (in which case it should be provided), or, which is the case for most dwc:PreservedSpecimen data sets, the dwc:Identification, in which case there is no further context.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Name Published In
 */
export const namePublishedIn: FieldDefinition = {
  id: "dwc-namePublishedIn",
  schemaId: "dwc",
  name: "namePublishedIn",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/namePublishedIn",
  label: "Name Published In",
  definition:
    "A reference for the publication in which the dwc:scientificName was originally established under the rules of the associated dwc:nomenclaturalCode.",
  examples: [
    "Pearson O. P., and M. I. Christie. 1985. Historia Natural, 5(37):388",
    "Forel, Auguste, Diagnosies provisoires de quelques espèces nouvelles de fourmis de Madagascar, récoltées par M. Grandidier., Annales de la Societe Entomologique de Belgique, Comptes-rendus des Seances 30, 1886",
  ],
  comments:
    "A citation of the first publication of the name in its given combination, not the basionym / original name. Recombinations are often not published in zoology, in which case dwc:namePublishedIn should be empty.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Name Published In Year
 */
export const namePublishedInYear: FieldDefinition = {
  id: "dwc-namePublishedInYear",
  schemaId: "dwc",
  name: "namePublishedInYear",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/namePublishedInYear",
  label: "Name Published In Year",
  definition: "The four-digit year in which the dwc:scientificName was published.",
  examples: ["1915", "2008"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Higher Classification
 */
export const higherClassification: FieldDefinition = {
  id: "dwc-higherClassification",
  schemaId: "dwc",
  name: "higherClassification",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/higherClassification",
  label: "Higher Classification",
  definition:
    "A list (concatenated and separated) of taxa names terminating at the rank immediately superior to the referenced dwc:Taxon.",
  examples: [
    "Plantae | Tracheophyta | Magnoliopsida | Ranunculales | Ranunculaceae | Ranunculus",
    "Animalia",
    "Animalia | Chordata | Vertebrata | Mammalia | Theria | Eutheria | Rodentia | Hystricognatha | Hystricognathi | Ctenomyidae | Ctenomyini | Ctenomys",
  ],
  comments:
    "Recommended best practice is to separate the values in a list with space vertical bar space (` | `), with terms in order from the highest taxonomic rank to the lowest.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Kingdom
 */
export const kingdom: FieldDefinition = {
  id: "dwc-kingdom",
  schemaId: "dwc",
  name: "kingdom",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/kingdom",
  label: "Kingdom",
  definition: "The full scientific name of the kingdom in which the dwc:Taxon is classified.",
  examples: ["Animalia", "Archaea", "Bacteria"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Phylum
 */
export const phylum: FieldDefinition = {
  id: "dwc-phylum",
  schemaId: "dwc",
  name: "phylum",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/phylum",
  label: "Phylum",
  definition:
    "The full scientific name of the phylum or division in which the dwc:Taxon is classified.",
  examples: ["Chordata` (phylum)", "Bryophyta` (division)"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Class
 */
export const taxonClass: FieldDefinition = {
  id: "dwc-class",
  schemaId: "dwc",
  name: "class",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/class",
  label: "Class",
  definition: "The full scientific name of the class in which the dwc:Taxon is classified.",
  examples: ["Mammalia", "Hepaticopsida"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Order
 */
export const order: FieldDefinition = {
  id: "dwc-order",
  schemaId: "dwc",
  name: "order",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/order",
  label: "Order",
  definition: "The full scientific name of the order in which the dwc:Taxon is classified.",
  examples: ["Carnivora", "Monocleales"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Superfamily
 */
export const superfamily: FieldDefinition = {
  id: "dwc-superfamily",
  schemaId: "dwc",
  name: "superfamily",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/superfamily",
  label: "Superfamily",
  definition: "The full scientific name of the superfamily in which the dwc:Taxon is classified.",
  examples: ["Achatinoidea", "Cerithioidea", "Helicoidea"],
  comments:
    "A taxonomic category subordinate to an order and superior to a family. According to ICZN article 29.2, the suffix `-oidea` is used for a superfamily name.",
  createdAt: new Date("2023-07-07"),
  updatedAt: new Date("2023-07-07"),
};

/**
 * Family
 */
export const family: FieldDefinition = {
  id: "dwc-family",
  schemaId: "dwc",
  name: "family",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/family",
  label: "Family",
  definition: "The full scientific name of the family in which the dwc:Taxon is classified.",
  examples: ["Felidae", "Monocleaceae"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Subfamily
 */
export const subfamily: FieldDefinition = {
  id: "dwc-subfamily",
  schemaId: "dwc",
  name: "subfamily",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/subfamily",
  label: "Subfamily",
  definition: "The full scientific name of the subfamily in which the dwc:Taxon is classified.",
  examples: ["Periptyctinae", "Orchidoideae", "Sphindociinae"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Tribe
 */
export const tribe: FieldDefinition = {
  id: "dwc-tribe",
  schemaId: "dwc",
  name: "tribe",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/tribe",
  label: "Tribe",
  definition: "The full scientific name of the tribe in which the dwc:Taxon is classified.",
  examples: ["Ortaliini", "Arethuseae"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Subtribe
 */
export const subtribe: FieldDefinition = {
  id: "dwc-subtribe",
  schemaId: "dwc",
  name: "subtribe",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/subtribe",
  label: "Subtribe",
  definition: "The full scientific name of the subtribe in which the dwc:Taxon is classified.",
  examples: ["Plotinini", "Typhaeini"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Genus
 */
export const genus: FieldDefinition = {
  id: "dwc-genus",
  schemaId: "dwc",
  name: "genus",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/genus",
  label: "Genus",
  definition: "The full scientific name of the genus in which the dwc:Taxon is classified.",
  examples: ["Puma", "Monoclea"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Generic Name
 */
export const genericName: FieldDefinition = {
  id: "dwc-genericName",
  schemaId: "dwc",
  name: "genericName",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/genericName",
  label: "Generic Name",
  definition: "The genus part of the dwc:scientificName without authorship.",
  examples: [
    "Felis` (for scientificName `Felis concolor`, with accompanying values of `Puma concolor` in acceptedNameUsage and `Puma` in genus)",
  ],
  comments:
    "For synonyms the accepted genus and the genus part of the name may be different. The term dwc:genericName should be used together with dwc:specificEpithet to form a binomial and with dwc:infraspecificEpithet to form a trinomial. The term dwc:genericName should only be used for combinations. Uninomials of generic rank do not have a dwc:genericName.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Subgenus
 */
export const subgenus: FieldDefinition = {
  id: "dwc-subgenus",
  schemaId: "dwc",
  name: "subgenus",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/subgenus",
  label: "Subgenus",
  definition: "The full scientific name of the subgenus in which the dwc:Taxon is classified.",
  examples: ["Abacetus (Parastygis)", "Dicranum subgen. Orthodicranum"],
  comments:
    "A value for this term should be a complete subgenus name as required by the appropriate nomenclatural code.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Infrageneric Epithet
 */
export const infragenericEpithet: FieldDefinition = {
  id: "dwc-infragenericEpithet",
  schemaId: "dwc",
  name: "infragenericEpithet",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/infragenericEpithet",
  label: "Infrageneric Epithet",
  definition: "The infrageneric part of a binomial name at ranks above species but below genus.",
  examples: [
    "Abacetillus` (for scientificName `Abacetus (Abacetillus) ambiguus`)",
    "Cracca` (for scientificName `Vicia sect. Cracca`)",
  ],
  comments:
    "The term dwc:infragenericEpithet should be used in conjunction with dwc:genericName, dwc:specificEpithet, dwc:infraspecificEpithet, dwc:taxonRank and dwc:scientificNameAuthorship to represent the individual elements of the complete dwc:scientificName. It can be used to indicate the subgenus placement of a species, which in zoology is often given in parentheses. Can also be used to share infrageneric names such as botanical sections (e.g., `Vicia sect. Cracca`).",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Specific Epithet
 */
export const specificEpithet: FieldDefinition = {
  id: "dwc-specificEpithet",
  schemaId: "dwc",
  name: "specificEpithet",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/specificEpithet",
  label: "Specific Epithet",
  definition: "The name of the first or species epithet of the dwc:scientificName.",
  examples: ["concolor", "gottschei"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Infraspecific Epithet
 */
export const infraspecificEpithet: FieldDefinition = {
  id: "dwc-infraspecificEpithet",
  schemaId: "dwc",
  name: "infraspecificEpithet",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/infraspecificEpithet",
  label: "Infraspecific Epithet",
  definition:
    "The name of the lowest or terminal infraspecific epithet of the dwc:scientificName, excluding any rank designation.",
  examples: [
    "concolor` (for scientificName `Puma concolor concolor (Linnaeus, 1771)`)",
    "oxyadenia` (for scientificName `Quercus agrifolia var. oxyadenia (Torr.) J.T. Howell`)",
    "laxa` (for scientificName `Cheilanthes hirta f. laxa (Kunze) W.Jacobsen & N.Jacobsen`)",
  ],
  comments:
    "In botany, name strings in literature and identifications may have multiple infraspecific ranks. According to the International Code of Nomenclature for algae, fungi, and plants (Schenzhen Code Articles 6.7 & Art. 24.1), valid names only have two epithets, with the lowest rank being the dwc:infraspecificEpithet. For example: the dwc:infraspecificEpithet in the string `Indigofera charlieriana subsp. sessilis var. scaberrima` is `scaberrima` and the dwc:scientificName is `Indigofera charlieriana var. scaberrima (Schinz) J.B.Gillett`. Use dwc:verbatimIdentification for the full name string used in a dwc:Identification.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Cultivar Epithet
 */
export const cultivarEpithet: FieldDefinition = {
  id: "dwc-cultivarEpithet",
  schemaId: "dwc",
  name: "cultivarEpithet",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/cultivarEpithet",
  label: "Cultivar Epithet",
  definition:
    "Part of the name of a cultivar, cultivar group or grex that follows the dwc:scientificName.",
  examples: [
    "King Edward` (for scientificName `Solanum tuberosum 'King Edward'` and taxonRank `cultivar`)",
    "Mishmiense` (for scientificName `Rhododendron boothii Mishmiense Group` and taxonRank `cultivar group`)",
    "Atlantis` (for scientificName `Paphiopedilum Atlantis grex` and taxonRank `grex`)",
  ],
  comments:
    "According to the Rules of the Cultivated Plant Code, a cultivar name consists of a botanical name followed by a cultivar epithet. The value given as the dwc:cultivarEpithet should exclude any quotes. The term dwc:taxonRank should be used to indicate which type of cultivated plant name (e.g. cultivar, cultivar group, grex) is concerned. This epithet, including any enclosing apostrophes or suffix, should be provided in dwc:scientificName as well.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Taxon Rank
 */
export const taxonRank: FieldDefinition = {
  id: "dwc-taxonRank",
  schemaId: "dwc",
  name: "taxonRank",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/taxonRank",
  label: "Taxon Rank",
  definition: "The taxonomic rank of the most specific name in the dwc:scientificName.",
  examples: ["subspecies", "varietas", "forma"],
  comments:
    "Recommended best practice is to use a controlled vocabulary. The taxon ranks of algae, fungi and plants are defined in the International Code of Nomenclature for algae, fungi, and plants (Schenzhen Code Articles H3.2, H4.4 and H.3.1).",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Verbatim Taxon Rank
 */
export const verbatimTaxonRank: FieldDefinition = {
  id: "dwc-verbatimTaxonRank",
  schemaId: "dwc",
  name: "verbatimTaxonRank",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/verbatimTaxonRank",
  label: "Verbatim Taxon Rank",
  definition:
    "The taxonomic rank of the most specific name in the dwc:scientificName as it appears in the original record.",
  examples: ["Agamospecies", "sub-lesus", "prole"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Scientific Name Authorship
 */
export const scientificNameAuthorship: FieldDefinition = {
  id: "dwc-scientificNameAuthorship",
  schemaId: "dwc",
  name: "scientificNameAuthorship",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/scientificNameAuthorship",
  label: "Scientific Name Authorship",
  definition:
    "The authorship information for the dwc:scientificName formatted according to the conventions of the applicable dwc:nomenclaturalCode.",
  examples: ["(Torr.) J.T. Howell", "(Martinovský) Tzvelev", "(Györfi, 1952)"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Vernacular Name
 */
export const vernacularName: FieldDefinition = {
  id: "dwc-vernacularName",
  schemaId: "dwc",
  name: "vernacularName",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/vernacularName",
  label: "Vernacular Name",
  definition: "A common or vernacular name.",
  examples: ["Andean Condor", "Condor Andino", "American Eagle"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Nomenclatural Code
 */
export const nomenclaturalCode: FieldDefinition = {
  id: "dwc-nomenclaturalCode",
  schemaId: "dwc",
  name: "nomenclaturalCode",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/nomenclaturalCode",
  label: "Nomenclatural Code",
  definition:
    "The nomenclatural code (or codes in the case of an ambiregnal name) under which the dwc:scientificName is constructed.",
  examples: ["ICN", "ICZN", "BC"],
  comments: "Recommended best practice is to use a controlled vocabulary.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Taxonomic Status
 */
export const taxonomicStatus: FieldDefinition = {
  id: "dwc-taxonomicStatus",
  schemaId: "dwc",
  name: "taxonomicStatus",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/taxonomicStatus",
  label: "Taxonomic Status",
  definition:
    "The status of the use of the dwc:scientificName as a label for a taxon. Requires taxonomic opinion to define the scope of a dwc:Taxon. Rules of priority then are used to define the taxonomic status of the nomenclature contained in that scope, combined with the experts opinion. It must be linked to a specific taxonomic reference that defines the concept.",
  examples: ["invalid", "misapplied", "homotypic synonym"],
  comments: "Recommended best practice is to use a controlled vocabulary.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Nomenclatural Status
 */
export const nomenclaturalStatus: FieldDefinition = {
  id: "dwc-nomenclaturalStatus",
  schemaId: "dwc",
  name: "nomenclaturalStatus",
  semanticType: "controlled-vocabulary",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/nomenclaturalStatus",
  label: "Nomenclatural Status",
  definition:
    "The status related to the original publication of the name and its conformance to the relevant rules of nomenclature. It is based essentially on an algorithm according to the business rules of the code. It requires no taxonomic opinion.",
  examples: ["nom. ambig.", "nom. illeg.", "nom. subnud."],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Taxon Remarks
 */
export const taxonRemarks: FieldDefinition = {
  id: "dwc-taxonRemarks",
  schemaId: "dwc",
  name: "taxonRemarks",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/taxonRemarks",
  label: "Taxon Remarks",
  definition: "Comments or notes about the taxon or name.",
  examples: ["this name is a misspelling in common use"],

  createdAt: new Date("2017-10-06"),
  updatedAt: new Date("2017-10-06"),
};

/**
 * Measurement Or Fact
 */
export const MeasurementOrFact: FieldDefinition = {
  id: "dwc-MeasurementOrFact",
  schemaId: "dwc",
  name: "MeasurementOrFact",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/MeasurementOrFact",
  label: "Measurement Or Fact",
  definition:
    "A measurement of or fact about an rdfs:Resource (http://www.w3.org/2000/01/rdf-schema#Resource).",
  examples: [
    "the weight of a dwc:Organism in grams",
    "the number of placental scars",
    "surface water temperature in Celsius",
  ],
  comments:
    "Resources can be thought of as identifiable records or instances of classes and may include, but need not be limited to instances of dwc:Occurrence, dwc:Organism, dwc:MaterialEntity, dwc:Event, dcterms:Location, dwc:GeologicalContext, dwc:Identification, or dwc:Taxon.",
  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Measurement ID
 */
export const measurementID: FieldDefinition = {
  id: "dwc-measurementID",
  schemaId: "dwc",
  name: "measurementID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/measurementID",
  label: "Measurement ID",
  definition:
    "An identifier for the dwc:MeasurementOrFact (information pertaining to measurements, facts, characteristics, or assertions). May be a global unique identifier or an identifier specific to the data set.",
  examples: ["9c752d22-b09a-11e8-96f8-529269fb1459"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Parent Measurement ID
 */
export const parentMeasurementID: FieldDefinition = {
  id: "dwc-parentMeasurementID",
  schemaId: "dwc",
  name: "parentMeasurementID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/parentMeasurementID",
  label: "Parent Measurement ID",
  definition:
    "An identifier for a broader dwc:MeasurementOrFact that groups this and potentially other dwc:MeasurementOrFacts.",
  examples: ["9c752d22-b09a-11e8-96f8-529269fb1459", "E1_E1_O1_M1"],
  comments: "May be a globally unique identifier or an identifier specific to the data set.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Measurement Type
 */
export const measurementType: FieldDefinition = {
  id: "dwc-measurementType",
  schemaId: "dwc",
  name: "measurementType",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/measurementType",
  label: "Measurement Type",
  definition: "The nature of the measurement, fact, characteristic, or assertion.",
  examples: ["tail length", "temperature", "trap line length"],
  comments:
    "Recommended best practice is to use a controlled vocabulary. This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Verbatim Measurement Type
 */
export const verbatimMeasurementType: FieldDefinition = {
  id: "dwc-verbatimMeasurementType",
  schemaId: "dwc",
  name: "verbatimMeasurementType",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/verbatimMeasurementType",
  label: "Verbatim Measurement Type",
  definition:
    "A string representing the type of measurement or fact as it appeared in the original record.",
  examples: ["water_temp", "Fish biomass", "sampling net mesh size"],
  comments:
    "This term is meant to allow the capture of an unaltered original name for a measurement or fact type. This term is meant to be used in addition to dwc:measurementType, not instead of it.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Measurement Value
 */
export const measurementValue: FieldDefinition = {
  id: "dwc-measurementValue",
  schemaId: "dwc",
  name: "measurementValue",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/measurementValue",
  label: "Measurement Value",
  definition: "The value of the measurement, fact, characteristic, or assertion.",
  examples: ["45", "20", "1"],
  comments:
    "This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Measurement Accuracy
 */
export const measurementAccuracy: FieldDefinition = {
  id: "dwc-measurementAccuracy",
  schemaId: "dwc",
  name: "measurementAccuracy",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/measurementAccuracy",
  label: "Measurement Accuracy",
  definition: "The description of the potential error associated with the dwc:measurementValue.",
  examples: ["0.01", "normal distribution with variation of 2 m"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Measurement Unit
 */
export const measurementUnit: FieldDefinition = {
  id: "dwc-measurementUnit",
  schemaId: "dwc",
  name: "measurementUnit",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/measurementUnit",
  label: "Measurement Unit",
  definition: "The units associated with the dwc:measurementValue.",
  examples: ["m", "g", "l"],
  comments:
    "Recommended best practice is to use the International System of Units (SI). This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Measurement Determined By
 */
export const measurementDeterminedBy: FieldDefinition = {
  id: "dwc-measurementDeterminedBy",
  schemaId: "dwc",
  name: "measurementDeterminedBy",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/measurementDeterminedBy",
  label: "Measurement Determined By",
  definition:
    "A list (concatenated and separated) of names of people, groups, or organizations who determined the value of the dwc:MeasurementOrFact.",
  examples: ["Rob Guralnick", "Peter Desmet | Stijn Van Hoey"],
  comments:
    "Recommended best practice is to separate the values in a list with space vertical bar space (` | `). This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Measurement Determined Date
 */
export const measurementDeterminedDate: FieldDefinition = {
  id: "dwc-measurementDeterminedDate",
  schemaId: "dwc",
  name: "measurementDeterminedDate",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/measurementDeterminedDate",
  label: "Measurement Determined Date",
  definition: "The date on which the dwc:MeasurementOrFact was made.",
  examples: [
    "1963-03-08T14:07-06:00` (8 Mar 1963 at or after 2:07pm and before 2:08pm in the time zone six hours earlier than UTC)",
    "2009-02-20T08:40Z` (20 February 2009 at or after 8:40am and before 8:41 UTC)",
    "2018-08-29T15:19` (29 August 2018 at or after 3:19pm and before 3:20pm local time)",
  ],
  comments: "Recommended best practice is to use a date that conforms to ISO 8601-1:2019.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Measurement Method
 */
export const measurementMethod: FieldDefinition = {
  id: "dwc-measurementMethod",
  schemaId: "dwc",
  name: "measurementMethod",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/measurementMethod",
  label: "Measurement Method",
  definition:
    "A description of or reference to (publication, URI) the method or protocol used to determine the measurement, fact, characteristic, or assertion.",
  examples: [
    "minimum convex polygon around burrow entrances` (for a home range area)",
    "barometric altimeter` (for an elevation)",
  ],
  comments:
    "This term has an equivalent in the dwciri: namespace that allows only an IRI as a value, whereas this term allows for any string literal value.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Measurement Remarks
 */
export const measurementRemarks: FieldDefinition = {
  id: "dwc-measurementRemarks",
  schemaId: "dwc",
  name: "measurementRemarks",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/measurementRemarks",
  label: "Measurement Remarks",
  definition: "Comments or notes accompanying the dwc:MeasurementOrFact.",
  examples: ["tip of tail missing"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Resource Relationship
 */
export const ResourceRelationship: FieldDefinition = {
  id: "dwc-ResourceRelationship",
  schemaId: "dwc",
  name: "ResourceRelationship",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/ResourceRelationship",
  label: "Resource Relationship",
  definition:
    "A relationship of one rdfs:Resource (http://www.w3.org/2000/01/rdf-schema#Resource) to another.",
  examples: [
    "an instance of a dwc:Organism is the mother of another instance of a dwc:Organism",
    "a uniquely identified dwc:Occurrence represents the same dwc:Occurrence as another uniquely identified dwc:Occurrence",
    "a dwc:MaterialEntity is a subsample of another dwc:MaterialEntity",
  ],
  comments:
    "Resources can be thought of as identifiable records or instances of classes and may include, but need not be limited to instances of dwc:Occurrence, dwc:Organism, dwc:MaterialEntity, dwc:Event, dcterms:Location, dwc:GeologicalContext, dwc:Identification, or dwc:Taxon.",
  createdAt: new Date("2023-09-13"),
  updatedAt: new Date("2023-09-13"),
};

/**
 * Resource Relationship ID
 */
export const resourceRelationshipID: FieldDefinition = {
  id: "dwc-resourceRelationshipID",
  schemaId: "dwc",
  name: "resourceRelationshipID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/resourceRelationshipID",
  label: "Resource Relationship ID",
  definition:
    "An identifier for an instance of relationship between one resource (the subject) and another (dwc:relatedResource, the object).",
  examples: ["04b16710-b09c-11e8-96f8-529269fb1459"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Resource ID
 */
export const resourceID: FieldDefinition = {
  id: "dwc-resourceID",
  schemaId: "dwc",
  name: "resourceID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/resourceID",
  label: "Resource ID",
  definition: "An identifier for the resource that is the subject of the relationship.",
  examples: ["f809b9e0-b09b-11e8-96f8-529269fb1459"],

  createdAt: new Date("2018-09-06"),
  updatedAt: new Date("2018-09-06"),
};

/**
 * Relationship Of Resource ID
 */
export const relationshipOfResourceID: FieldDefinition = {
  id: "dwc-relationshipOfResourceID",
  schemaId: "dwc",
  name: "relationshipOfResourceID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/relationshipOfResourceID",
  label: "Relationship Of Resource ID",
  definition:
    "An identifier for the relationship type (predicate) that connects the subject identified by dwc:resourceID to its object identified by dwc:relatedResourceID.",
  examples: [
    "http://purl.obolibrary.org/obo/RO_0002456` (for the relation `pollinated by`)",
    "http://purl.obolibrary.org/obo/RO_0002455` (for the relation `pollinates`)",
    "https://www.inaturalist.org/observation_fields/879` (for the relation `eaten by`)",
  ],
  comments:
    "Recommended best practice is to use the identifiers of the terms in a controlled vocabulary, such as the OBO Relation Ontology.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Related Resource ID
 */
export const relatedResourceID: FieldDefinition = {
  id: "dwc-relatedResourceID",
  schemaId: "dwc",
  name: "relatedResourceID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/relatedResourceID",
  label: "Related Resource ID",
  definition:
    "An identifier for a related resource (the object, rather than the subject of the relationship).",
  examples: ["dc609808-b09b-11e8-96f8-529269fb1459"],

  createdAt: new Date("2018-09-06"),
  updatedAt: new Date("2018-09-06"),
};

/**
 * Relationship Of Resource
 */
export const relationshipOfResource: FieldDefinition = {
  id: "dwc-relationshipOfResource",
  schemaId: "dwc",
  name: "relationshipOfResource",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/relationshipOfResource",
  label: "Relationship Of Resource",
  definition:
    "The relationship of the subject (identified by dwc:resourceID) to the object (identified by dwc:relatedResourceID).",
  examples: ["same as", "duplicate of", "mother of"],
  comments: "Recommended best practice is to use a controlled vocabulary.",
  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Relationship According To
 */
export const relationshipAccordingTo: FieldDefinition = {
  id: "dwc-relationshipAccordingTo",
  schemaId: "dwc",
  name: "relationshipAccordingTo",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/relationshipAccordingTo",
  label: "Relationship According To",
  definition:
    "The source (person, organization, publication, reference) establishing the relationship between the two resources.",
  examples: ["Julie Woodruff"],

  createdAt: new Date("2018-09-06"),
  updatedAt: new Date("2018-09-06"),
};

/**
 * Relationship Established Date
 */
export const relationshipEstablishedDate: FieldDefinition = {
  id: "dwc-relationshipEstablishedDate",
  schemaId: "dwc",
  name: "relationshipEstablishedDate",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/relationshipEstablishedDate",
  label: "Relationship Established Date",
  definition: "The date-time on which the relationship between the two resources was established.",
  examples: [
    "1963-03-08T14:07-06:00` (8 Mar 1963 at or after 2:07pm and before 2:08pm in the time zone six hours earlier than UTC)",
    "2009-02-20T08:40Z` (20 February 2009 at or after 8:40am and before 8:41 UTC)",
    "2018-08-29T15:19` (29 August 2018 at or after 3:19pm and before 3:20pm local time)",
  ],
  comments: "Recommended best practice is to use a date that conforms to ISO 8601-1:2019.",
  createdAt: new Date("2025-06-12"),
  updatedAt: new Date("2025-06-12"),
};

/**
 * Relationship Remarks
 */
export const relationshipRemarks: FieldDefinition = {
  id: "dwc-relationshipRemarks",
  schemaId: "dwc",
  name: "relationshipRemarks",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/relationshipRemarks",
  label: "Relationship Remarks",
  definition: "Comments or notes about the relationship between the two resources.",
  examples: ["mother and offspring collected from the same nest", "pollinator captured in the act"],

  createdAt: new Date("2023-06-28"),
  updatedAt: new Date("2023-06-28"),
};

/**
 * Living Specimen
 */
export const LivingSpecimen: FieldDefinition = {
  id: "dwc-LivingSpecimen",
  schemaId: "dwc",
  name: "LivingSpecimen",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/LivingSpecimen",
  label: "Living Specimen",
  definition: "A specimen that is alive.",
  examples: ["a living plant in a botanical garden", "a living animal in a zoo"],

  createdAt: new Date("2023-09-18"),
  updatedAt: new Date("2023-09-18"),
};

/**
 * Preserved Specimen
 */
export const PreservedSpecimen: FieldDefinition = {
  id: "dwc-PreservedSpecimen",
  schemaId: "dwc",
  name: "PreservedSpecimen",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/PreservedSpecimen",
  label: "Preserved Specimen",
  definition: "A specimen that has been preserved.",
  examples: ["a plant on an herbarium sheet", "a cataloged lot of fish in a jar"],

  createdAt: new Date("2023-09-18"),
  updatedAt: new Date("2023-09-18"),
};

/**
 * Fossil Specimen
 */
export const FossilSpecimen: FieldDefinition = {
  id: "dwc-FossilSpecimen",
  schemaId: "dwc",
  name: "FossilSpecimen",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/FossilSpecimen",
  label: "Fossil Specimen",
  definition: "A preserved specimen that is a fossil.",
  examples: ["a body fossil", "a coprolite", "a gastrolith"],

  createdAt: new Date("2023-09-18"),
  updatedAt: new Date("2023-09-18"),
};

/**
 * Material Citation
 */
export const MaterialCitation: FieldDefinition = {
  id: "dwc-MaterialCitation",
  schemaId: "dwc",
  name: "MaterialCitation",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/MaterialCitation",
  label: "Material Citation",
  definition:
    "A reference to or citation of one, a part of, or multiple specimens in scholarly publications.",
  examples: [
    "a citation of a physical specimen from a scientific collection in a taxonomic treatment in a scientific publication",
    "a citation of a group of physical specimens, such as paratypes in a taxonomic treatment in a scientific publication",
  ],
  comments:
    "This class constitutes a new value for the controlled vocabulary in the recommendations for basisOfRecord. When importing Darwin Core Archives of literature-based datasets to GBIF, the basisOfRecord should be changed from Occurrence, PreservedSpecimen or Literature to MaterialCitation.",
  createdAt: new Date("2023-09-18"),
  updatedAt: new Date("2023-09-18"),
};

/**
 * Human Observation
 */
export const HumanObservation: FieldDefinition = {
  id: "dwc-HumanObservation",
  schemaId: "dwc",
  name: "HumanObservation",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/HumanObservation",
  label: "Human Observation",
  definition: "An output of a human observation process.",
  examples: [
    "evidence of a dwc:Occurrence taken from field notes or literature",
    "a record of a dwc:Occurrence without physical evidence or evidence captured with a machine",
  ],

  createdAt: new Date("2023-09-18"),
  updatedAt: new Date("2023-09-18"),
};

/**
 * Machine Observation
 */
export const MachineObservation: FieldDefinition = {
  id: "dwc-MachineObservation",
  schemaId: "dwc",
  name: "MachineObservation",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/MachineObservation",
  label: "Machine Observation",
  definition: "An output of a machine observation process.",
  examples: ["a photograph", "a video", "an audio recording"],

  createdAt: new Date("2023-09-18"),
  updatedAt: new Date("2023-09-18"),
};

/**
 * Accepted Scientific Name
 */
export const acceptedScientificName: FieldDefinition = {
  id: "dwc-acceptedScientificName",
  schemaId: "dwc",
  name: "acceptedScientificName",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/acceptedScientificName",
  label: "Accepted Scientific Name",
  definition:
    "The currently valid (zoological) or accepted (botanical) name for the scientificName.",

  comments: "Example: Tamias minimus valid name for Eutamias minimus",
  createdAt: new Date("2009-07-06"),
  updatedAt: new Date("2009-07-06"),
};

/**
 * Accepted Scientific Name ID
 */
export const acceptedScientificNameID: FieldDefinition = {
  id: "dwc-acceptedScientificNameID",
  schemaId: "dwc",
  name: "acceptedScientificNameID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/acceptedScientificNameID",
  label: "Accepted Scientific Name ID",
  definition: "A unique identifier for the acceptedScientificName.",

  createdAt: new Date("2009-07-06"),
  updatedAt: new Date("2009-07-06"),
};

/**
 * Accepted Taxon
 */
export const AcceptedTaxon: FieldDefinition = {
  id: "dwc-AcceptedTaxon",
  schemaId: "dwc",
  name: "AcceptedTaxon",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/AcceptedTaxon",
  label: "Accepted Taxon",
  definition:
    "The currently valid (zoological) or accepted (botanical) name for the ScientificName.",

  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Accepted Taxon ID
 */
export const AcceptedTaxonID: FieldDefinition = {
  id: "dwc-AcceptedTaxonID",
  schemaId: "dwc",
  name: "AcceptedTaxonID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/AcceptedTaxonID",
  label: "Accepted Taxon ID",
  definition: "A global unique identifier for the parent to the AcceptedTaxon.",

  createdAt: new Date("2009-01-21"),
  updatedAt: new Date("2009-01-21"),
};

/**
 * Accepted Taxon ID
 */
export const acceptedTaxonID: FieldDefinition = {
  id: "dwc-acceptedTaxonID",
  schemaId: "dwc",
  name: "acceptedTaxonID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/acceptedTaxonID",
  label: "Accepted Taxon ID",
  definition:
    "An identifier for the name of the currently valid (zoological) or accepted (botanical) taxon. See acceptedTaxon.",

  comments: "Example: 8fa58e08-08de-4ac1-b69c-1235340b7001",
  createdAt: new Date("2009-08-24"),
  updatedAt: new Date("2009-08-24"),
};

/**
 * Accepted Taxon Name
 */
export const acceptedTaxonName: FieldDefinition = {
  id: "dwc-acceptedTaxonName",
  schemaId: "dwc",
  name: "acceptedTaxonName",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/acceptedTaxonName",
  label: "Accepted Taxon Name",
  definition:
    "The currently valid (zoological) or accepted (botanical) name for the scientificName.",

  comments: "Example: Tamias minimus valid name for Eutamias minimus",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Accepted Taxon Name ID
 */
export const acceptedTaxonNameID: FieldDefinition = {
  id: "dwc-acceptedTaxonNameID",
  schemaId: "dwc",
  name: "acceptedTaxonNameID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/acceptedTaxonNameID",
  label: "Accepted Taxon Name ID",
  definition: "A unique identifier for the acceptedTaxonName.",

  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Access Constraints
 */
export const AccessConstraints: FieldDefinition = {
  id: "dwc-AccessConstraints",
  schemaId: "dwc",
  name: "AccessConstraints",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/AccessConstraints",
  label: "Access Constraints",
  definition:
    "A description of constraints on the use of the data as shared or access to further data that is not shared.",

  comments: "Example: not-for-profit use only.",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * According To
 */
export const accordingTo: FieldDefinition = {
  id: "dwc-accordingTo",
  schemaId: "dwc",
  name: "accordingTo",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/accordingTo",
  label: "According To",
  definition: "Abstract term to attribute information to a source.",

  createdAt: new Date("2009-01-21"),
  updatedAt: new Date("2009-01-21"),
};

/**
 * Accuracy
 */
export const accuracy: FieldDefinition = {
  id: "dwc-accuracy",
  schemaId: "dwc",
  name: "accuracy",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/accuracy",
  label: "Accuracy",
  definition: "Abstract term to capture error information about a measurement or fact.",

  createdAt: new Date("2009-01-21"),
  updatedAt: new Date("2009-01-21"),
};

/**
 * Basionym
 */
export const basionym: FieldDefinition = {
  id: "dwc-basionym",
  schemaId: "dwc",
  name: "basionym",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/basionym",
  label: "Basionym",
  definition: "The basionym (botany) or basonym (bacteriology) of the scientificName.",

  comments: "Example: Pinus abies",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Basionym ID
 */
export const basionymID: FieldDefinition = {
  id: "dwc-basionymID",
  schemaId: "dwc",
  name: "basionymID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/basionymID",
  label: "Basionym ID",
  definition:
    "A unique identifier for the basionym (botany) or basonym (bacteriology) of the scientificName.",

  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Binomial
 */
export const binomial: FieldDefinition = {
  id: "dwc-binomial",
  schemaId: "dwc",
  name: "binomial",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/binomial",
  label: "Binomial",
  definition: "The combination of genus and first (species) epithet of the scientificName.",

  comments: "Example: Ctenomys sociabilis",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Catalog Number Numeric
 */
export const CatalogNumberNumeric: FieldDefinition = {
  id: "dwc-CatalogNumberNumeric",
  schemaId: "dwc",
  name: "CatalogNumberNumeric",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/CatalogNumberNumeric",
  label: "Catalog Number Numeric",
  definition:
    "The numeric value of the catalogNumber, used to facilitate numerical sorting and searching by ranges.",

  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Dataset
 */
export const Dataset: FieldDefinition = {
  id: "dwc-Dataset",
  schemaId: "dwc",
  name: "Dataset",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/Dataset",
  label: "Dataset",
  definition: "The category of information pertaining to a logical set of records.",

  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Darwin Core Type
 */
export const DwCType: FieldDefinition = {
  id: "dwc-DwCType",
  schemaId: "dwc",
  name: "DwCType",
  semanticType: "controlled-vocabulary",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/DwCType",
  label: "Darwin Core Type",
  definition:
    "The set of classes specified by the Darwin Core Type Vocabulary, used to categorize the nature or genre of the resource.",

  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Earliest Date Collected
 */
export const EarliestDateCollected: FieldDefinition = {
  id: "dwc-EarliestDateCollected",
  schemaId: "dwc",
  name: "EarliestDateCollected",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/EarliestDateCollected",
  label: "Earliest Date Collected",
  definition:
    "The earliest date-time in a period during which a event occurred. If the event is recorded as occurring at a single date-time, populate both EarliestDateCollected and LatestDateCollected with the same value. Recommended best practice is to use an encoding scheme, such as ISO 8601:2004(E).",

  comments:
    "Date may be used to express temporal information at any level of granularity. Recommended best practice is to use an encoding scheme, such as the W3CDTF profile of ISO 8601 [W3CDTF].",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * End Time of Day
 */
export const EndTimeOfDay: FieldDefinition = {
  id: "dwc-EndTimeOfDay",
  schemaId: "dwc",
  name: "EndTimeOfDay",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/EndTimeOfDay",
  label: "End Time of Day",
  definition:
    "The time of day when the event ended, expressed as decimal hours from midnight, local time.",

  comments: "Examples: 12.0 (= noon), 13.5 (= 1:30pm)",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Event Attribute
 */
export const EventAttribute: FieldDefinition = {
  id: "dwc-EventAttribute",
  schemaId: "dwc",
  name: "EventAttribute",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/EventAttribute",
  label: "Event Attribute",
  definition: "Container class for information about attributes related to a given sampling event.",

  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Event Attribute Accuracy
 */
export const EventAttributeAccuracy: FieldDefinition = {
  id: "dwc-EventAttributeAccuracy",
  schemaId: "dwc",
  name: "EventAttributeAccuracy",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/EventAttributeAccuracy",
  label: "Event Attribute Accuracy",
  definition: "The description of the error associated with the EventAttributeValue.",

  comments: "Example: 0.01, normal distribution with variation of 2 m",
  createdAt: new Date("2009-01-18"),
  updatedAt: new Date("2009-01-18"),
};

/**
 * Event Attribute Determined By
 */
export const EventAttributeDeterminedBy: FieldDefinition = {
  id: "dwc-EventAttributeDeterminedBy",
  schemaId: "dwc",
  name: "EventAttributeDeterminedBy",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/EventAttributeDeterminedBy",
  label: "Event Attribute Determined By",
  definition:
    "The agent responsible for having determined the value of the measurement or characteristic of the sampling event.",

  comments: "Example: Robert Hijmans",
  createdAt: new Date("2009-01-23"),
  updatedAt: new Date("2009-01-23"),
};

/**
 * Event Attribute Determined Date
 */
export const EventAttributeDeterminedDate: FieldDefinition = {
  id: "dwc-EventAttributeDeterminedDate",
  schemaId: "dwc",
  name: "EventAttributeDeterminedDate",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/EventAttributeDeterminedDate",
  label: "Event Attribute Determined Date",
  definition:
    "The date on which the the measurement or characteristic of the sampling event was made.",

  comments:
    "Date may be used to express temporal information at any level of granularity. Recommended best practice is to use an encoding scheme, such as the W3CDTF profile of ISO 8601 [W3CDTF].",
  createdAt: new Date("2009-01-23"),
  updatedAt: new Date("2009-01-23"),
};

/**
 * Event Attribute ID
 */
export const EventAttributeID: FieldDefinition = {
  id: "dwc-EventAttributeID",
  schemaId: "dwc",
  name: "EventAttributeID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/EventAttributeID",
  label: "Event Attribute ID",
  definition:
    "An identifier for the event attribute. May be a global unique identifier or an identifier specific to the data set.",

  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Event Attribute Remarks
 */
export const EventAttributeRemarks: FieldDefinition = {
  id: "dwc-EventAttributeRemarks",
  schemaId: "dwc",
  name: "EventAttributeRemarks",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/EventAttributeRemarks",
  label: "Event Attribute Remarks",
  definition:
    "Comments or notes accompanying the measurement or characteristic of the sampling event.",

  comments: "Example: temperature taken at 15:00",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Event Attributes
 */
export const eventAttributes: FieldDefinition = {
  id: "dwc-eventAttributes",
  schemaId: "dwc",
  name: "eventAttributes",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/eventAttributes",
  label: "Event Attributes",
  definition:
    "A list (concatenated and separated) of additional measurements or characteristics of the Event.",

  comments: "Example: Relative humidity: 28 %; Temperature: 22 C; Sample size: 10 kg",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Event Attribute Type
 */
export const EventAttributeType: FieldDefinition = {
  id: "dwc-EventAttributeType",
  schemaId: "dwc",
  name: "EventAttributeType",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/EventAttributeType",
  label: "Event Attribute Type",
  definition:
    "The nature of the measurement or characteristic of the sampling event. Recommended best practice is to use a controlled vocabulary.",

  comments: "Example: Temperature",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Event Attribute Unit
 */
export const EventAttributeUnit: FieldDefinition = {
  id: "dwc-EventAttributeUnit",
  schemaId: "dwc",
  name: "EventAttributeUnit",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/EventAttributeUnit",
  label: "Event Attribute Unit",
  definition:
    "The units for the value of the measurement or characteristic of the sampling event. Recommended best practice is to use International System of Units (SI) units.",

  comments: "Example: C",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Event Attribute
 */
export const EventAttributeValue: FieldDefinition = {
  id: "dwc-EventAttributeValue",
  schemaId: "dwc",
  name: "EventAttributeValue",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/EventAttributeValue",
  label: "Event Attribute",
  definition: "The value of the measurement or characteristic of the sampling event.",

  comments: "Example: 22",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Event Measurement
 */
export const EventMeasurement: FieldDefinition = {
  id: "dwc-EventMeasurement",
  schemaId: "dwc",
  name: "EventMeasurement",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/EventMeasurement",
  label: "Event Measurement",
  definition: "The category of information pertaining to measurements associated with an event.",

  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Event Measurement Accuracy
 */
export const eventMeasurementAccuracy: FieldDefinition = {
  id: "dwc-eventMeasurementAccuracy",
  schemaId: "dwc",
  name: "eventMeasurementAccuracy",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/eventMeasurementAccuracy",
  label: "Event Measurement Accuracy",
  definition: "The description of the error associated with the EventAttributeValue.",

  comments: "Example: 0.01, normal distribution with variation of 2 m",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Event Measurement Determined By
 */
export const eventMeasurementDeterminedBy: FieldDefinition = {
  id: "dwc-eventMeasurementDeterminedBy",
  schemaId: "dwc",
  name: "eventMeasurementDeterminedBy",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/eventMeasurementDeterminedBy",
  label: "Event Measurement Determined By",
  definition:
    "The agent responsible for having determined the value of the measurement or characteristic of the event.",

  comments: "Example: Robert Hijmans",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Event Measurement Determined Date
 */
export const eventMeasurementDeterminedDate: FieldDefinition = {
  id: "dwc-eventMeasurementDeterminedDate",
  schemaId: "dwc",
  name: "eventMeasurementDeterminedDate",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/eventMeasurementDeterminedDate",
  label: "Event Measurement Determined Date",
  definition:
    "The date on which the the measurement or characteristic of the event was made. Recommended best practice is to use an encoding scheme, such as ISO 8601:2004(E).",

  comments:
    "Examples: 1963-03-08T14:07-0600 is 8 Mar 1963 2:07pm in the time zone six hours earlier than UTC, 2009-02-20T08:40Z is 20 Feb 2009 8:40am UTC, 1809-02-12 is 12 Feb 1809, 1906-06 is Jun 1906, 1971 is just that year, 2007-03-01T13:00:00Z/2008-05-11T15:30:00Z is the interval between 1 Mar 2007 1pm UTC and 11 May 2008 3:30pm UTC, 2007-11-13/15 is the interval between 13 Nov 2007 and 15 Nov 2007.",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Event Measurement ID
 */
export const eventMeasurementID: FieldDefinition = {
  id: "dwc-eventMeasurementID",
  schemaId: "dwc",
  name: "eventMeasurementID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/eventMeasurementID",
  label: "Event Measurement ID",
  definition:
    "An identifier for the event attribute. May be a global unique identifier or an identifier specific to the data set.",

  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Event Measurement Remarks
 */
export const eventMeasurementRemarks: FieldDefinition = {
  id: "dwc-eventMeasurementRemarks",
  schemaId: "dwc",
  name: "eventMeasurementRemarks",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/eventMeasurementRemarks",
  label: "Event Measurement Remarks",
  definition: "Comments or notes accompanying the measurement or characteristic of the event.",

  comments: "Example: temperature taken at 15:00",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Event Measurement Type
 */
export const eventMeasurementType: FieldDefinition = {
  id: "dwc-eventMeasurementType",
  schemaId: "dwc",
  name: "eventMeasurementType",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/eventMeasurementType",
  label: "Event Measurement Type",
  definition:
    "The nature of the measurement or characteristic of the event. Recommended best practice is to use a controlled vocabulary.",

  comments: "Example: temperature",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Event Measurement Unit
 */
export const eventMeasurementUnit: FieldDefinition = {
  id: "dwc-eventMeasurementUnit",
  schemaId: "dwc",
  name: "eventMeasurementUnit",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/eventMeasurementUnit",
  label: "Event Measurement Unit",
  definition:
    "The units for the value of the measurement or characteristic of the event. Recommended best practice is to use International System of Units (SI) units.",

  comments: "Example: C",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Event Measurement Value
 */
export const eventMeasurementValue: FieldDefinition = {
  id: "dwc-eventMeasurementValue",
  schemaId: "dwc",
  name: "eventMeasurementValue",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/eventMeasurementValue",
  label: "Event Measurement Value",
  definition: "The value of the measurement or characteristic of the event.",

  comments: "Example: 22",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Generalizations
 */
export const Generalizations: FieldDefinition = {
  id: "dwc-Generalizations",
  schemaId: "dwc",
  name: "Generalizations",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/Generalizations",
  label: "Generalizations",
  definition:
    "Actions taken to make the data as shared less specific or complete than in its original form. Suggests that alternative data of highly quality may be available on request.",

  comments:
    "Examples: Coordinates generalized from original GPS coordinates to the nearest half degree grid cell, locality information given only to nearest county.",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Higher Taxon
 */
export const HigherTaxon: FieldDefinition = {
  id: "dwc-HigherTaxon",
  schemaId: "dwc",
  name: "HigherTaxon",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/HigherTaxon",
  label: "Higher Taxon",
  definition:
    "A list (concatenated and separated) of the names for the taxonomic ranks less specific than the ScientificName.",

  comments:
    "Example: Animalia, Chordata, Vertebrata, Mammalia, Theria, Eutheria, Rodentia, Hystricognatha, Hystricognathi, Ctenomyidae, Ctenomyini, Ctenomys.",
  createdAt: new Date("2009-01-21"),
  updatedAt: new Date("2009-01-21"),
};

/**
 * Higher Taxon Concept ID
 */
export const higherTaxonconceptID: FieldDefinition = {
  id: "dwc-higherTaxonconceptID",
  schemaId: "dwc",
  name: "higherTaxonconceptID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/higherTaxonconceptID",
  label: "Higher Taxon Concept ID",
  definition:
    "A unique identifier for the taxon concept less specific than that given in the taxonConceptID.",

  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Higher Taxon ID
 */
export const HigherTaxonID: FieldDefinition = {
  id: "dwc-HigherTaxonID",
  schemaId: "dwc",
  name: "HigherTaxonID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/HigherTaxonID",
  label: "Higher Taxon ID",
  definition: "A global unique identifier for the parent to the taxon.",

  createdAt: new Date("2009-01-21"),
  updatedAt: new Date("2009-01-21"),
};

/**
 * Higher Taxon Name
 */
export const higherTaxonName: FieldDefinition = {
  id: "dwc-higherTaxonName",
  schemaId: "dwc",
  name: "higherTaxonName",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/higherTaxonName",
  label: "Higher Taxon Name",
  definition:
    "A list (concatenated and separated) of the names for the taxonomic ranks less specific than that given in the scientificName.",

  comments:
    "Example: Animalia; Chordata; Vertebrata; Mammalia; Theria; Eutheria; Rodentia; Hystricognatha; Hystricognathi; Ctenomyidae; Ctenomyini; Ctenomys",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Higher Taxon Name ID
 */
export const higherTaxonNameID: FieldDefinition = {
  id: "dwc-higherTaxonNameID",
  schemaId: "dwc",
  name: "higherTaxonNameID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/higherTaxonNameID",
  label: "Higher Taxon Name ID",
  definition:
    "A unique identifier for the name of the next higher rank than the scientificName in a taxonomic classification. See higherTaxonName.",

  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Identification Attributes
 */
export const identificationAttributes: FieldDefinition = {
  id: "dwc-identificationAttributes",
  schemaId: "dwc",
  name: "identificationAttributes",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/identificationAttributes",
  label: "Identification Attributes",
  definition:
    "A list (concatenated and separated) of additional measurements, facts, characteristics, or assertions about the Identification.",

  comments:
    "Example: natureOfID=expert identification; identificationEvidence=cytochrome B sequence",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Individual ID
 */
export const individualID: FieldDefinition = {
  id: "dwc-individualID",
  schemaId: "dwc",
  name: "individualID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/individualID",
  label: "Individual ID",
  definition:
    "An identifier for an individual or named group of individual organisms represented in the Occurrence. Meant to accommodate resampling of the same individual or group for monitoring purposes. May be a global unique identifier or an identifier specific to a data set.",

  comments: "Examples: U.amer. 44, Smedley, Orca J 23",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Latest Date Collected
 */
export const LatestDateCollected: FieldDefinition = {
  id: "dwc-LatestDateCollected",
  schemaId: "dwc",
  name: "LatestDateCollected",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/LatestDateCollected",
  label: "Latest Date Collected",
  definition:
    "The latest date-time in a period during which a event occurred. If the event is recorded as occurring at a single date-time, populate both EarliestDateCollected and LatestDateCollected with the same value. Recommended best practice is to use an encoding scheme, such as ISO 8601:2004(E).",

  comments:
    "Date may be used to express temporal information at any level of granularity. Recommended best practice is to use an encoding scheme, such as the W3CDTF profile of ISO 8601 [W3CDTF].",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Location Attributes
 */
export const locationAttributes: FieldDefinition = {
  id: "dwc-locationAttributes",
  schemaId: "dwc",
  name: "locationAttributes",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/locationAttributes",
  label: "Location Attributes",
  definition:
    "A list (concatenated and separated) of additional measurements, facts, characteristics, or assertions about the location.",

  comments: "Example: aspectheading=277; slopeindegrees=6",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Name Publication ID
 */
export const namePublicationID: FieldDefinition = {
  id: "dwc-namePublicationID",
  schemaId: "dwc",
  name: "namePublicationID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/namePublicationID",
  label: "Name Publication ID",
  definition:
    "A resolvable globally unique identifier for the original publication of the scientificName.",

  comments: "Example: http://hdl.handle.net/10199/7",
  createdAt: new Date("2009-05-18"),
  updatedAt: new Date("2009-05-18"),
};

/**
 * Occurrence Attributes
 */
export const occurrenceAttributes: FieldDefinition = {
  id: "dwc-occurrenceAttributes",
  schemaId: "dwc",
  name: "occurrenceAttributes",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/occurrenceAttributes",
  label: "Occurrence Attributes",
  definition:
    "A list (concatenated and separated) of additional measurements, facts, characteristics, or assertions about the Occurrence.",

  comments:
    "Examples: Tragus length: 14mm; Weight: 120g, Height: 1-1.5 meters tall; flowers yellow; uncommon.",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Occurrence Details
 */
export const occurrenceDetails: FieldDefinition = {
  id: "dwc-occurrenceDetails",
  schemaId: "dwc",
  name: "occurrenceDetails",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/occurrenceDetails",
  label: "Occurrence Details",
  definition:
    "A reference (publication, URI) to the most detailed information available about the Occurrence.",

  comments: "Example: http://mvzarctos.berkeley.edu/guid/MVZ:Mamm:165861",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Occurrence Measurement
 */
export const OccurrenceMeasurement: FieldDefinition = {
  id: "dwc-OccurrenceMeasurement",
  schemaId: "dwc",
  name: "OccurrenceMeasurement",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/OccurrenceMeasurement",
  label: "Occurrence Measurement",
  definition:
    "The category of information pertaining to measurements accociated with an occurrence.",

  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Occurrence Measurement Accuracy
 */
export const occurrenceMeasurementAccuracy: FieldDefinition = {
  id: "dwc-occurrenceMeasurementAccuracy",
  schemaId: "dwc",
  name: "occurrenceMeasurementAccuracy",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/occurrenceMeasurementAccuracy",
  label: "Occurrence Measurement Accuracy",
  definition: "The description of the error associated with the occurrenceAttributeValue.",

  comments: "Example: 0.01, normal distribution with variation of 2 m",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Occurrence Measurement Determined By
 */
export const occurrenceMeasurementDeterminedBy: FieldDefinition = {
  id: "dwc-occurrenceMeasurementDeterminedBy",
  schemaId: "dwc",
  name: "occurrenceMeasurementDeterminedBy",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/occurrenceMeasurementDeterminedBy",
  label: "Occurrence Measurement Determined By",
  definition:
    "The agent responsible for having determined the value of the measurement or characteristic of the occurrence.",

  comments: "Example: Javier de la Torre",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Occurrence Measurement Determined Date
 */
export const occurrenceMeasurementDeterminedDate: FieldDefinition = {
  id: "dwc-occurrenceMeasurementDeterminedDate",
  schemaId: "dwc",
  name: "occurrenceMeasurementDeterminedDate",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/occurrenceMeasurementDeterminedDate",
  label: "Occurrence Measurement Determined Date",
  definition:
    "The date on which the the measurement or characteristic of the occurrence was made. Recommended best practice is to use an encoding scheme, such as ISO 8601:2004(E).",

  comments:
    "Examples: 1963-03-08T14:07-0600 is 8 Mar 1963 2:07pm in the time zone six hours earlier than UTC, 2009-02-20T08:40Z is 20 Feb 2009 8:40am UTC, 1809-02-12 is 12 Feb 1809, 1906-06 is Jun 1906, 1971 is just that year, 2007-03-01T13:00:00Z/2008-05-11T15:30:00Z is the interval between 1 Mar 2007 1pm UTC and 11 May 2008 3:30pm UTC, 2007-11-13/15 is the interval between 13 Nov 2007 and 15 Nov 2007.",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Occurrence Measurement ID
 */
export const occurrenceMeasurementID: FieldDefinition = {
  id: "dwc-occurrenceMeasurementID",
  schemaId: "dwc",
  name: "occurrenceMeasurementID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/occurrenceMeasurementID",
  label: "Occurrence Measurement ID",
  definition:
    "An identifier for the occurrence attribute. May be a global unique identifier or an identifier specific to the data set.",

  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Occurrence Measurement Remarks
 */
export const occurrenceMeasurementRemarks: FieldDefinition = {
  id: "dwc-occurrenceMeasurementRemarks",
  schemaId: "dwc",
  name: "occurrenceMeasurementRemarks",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/occurrenceMeasurementRemarks",
  label: "Occurrence Measurement Remarks",
  definition: "Comments or notes accompanying the measurement or characteristic of the occurrence.",

  comments: "Example: tip of tail missing",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Occurrence Measurement Type
 */
export const occurrenceMeasurementType: FieldDefinition = {
  id: "dwc-occurrenceMeasurementType",
  schemaId: "dwc",
  name: "occurrenceMeasurementType",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/occurrenceMeasurementType",
  label: "Occurrence Measurement Type",
  definition:
    "The nature of the measurement or characteristic of the occurrence. Recommended best practice is to use a controlled vocabulary.",

  comments: "Example: tail length",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Occurrence Measurement Unit
 */
export const occurrenceMeasurementUnit: FieldDefinition = {
  id: "dwc-occurrenceMeasurementUnit",
  schemaId: "dwc",
  name: "occurrenceMeasurementUnit",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/occurrenceMeasurementUnit",
  label: "Occurrence Measurement Unit",
  definition:
    "The units for the value of the measurement or characteristic of the occurrence. Recommended best practice is to use International System of Units (SI) units.",

  comments: "Example: mm",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Occurrence Measurement Value
 */
export const occurrenceMeasurementValue: FieldDefinition = {
  id: "dwc-occurrenceMeasurementValue",
  schemaId: "dwc",
  name: "occurrenceMeasurementValue",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/occurrenceMeasurementValue",
  label: "Occurrence Measurement Value",
  definition: "The value of the measurement or characteristic of the occurrence.",

  comments: "Example: 45",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Previous Identifications
 */
export const PreviousIdentifications: FieldDefinition = {
  id: "dwc-PreviousIdentifications",
  schemaId: "dwc",
  name: "PreviousIdentifications",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/PreviousIdentifications",
  label: "Previous Identifications",
  definition:
    "A list (concatenated and separated) of previous ScientificNames to which the sample was identified.",

  comments: "Example: Anthus correndera.",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Related Basis of Record
 */
export const RelatedBasisOfRecord: FieldDefinition = {
  id: "dwc-RelatedBasisOfRecord",
  schemaId: "dwc",
  name: "RelatedBasisOfRecord",
  semanticType: "controlled-vocabulary",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/RelatedBasisOfRecord",
  label: "Related Basis of Record",
  definition:
    "The nature of the related resource. Recommended best practice is to use the same controlled vocabulary as for basisOfRecord.",

  comments: "Example: PreservedSpecimen",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Related Resource Type
 */
export const relatedResourceType: FieldDefinition = {
  id: "dwc-relatedResourceType",
  schemaId: "dwc",
  name: "relatedResourceType",
  semanticType: "controlled-vocabulary",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/relatedResourceType",
  label: "Related Resource Type",
  definition:
    "The type of the related resource. Recommended best practice is to use a controlled vocabulary.",

  comments:
    "Examples: StillImage, MovingImage, Sound, PhysicalObject, PreservedSpecimen, FossilSpecimen, LivingSpecimen, HumanObservation, MachineObservation, Location, Taxonomy, NomeclaturalChecklist, Publication",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Sample
 */
export const Sample: FieldDefinition = {
  id: "dwc-Sample",
  schemaId: "dwc",
  name: "Sample",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/Sample",
  label: "Sample",
  definition:
    "Container class for information about the results of a sampling event (specimen, observation, etc.)",

  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Sample Attribute
 */
export const SampleAttribute: FieldDefinition = {
  id: "dwc-SampleAttribute",
  schemaId: "dwc",
  name: "SampleAttribute",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/SampleAttribute",
  label: "Sample Attribute",
  definition: "Container class for information about attributes related to a given sample.",

  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Sample Attribute Accuracy
 */
export const SampleAttributeAccuracy: FieldDefinition = {
  id: "dwc-SampleAttributeAccuracy",
  schemaId: "dwc",
  name: "SampleAttributeAccuracy",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/SampleAttributeAccuracy",
  label: "Sample Attribute Accuracy",
  definition: "The description of the error associated with the SampleAttributeValue.",

  comments: "Example: 0.01, normal distribution with variation of 2 m",
  createdAt: new Date("2009-01-18"),
  updatedAt: new Date("2009-01-18"),
};

/**
 * Sample Attribute Determined By
 */
export const SampleAttributeDeterminedBy: FieldDefinition = {
  id: "dwc-SampleAttributeDeterminedBy",
  schemaId: "dwc",
  name: "SampleAttributeDeterminedBy",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/SampleAttributeDeterminedBy",
  label: "Sample Attribute Determined By",
  definition:
    "The agent responsible for having determined the value of the measurement or characteristic of the sample.",

  comments: "Example: Javier de la Torre",
  createdAt: new Date("2009-01-23"),
  updatedAt: new Date("2009-01-23"),
};

/**
 * Sample Attribute Determined Date
 */
export const SampleAttributeDeterminedDate: FieldDefinition = {
  id: "dwc-SampleAttributeDeterminedDate",
  schemaId: "dwc",
  name: "SampleAttributeDeterminedDate",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/SampleAttributeDeterminedDate",
  label: "Sample Attribute Determined Date",
  definition: "The date on which the the measurement or characteristic of the sample was made.",

  comments:
    "Date may be used to express temporal information at any level of granularity. Recommended best practice is to use an encoding scheme, such as the W3CDTF profile of ISO 8601 [W3CDTF].",
  createdAt: new Date("2009-01-23"),
  updatedAt: new Date("2009-01-23"),
};

/**
 * Sample Attribute Remarks
 */
export const SampleAttributeRemarks: FieldDefinition = {
  id: "dwc-SampleAttributeRemarks",
  schemaId: "dwc",
  name: "SampleAttributeRemarks",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/SampleAttributeRemarks",
  label: "Sample Attribute Remarks",
  definition: "Comments or notes accompanying the measurement or characteristic of the sample.",

  comments: "Example: tip of tail missing",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Sample Attribute Unit
 */
export const SampleAttributeUnit: FieldDefinition = {
  id: "dwc-SampleAttributeUnit",
  schemaId: "dwc",
  name: "SampleAttributeUnit",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/SampleAttributeUnit",
  label: "Sample Attribute Unit",
  definition:
    "The units for the value of the measurement or characteristic of the sample. Recommended best practice is to use International System of Units (SI) units.",

  comments: "Example: mm",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Sample Attribute Value
 */
export const SampleAttributeValue: FieldDefinition = {
  id: "dwc-SampleAttributeValue",
  schemaId: "dwc",
  name: "SampleAttributeValue",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/SampleAttributeValue",
  label: "Sample Attribute Value",
  definition: "The value of the measurement or characteristic of the sample.",

  comments: "Example: 45",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Sample Remarks
 */
export const SampleRemarks: FieldDefinition = {
  id: "dwc-SampleRemarks",
  schemaId: "dwc",
  name: "SampleRemarks",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/SampleRemarks",
  label: "Sample Remarks",
  definition: "Comments or notes about the sample or record.",

  comments: "Example: found dead on road",
  createdAt: new Date("2009-01-18"),
  updatedAt: new Date("2009-01-18"),
};

/**
 * Sample Attribute ID
 */
export const SamplingAttributeID: FieldDefinition = {
  id: "dwc-SamplingAttributeID",
  schemaId: "dwc",
  name: "SamplingAttributeID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/SamplingAttributeID",
  label: "Sample Attribute ID",
  definition:
    "An identifier for the sampling attribute. May be a global unique identifier or an identifier specific to the data set.",

  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Sample Attribute Type
 */
export const SamplingAttributeType: FieldDefinition = {
  id: "dwc-SamplingAttributeType",
  schemaId: "dwc",
  name: "SamplingAttributeType",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/SamplingAttributeType",
  label: "Sample Attribute Type",
  definition:
    "The nature of the measurement or characteristic of the sample. Recommended best practice is to use a controlled vocabulary.",

  comments: "Example: tail length",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Sampling Event
 */
export const SamplingEvent: FieldDefinition = {
  id: "dwc-SamplingEvent",
  schemaId: "dwc",
  name: "SamplingEvent",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/SamplingEvent",
  label: "Sampling Event",
  definition:
    "Container class for information about the conditions and methods of acquisition of samples.",

  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Sampling Event Attributes
 */
export const SamplingEventAttributes: FieldDefinition = {
  id: "dwc-SamplingEventAttributes",
  schemaId: "dwc",
  name: "SamplingEventAttributes",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/SamplingEventAttributes",
  label: "Sampling Event Attributes",
  definition:
    "A list (concatenated and separated) of additional measurements or characteristics of the sampling event.",

  comments: "Example: Relative humidity: 28 %; Temperature: 22 C; Sample size: 10 kg",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Sampling Event ID
 */
export const SamplingEventID: FieldDefinition = {
  id: "dwc-SamplingEventID",
  schemaId: "dwc",
  name: "SamplingEventID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/SamplingEventID",
  label: "Sampling Event ID",
  definition:
    "An identifier for the sampling event. May be a global unique identifier or an identifier specific to the data set.",

  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Sampling Event Remarks
 */
export const SamplingEventRemarks: FieldDefinition = {
  id: "dwc-SamplingEventRemarks",
  schemaId: "dwc",
  name: "SamplingEventRemarks",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/SamplingEventRemarks",
  label: "Sampling Event Remarks",
  definition: "Comments or notes about the sampling event.",

  comments: "Example: found dead on road",
  createdAt: new Date("2009-01-18"),
  updatedAt: new Date("2009-01-18"),
};

/**
 * Sampling Location
 */
export const SamplingLocation: FieldDefinition = {
  id: "dwc-SamplingLocation",
  schemaId: "dwc",
  name: "SamplingLocation",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/SamplingLocation",
  label: "Sampling Location",
  definition: "Container class for information about the location where a sampling event occurred.",

  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Sampling Location ID
 */
export const SamplingLocationID: FieldDefinition = {
  id: "dwc-SamplingLocationID",
  schemaId: "dwc",
  name: "SamplingLocationID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/SamplingLocationID",
  label: "Sampling Location ID",
  definition:
    "An identifier for the sampling location. May be a global unique identifier or an identifier specific to the data set.",

  comments: "Example: MVZ:LocID:12345",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Sampling Location Remarks
 */
export const SamplingLocationRemarks: FieldDefinition = {
  id: "dwc-SamplingLocationRemarks",
  schemaId: "dwc",
  name: "SamplingLocationRemarks",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/SamplingLocationRemarks",
  label: "Sampling Location Remarks",
  definition: "Comments or notes about the sampling location.",

  comments: "Example: under water since 2005",
  createdAt: new Date("2009-01-18"),
  updatedAt: new Date("2009-01-18"),
};

/**
 * Scientific Name Rank
 */
export const scientificNameRank: FieldDefinition = {
  id: "dwc-scientificNameRank",
  schemaId: "dwc",
  name: "scientificNameRank",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/scientificNameRank",
  label: "Scientific Name Rank",
  definition:
    "The taxonomic rank of the most specific name in the scientificName. Recommended best practice is to use a controlled vocabulary.",

  comments: "Examples: subsp., var., forma, species, genus",
  createdAt: new Date("2009-07-06"),
  updatedAt: new Date("2009-07-06"),
};

/**
 * Start Time of Day
 */
export const StartTimeOfDay: FieldDefinition = {
  id: "dwc-StartTimeOfDay",
  schemaId: "dwc",
  name: "StartTimeOfDay",
  semanticType: "temporal",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/StartTimeOfDay",
  label: "Start Time of Day",
  definition:
    "The time of day when the event began, expressed as decimal hours from midnight, local time.",

  comments: "Examples: 12.0 (= noon), 13.5 (= 1:30pm)",
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Taxon According To
 */
export const taxonAccordingTo: FieldDefinition = {
  id: "dwc-taxonAccordingTo",
  schemaId: "dwc",
  name: "taxonAccordingTo",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/taxonAccordingTo",
  label: "Taxon According To",
  definition:
    "Information about the authorship of this taxon concept which uses the scientificName in their sense (secundum, sensu). Could be a publication (identification key), institution or team of individuals.",

  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Taxon Attributes
 */
export const taxonAttributes: FieldDefinition = {
  id: "dwc-taxonAttributes",
  schemaId: "dwc",
  name: "taxonAttributes",
  semanticType: "measurement",
  validators: [],
  primitiveType: "number",
  termIri: "http://rs.tdwg.org/dwc/terms/taxonAttributes",
  label: "Taxon Attributes",
  definition:
    "A list (concatenated and separated) of additional measurements, facts, characteristics, or assertions about the taxon.",

  comments: "Example: iucnstatus=vulnerable; distribution=Neuquen, Argentina",
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Taxon ID
 */
export const TaxonID: FieldDefinition = {
  id: "dwc-TaxonID",
  schemaId: "dwc",
  name: "TaxonID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/TaxonID",
  label: "Taxon ID",
  definition: "A global unique identifier for the taxon (name in a classification).",

  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2008-11-19"),
};

/**
 * Taxon Name ID
 */
export const taxonNameID: FieldDefinition = {
  id: "dwc-taxonNameID",
  schemaId: "dwc",
  name: "taxonNameID",
  semanticType: "identifier",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/taxonNameID",
  label: "Taxon Name ID",
  definition: "A unique identifier for the scientificName.",

  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2009-04-24"),
};

/**
 * Verbatim Scientific Name Rank
 */
export const verbatimScientificNameRank: FieldDefinition = {
  id: "dwc-verbatimScientificNameRank",
  schemaId: "dwc",
  name: "verbatimScientificNameRank",
  semanticType: "taxonomy",
  validators: [],
  primitiveType: "string",
  termIri: "http://rs.tdwg.org/dwc/terms/verbatimScientificNameRank",
  label: "Verbatim Scientific Name Rank",
  definition:
    "The taxonomic rank of the most specific name in the scientificName as it appears in the original record.",

  comments: "Examples: Agamospecies, sub-lesus, prole, apomict, nothogrex.",
  createdAt: new Date("2009-07-06"),
  updatedAt: new Date("2009-07-06"),
};

/**
 * Complete Darwin Core field registry
 */
export const ALL_DWC_FIELDS: Record<string, FieldDefinition> = {
  feedbackURL,
  institutionID,
  collectionID,
  datasetID,
  institutionCode,
  collectionCode,
  datasetName,
  ownerInstitutionCode,
  basisOfRecord,
  informationWithheld,
  dataGeneralizations,
  dynamicProperties,
  Occurrence,
  occurrenceID,
  catalogNumber,
  recordNumber,
  recordedBy,
  recordedByID,
  individualCount,
  organismQuantity,
  organismQuantityType,
  sex,
  lifeStage,
  reproductiveCondition,
  caste,
  behavior,
  vitality,
  establishmentMeans,
  degreeOfEstablishment,
  pathway,
  georeferenceVerificationStatus,
  occurrenceStatus,
  associatedMedia,
  associatedOccurrences,
  associatedReferences,
  associatedTaxa,
  otherCatalogNumbers,
  occurrenceRemarks,
  Organism,
  organismID,
  organismName,
  organismScope,
  causeOfDeath,
  associatedOrganisms,
  previousIdentifications,
  organismRemarks,
  MaterialEntity,
  materialEntityID,
  digitalSpecimenID,
  materialEntityType,
  discipline,
  preparations,
  disposition,
  verbatimLabel,
  associatedSequences,
  materialEntityRemarks,
  MaterialSample,
  materialSampleID,
  Event,
  eventID,
  parentEventID,
  eventType,
  fieldNumber,
  projectTitle,
  projectID,
  fundingAttributionID,
  eventDate,
  eventTime,
  startDayOfYear,
  endDayOfYear,
  year,
  month,
  day,
  verbatimEventDate,
  habitat,
  samplingProtocol,
  sampleSizeValue,
  sampleSizeUnit,
  samplingEffort,
  fieldNotes,
  eventRemarks,
  locationID,
  higherGeographyID,
  higherGeography,
  continent,
  waterBody,
  islandGroup,
  island,
  country,
  countryCode,
  stateProvince,
  county,
  municipality,
  locality,
  verbatimLocality,
  minimumElevationInMeters,
  maximumElevationInMeters,
  verbatimElevation,
  verticalDatum,
  minimumDepthInMeters,
  maximumDepthInMeters,
  verbatimDepth,
  minimumDistanceAboveSurfaceInMeters,
  maximumDistanceAboveSurfaceInMeters,
  locationAccordingTo,
  locationRemarks,
  decimalLatitude,
  decimalLongitude,
  geodeticDatum,
  coordinateUncertaintyInMeters,
  coordinatePrecision,
  pointRadiusSpatialFit,
  verbatimCoordinates,
  verbatimLatitude,
  verbatimLongitude,
  verbatimCoordinateSystem,
  verbatimSRS,
  footprintWKT,
  footprintSRS,
  footprintSpatialFit,
  georeferencedBy,
  georeferencedDate,
  georeferenceProtocol,
  georeferenceSources,
  georeferenceRemarks,
  GeologicalContext,
  geologicalContextID,
  earliestEonOrLowestEonothem,
  latestEonOrHighestEonothem,
  earliestEraOrLowestErathem,
  latestEraOrHighestErathem,
  earliestPeriodOrLowestSystem,
  latestPeriodOrHighestSystem,
  earliestEpochOrLowestSeries,
  latestEpochOrHighestSeries,
  earliestAgeOrLowestStage,
  latestAgeOrHighestStage,
  lowestBiostratigraphicZone,
  highestBiostratigraphicZone,
  lithostratigraphicTerms,
  group,
  formation,
  member,
  bed,
  Identification,
  identificationID,
  verbatimIdentification,
  identificationQualifier,
  typeStatus,
  typifiedName,
  identifiedBy,
  identifiedByID,
  dateIdentified,
  identificationReferences,
  identificationVerificationStatus,
  identificationRemarks,
  Taxon,
  taxonID,
  scientificNameID,
  acceptedNameUsageID,
  parentNameUsageID,
  originalNameUsageID,
  nameAccordingToID,
  namePublishedInID,
  taxonConceptID,
  scientificName,
  acceptedNameUsage,
  parentNameUsage,
  originalNameUsage,
  nameAccordingTo,
  namePublishedIn,
  namePublishedInYear,
  higherClassification,
  kingdom,
  phylum,
  "class": taxonClass,
  order,
  superfamily,
  family,
  subfamily,
  tribe,
  subtribe,
  genus,
  genericName,
  subgenus,
  infragenericEpithet,
  specificEpithet,
  infraspecificEpithet,
  cultivarEpithet,
  taxonRank,
  verbatimTaxonRank,
  scientificNameAuthorship,
  vernacularName,
  nomenclaturalCode,
  taxonomicStatus,
  nomenclaturalStatus,
  taxonRemarks,
  MeasurementOrFact,
  measurementID,
  parentMeasurementID,
  measurementType,
  verbatimMeasurementType,
  measurementValue,
  measurementAccuracy,
  measurementUnit,
  measurementDeterminedBy,
  measurementDeterminedDate,
  measurementMethod,
  measurementRemarks,
  ResourceRelationship,
  resourceRelationshipID,
  resourceID,
  relationshipOfResourceID,
  relatedResourceID,
  relationshipOfResource,
  relationshipAccordingTo,
  relationshipEstablishedDate,
  relationshipRemarks,
  LivingSpecimen,
  PreservedSpecimen,
  FossilSpecimen,
  MaterialCitation,
  HumanObservation,
  MachineObservation,
  acceptedScientificName,
  acceptedScientificNameID,
  AcceptedTaxon,
  AcceptedTaxonID,
  acceptedTaxonID,
  acceptedTaxonName,
  acceptedTaxonNameID,
  AccessConstraints,
  accordingTo,
  accuracy,
  basionym,
  basionymID,
  binomial,
  CatalogNumberNumeric,
  Dataset,
  DwCType,
  EarliestDateCollected,
  EndTimeOfDay,
  EventAttribute,
  EventAttributeAccuracy,
  EventAttributeDeterminedBy,
  EventAttributeDeterminedDate,
  EventAttributeID,
  EventAttributeRemarks,
  eventAttributes,
  EventAttributeType,
  EventAttributeUnit,
  EventAttributeValue,
  EventMeasurement,
  eventMeasurementAccuracy,
  eventMeasurementDeterminedBy,
  eventMeasurementDeterminedDate,
  eventMeasurementID,
  eventMeasurementRemarks,
  eventMeasurementType,
  eventMeasurementUnit,
  eventMeasurementValue,
  Generalizations,
  HigherTaxon,
  higherTaxonconceptID,
  HigherTaxonID,
  higherTaxonName,
  higherTaxonNameID,
  identificationAttributes,
  individualID,
  LatestDateCollected,
  locationAttributes,
  namePublicationID,
  occurrenceAttributes,
  occurrenceDetails,
  OccurrenceMeasurement,
  occurrenceMeasurementAccuracy,
  occurrenceMeasurementDeterminedBy,
  occurrenceMeasurementDeterminedDate,
  occurrenceMeasurementID,
  occurrenceMeasurementRemarks,
  occurrenceMeasurementType,
  occurrenceMeasurementUnit,
  occurrenceMeasurementValue,
  PreviousIdentifications,
  RelatedBasisOfRecord,
  relatedResourceType,
  Sample,
  SampleAttribute,
  SampleAttributeAccuracy,
  SampleAttributeDeterminedBy,
  SampleAttributeDeterminedDate,
  SampleAttributeRemarks,
  SampleAttributeUnit,
  SampleAttributeValue,
  SampleRemarks,
  SamplingAttributeID,
  SamplingAttributeType,
  SamplingEvent,
  SamplingEventAttributes,
  SamplingEventID,
  SamplingEventRemarks,
  SamplingLocation,
  SamplingLocationID,
  SamplingLocationRemarks,
  scientificNameRank,
  StartTimeOfDay,
  taxonAccordingTo,
  taxonAttributes,
  TaxonID,
  taxonNameID,
  verbatimScientificNameRank,
};

/**
 * Get a Darwin Core field definition by name
 */
export function getDWCField(fieldName: string): FieldDefinition | undefined {
  return ALL_DWC_FIELDS[fieldName];
}

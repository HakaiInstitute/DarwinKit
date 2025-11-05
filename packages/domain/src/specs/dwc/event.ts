/**
 * Darwin Core Event extension field definitions
 *
 * Based on fields found in FC2022_event.csv and Darwin Core specification:
 * eventID, language, license, bibliographicCitation, rightsHolder, modified,
 * country, countryCode, geodeticDatum, stateProvince, county, verbatimEventDate,
 * decimalLatitude, decimalLongitude, verbatimLocality, parentEventID, eventType,
 * month, day, year, eventDate, minimumDepthInMeters, maximumDepthInMeters,
 * institutionCode, institutionID, samplingProtocol, habitat, collectionCode,
 * municipality, fieldNotes, eventRemarks
 */

import type { FieldDefinition } from "../field-definition.ts";
import { DARWIN_CORE_VALIDATORS } from "../validators.ts";
import { createVocabularyConfig } from "../vocabularies/config.ts";

const DWC_NAMESPACE = "http://rs.tdwg.org/dwc/terms/";

/**
 * Event ID - Unique identifier for the sampling event
 */
export const eventID: FieldDefinition = {
  id: "dwc-eventID",
  schemaId: "dwc",
  name: "eventID",
  semanticType: "identifier",
  validators: [
    DARWIN_CORE_VALIDATORS.required(),
    DARWIN_CORE_VALIDATORS.uniqueIdentifier(),
  ],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}eventID`,
  versionIri: `${DWC_NAMESPACE}version/eventID-2023-06-28`,
  label: "Event ID",
  definition:
    "An identifier for the set of information associated with a dwc:Event (something that occurs at a place and time). May be a global unique identifier or an identifier specific to the data set.",
  examples: ["INBO:VIS:Ev:00009375", "LACM:Ent:Event:78"],
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
 * Decimal Latitude - Geographic latitude in decimal degrees
 */
export const decimalLatitude: FieldDefinition = {
  id: "dwc-decimalLatitude",
  schemaId: "dwc",
  name: "decimalLatitude",
  semanticType: "location",
  validators: [
    DARWIN_CORE_VALIDATORS.latitude(),
    DARWIN_CORE_VALIDATORS.recommended(),
  ],
  primitiveType: "number",
  termIri: `${DWC_NAMESPACE}decimalLatitude`,
  label: "Decimal Latitude",
  definition:
    "The geographic latitude (in decimal degrees, using the spatial reference system given in dwc:geodeticDatum) of the geographic center of a dcterms:Location. Positive values are north of the Equator, negative values are south of it. Legal values lie between -90 and 90, inclusive.",
  examples: ["-41.0983423"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  location: {
    coordinateSystem: "decimal degrees",
    precision: 6,
    geodeticDatum: "WGS84",
    uncertaintyUnit: "meters",
  },
};

/**
 * Decimal Longitude - Geographic longitude in decimal degrees
 */
export const decimalLongitude: FieldDefinition = {
  id: "dwc-decimalLongitude",
  schemaId: "dwc",
  name: "decimalLongitude",
  semanticType: "location",
  validators: [
    DARWIN_CORE_VALIDATORS.longitude(),
    DARWIN_CORE_VALIDATORS.recommended(),
  ],
  primitiveType: "number",
  termIri: `${DWC_NAMESPACE}decimalLongitude`,
  label: "Decimal Longitude",
  definition:
    "The geographic longitude (in decimal degrees, using the spatial reference system given in dwc:geodeticDatum) of the geographic center of a dcterms:Location. Positive values are east of the Greenwich Meridian, negative values are west of it. Legal values lie between -180 and 180, inclusive.",
  examples: ["-121.1761111"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  location: {
    coordinateSystem: "decimal degrees",
    precision: 6,
    geodeticDatum: "WGS84",
    uncertaintyUnit: "meters",
  },
};

/**
 * Country - Name of the country
 */
export const country: FieldDefinition = {
  id: "dwc-country",
  schemaId: "dwc",
  name: "country",
  semanticType: "location",
  validators: [DARWIN_CORE_VALIDATORS.recommended()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}country`,
  label: "Country",
  definition:
    "The name of the country or major administrative unit in which the dcterms:Location occurs.",
  examples: ["Denmark", "Colombia", "España"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  location: {
    coordinateSystem: "administrative",
  },
};

/**
 * Country Code - ISO country code
 */
export const countryCode: FieldDefinition = {
  id: "dwc-countryCode",
  schemaId: "dwc",
  name: "countryCode",
  semanticType: "controlled-vocabulary",
  validators: [DARWIN_CORE_VALIDATORS.recommended()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}countryCode`,
  label: "Country Code",
  definition: "The standard code for the country in which the dcterms:Location occurs.",
  examples: ["AR", "SV"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  vocabulary: createVocabularyConfig("countryCode", "recommended"),
  location: {
    coordinateSystem: "administrative",
  },
};

/**
 * Event Date - Date or date range of the event
 */
export const eventDate: FieldDefinition = {
  id: "dwc-eventDate",
  schemaId: "dwc",
  name: "eventDate",
  semanticType: "temporal",
  validators: [
    DARWIN_CORE_VALIDATORS.recommended(),
    DARWIN_CORE_VALIDATORS.iso8601Date(),
  ],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}eventDate`,
  label: "Event Date",
  definition:
    "The date-time or interval during which a dwc:Event occurred. For occurrences, this is the date-time when the event was recorded. Not suitable for a time in a geological context.",
  examples: [
    "1963-03-08T14:07-0600",
    "2009-02-20T08:40Z",
    "2018-08-29T15:19",
    "1809-02-12",
    "1906-06",
    "1971",
    "2007-03-01T13:00:00Z/2008-05-11T15:30:00Z",
  ],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  temporal: {
    dateFormat: "iso8601",
    allowFutureDates: false,
    allowIncompleteDate: true,
    intervalSupported: true,
  },
};

/**
 * Year - Four-digit year of the event
 */
export const year: FieldDefinition = {
  id: "dwc-year",
  schemaId: "dwc",
  name: "year",
  semanticType: "temporal",
  validators: [DARWIN_CORE_VALIDATORS.year()],
  primitiveType: "number",
  termIri: `${DWC_NAMESPACE}year`,
  label: "Year",
  definition:
    "The four-digit year in which the dwc:Event occurred, according to the Common Era Calendar.",
  examples: ["1906", "2018"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  temporal: {
    dateFormat: "partial",
    allowFutureDates: false,
  },
};

/**
 * Month - Integer month of the event
 */
export const month: FieldDefinition = {
  id: "dwc-month",
  schemaId: "dwc",
  name: "month",
  semanticType: "temporal",
  validators: [DARWIN_CORE_VALIDATORS.month()],
  primitiveType: "number",
  termIri: `${DWC_NAMESPACE}month`,
  label: "Month",
  definition: "The integer month in which the dwc:Event occurred.",
  examples: ["1", "10"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  temporal: {
    dateFormat: "partial",
  },
};

/**
 * Day - Integer day of the event
 */
export const day: FieldDefinition = {
  id: "dwc-day",
  schemaId: "dwc",
  name: "day",
  semanticType: "temporal",
  validators: [DARWIN_CORE_VALIDATORS.day()],
  primitiveType: "number",
  termIri: `${DWC_NAMESPACE}day`,
  label: "Day",
  definition: "The integer day of the month on which the dwc:Event occurred.",
  examples: ["9", "28"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  temporal: {
    dateFormat: "partial",
  },
};

/**
 * Minimum Depth In Meters - Minimum depth of sampling
 */
export const minimumDepthInMeters: FieldDefinition = {
  id: "dwc-minimumDepthInMeters",
  schemaId: "dwc",
  name: "minimumDepthInMeters",
  semanticType: "measurement",
  validators: [DARWIN_CORE_VALIDATORS.depth()],
  primitiveType: "number",
  termIri: `${DWC_NAMESPACE}minimumDepthInMeters`,
  label: "Minimum Depth In Meters",
  definition: "The lesser depth of a range of depth below the local surface, in meters.",
  examples: ["0", "1.5", "100"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  measurement: {
    unit: "meters",
    defaultUnit: "m",
    precision: 2,
    measurementType: "length",
  },
};

/**
 * Maximum Depth In Meters - Maximum depth of sampling
 */
export const maximumDepthInMeters: FieldDefinition = {
  id: "dwc-maximumDepthInMeters",
  schemaId: "dwc",
  name: "maximumDepthInMeters",
  semanticType: "measurement",
  validators: [DARWIN_CORE_VALIDATORS.depth()],
  primitiveType: "number",
  termIri: `${DWC_NAMESPACE}maximumDepthInMeters`,
  label: "Maximum Depth In Meters",
  definition: "The greater depth of a range of depth below the local surface, in meters.",
  examples: ["0", "200"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  measurement: {
    unit: "meters",
    defaultUnit: "m",
    precision: 2,
    measurementType: "length",
  },
};

/**
 * State Province - State, province, or other administrative region
 */
export const stateProvince: FieldDefinition = {
  id: "dwc-stateProvince",
  schemaId: "dwc",
  name: "stateProvince",
  semanticType: "location",
  validators: [DARWIN_CORE_VALIDATORS.recommended()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}stateProvince`,
  label: "State Province",
  definition:
    "The name of the next smaller administrative region than country (state, province, canton, department, region, etc.) in which the dcterms:Location occurs.",
  examples: ["Montana", "Minas Gerais", "Córdoba"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  location: {
    coordinateSystem: "administrative",
  },
};

/**
 * County - County or equivalent administrative region
 */
export const county: FieldDefinition = {
  id: "dwc-county",
  schemaId: "dwc",
  name: "county",
  semanticType: "location",
  validators: [DARWIN_CORE_VALIDATORS.recommended()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}county`,
  label: "County",
  definition:
    "The full, unabbreviated name of the next smaller administrative region than stateProvince (county, shire, department, etc.) in which the dcterms:Location occurs.",
  examples: ["Missoula", "Los Lagos"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
  location: {
    coordinateSystem: "administrative",
  },
};

/**
 * Verbatim Locality - Original locality description
 */
export const verbatimLocality: FieldDefinition = {
  id: "dwc-verbatimLocality",
  schemaId: "dwc",
  name: "verbatimLocality",
  semanticType: "description",
  validators: [DARWIN_CORE_VALIDATORS.recommended()],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}verbatimLocality`,
  label: "Verbatim Locality",
  definition: "The original textual description of the place.",
  examples: ["25 km NNE Bariloche por R. Nac. 237"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
};

/**
 * Field Notes - Notes taken in the field
 */
export const fieldNotes: FieldDefinition = {
  id: "dwc-fieldNotes",
  schemaId: "dwc",
  name: "fieldNotes",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}fieldNotes`,
  label: "Field Notes",
  definition:
    "One of a) an indicator of the existence of, b) a reference to (publication, URI), or c) the text of notes taken in the field about the dwc:Event.",
  examples: ["Notes available in Grinnell-Miller Library"],
  createdAt: new Date("2008-11-19"),
  updatedAt: new Date("2021-07-15"),
};

/**
 * Event Remarks - Comments about the event
 */
export const eventRemarks: FieldDefinition = {
  id: "dwc-eventRemarks",
  schemaId: "dwc",
  name: "eventRemarks",
  semanticType: "description",
  validators: [],
  primitiveType: "string",
  termIri: `${DWC_NAMESPACE}eventRemarks`,
  label: "Event Remarks",
  definition: "Comments or notes about the dwc:Event.",
  examples: ["after the recent rains the river is nearly at flood stage"],
  createdAt: new Date("2009-04-24"),
  updatedAt: new Date("2021-07-15"),
};

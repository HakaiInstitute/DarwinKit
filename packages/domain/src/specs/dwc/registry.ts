/**
 * Darwin Core schema registry and specification definition
 *
 * Central registry for all Darwin Core field definitions and metadata,
 * organized by extension type for easy lookup and validation.
 */

import type { DataSpecification } from "../base.ts";
import type { FieldDefinition } from "../field-definition.ts";
import * as EventFields from "./event.ts";
import * as OccurrenceFields from "./occurrence.ts";
import { ALL_DWC_FIELDS as ALL_GENERATED_FIELDS } from "./all-fields.ts";

/**
 * Darwin Core specification metadata
 */
export const DARWIN_CORE_SPEC: DataSpecification = {
  id: "dwc",
  name: "Darwin Core",
  version: "2023-07-13",
  namespace: "http://rs.tdwg.org/dwc/terms/",
  extensions: ["event", "occurrence", "extendedMeasurementOrFacts", "resourceRelationship"],
  description:
    "Darwin Core is a standard maintained by the Darwin Core Task Group of Biodiversity Information Standards (TDWG). The standard is meant to facilitate the sharing of information about biological diversity by providing identifiers, labels, and definitions for standard fields that represent the meaning and content of data.",
  createdAt: new Date("2009-02-12"),
  updatedAt: new Date("2023-07-13"),
};

/**
 * All Darwin Core field definitions organized by extension
 */
export const DWC_FIELDS_BY_EXTENSION = {
  event: {
    eventID: EventFields.eventID,
    decimalLatitude: EventFields.decimalLatitude,
    decimalLongitude: EventFields.decimalLongitude,
    country: EventFields.country,
    countryCode: EventFields.countryCode,
    eventDate: EventFields.eventDate,
    year: EventFields.year,
    month: EventFields.month,
    day: EventFields.day,
    minimumDepthInMeters: EventFields.minimumDepthInMeters,
    maximumDepthInMeters: EventFields.maximumDepthInMeters,
    stateProvince: EventFields.stateProvince,
    county: EventFields.county,
    verbatimLocality: EventFields.verbatimLocality,
    fieldNotes: EventFields.fieldNotes,
    eventRemarks: EventFields.eventRemarks,
  },
  occurrence: {
    occurrenceID: OccurrenceFields.occurrenceID,
    basisOfRecord: OccurrenceFields.basisOfRecord,
    scientificName: OccurrenceFields.scientificName,
    scientificNameID: OccurrenceFields.scientificNameID,
    taxonRank: OccurrenceFields.taxonRank,
    kingdom: OccurrenceFields.kingdom,
    phylum: OccurrenceFields.phylum,
    class: OccurrenceFields.taxonClass,
    order: OccurrenceFields.order,
    family: OccurrenceFields.family,
    genus: OccurrenceFields.genus,
    occurrenceStatus: OccurrenceFields.occurrenceStatus,
    lifeStage: OccurrenceFields.lifeStage,
    organismQuantity: OccurrenceFields.organismQuantity,
  },
} as const;

/**
 * Flattened registry of all Darwin Core fields for easy lookup
 *
 * Merges extension-specific fields (with validators) and generated fields.
 * Extension fields take priority to ensure proper validation.
 */
export const ALL_DWC_FIELDS: Record<string, FieldDefinition> = {
  ...ALL_GENERATED_FIELDS, // Base: all 248 generated fields
  ...DWC_FIELDS_BY_EXTENSION.event, // Override: event fields with validators
  ...DWC_FIELDS_BY_EXTENSION.occurrence, // Override: occurrence fields with validators
};

/**
 * Essential field lookup functions
 */

/**
 * Get a Darwin Core field definition by name (master lookup)
 */
export function getDWCField(fieldName: string): FieldDefinition | undefined {
  return ALL_DWC_FIELDS[fieldName];
}

/**
 * Check if a field name is a valid Darwin Core term
 */
export function isDWCField(fieldName: string): boolean {
  return fieldName in ALL_DWC_FIELDS;
}

/**
 * Get all field definitions in Darwin Core (useful for registry stats/docs)
 */
export function getAllDWCFields(): FieldDefinition[] {
  return Object.values(ALL_DWC_FIELDS);
}

/**
 * Get all field names for a specific extension
 */
export function getExtensionFieldNames(extension: keyof typeof DWC_FIELDS_BY_EXTENSION): string[] {
  return Object.keys(DWC_FIELDS_BY_EXTENSION[extension]);
}

/**
 * Get all field definitions for a specific extension
 */
export function getExtensionFields(
  extension: keyof typeof DWC_FIELDS_BY_EXTENSION,
): FieldDefinition[] {
  return Object.values(DWC_FIELDS_BY_EXTENSION[extension]);
}

/**
 * Extension metadata for documentation and validation
 */
export const DWC_EXTENSION_METADATA = {
  event: {
    label: "Event",
    description: "Information about sampling events, including when and where they occurred",
    coreIdentifier: "eventID",
    fieldCount: Object.keys(DWC_FIELDS_BY_EXTENSION.event).length,
  },
  occurrence: {
    label: "Occurrence",
    description: "Information about the presence of organisms at specific events",
    coreIdentifier: "occurrenceID",
    fieldCount: Object.keys(DWC_FIELDS_BY_EXTENSION.occurrence).length,
  },
} as const;

/**
 * Statistics about the Darwin Core implementation
 */
export const DWC_STATS = {
  totalFields: Object.keys(ALL_DWC_FIELDS).length,
  totalExtensions: Object.keys(DWC_FIELDS_BY_EXTENSION).length,
  extensionFieldCounts: {
    event: Object.keys(DWC_FIELDS_BY_EXTENSION.event).length,
    occurrence: Object.keys(DWC_FIELDS_BY_EXTENSION.occurrence).length,
  },
} as const;

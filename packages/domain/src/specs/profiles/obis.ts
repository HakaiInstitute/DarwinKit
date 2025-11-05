/**
 * OBIS Base Profile
 *
 * Core validation requirements for all data to be published to OBIS
 * (Ocean Biodiversity Information System).
 *
 * This base profile defines common requirements across all OBIS data types.
 * Specific profiles (Event, Occurrence, eMoF) extend this base.
 *
 * Based on: https://manual.obis.org/checklist.html
 * Version: 2024
 */

import type { ValidationProfile } from "../../types/validation-profile.ts";
import { FieldRequirementLevel } from "../../types/validation-profile.ts";

/**
 * OBIS Base Profile
 *
 * Universal requirements for all OBIS data submissions.
 */
export const OBIS_BASE_PROFILE: ValidationProfile = {
  id: "obis",
  name: "OBIS Base Requirements",
  description:
    "Core validation requirements for all data to be published to the Ocean Biodiversity Information System (OBIS)",
  targetSchema: "obis",
  documentationUrl: "https://manual.obis.org/",
  version: "2024",

  fieldOverrides: {
    // === Geographic Location (Required for all OBIS data) ===
    decimalLatitude: {
      requirement: FieldRequirementLevel.Required,
      validators: [
        {
          type: "range",
          enforcement: "required",
          params: { min: -90, max: 90 },
          message: "Latitude must be between -90 and 90 degrees",
        },
      ],
    },

    decimalLongitude: {
      requirement: FieldRequirementLevel.Required,
      validators: [
        {
          type: "range",
          enforcement: "required",
          params: { min: -180, max: 180 },
          message: "Longitude must be between -180 and 180 degrees",
        },
      ],
    },

    geodeticDatum: {
      requirement: FieldRequirementLevel.Required,
      validators: [
        {
          type: "required",
          enforcement: "required",
          message: "OBIS requires geodeticDatum (e.g., WGS84, EPSG:4326)",
        },
      ],
    },

    coordinateUncertaintyInMeters: {
      requirement: FieldRequirementLevel.StronglyRecommended,
      validators: [
        {
          type: "range",
          enforcement: "recommended",
          params: { min: 0 },
          message: "Coordinate uncertainty should be a positive number",
        },
      ],
    },

    // === Temporal Information ===
    eventDate: {
      requirement: FieldRequirementLevel.Required,
      validators: [
        {
          type: "format",
          enforcement: "required",
          params: { format: "iso8601" },
          message:
            "OBIS requires eventDate in ISO 8601 format (YYYY-MM-DD or YYYY-MM-DD/YYYY-MM-DD)",
        },
      ],
    },

    year: {
      requirement: FieldRequirementLevel.StronglyRecommended,
    },

    month: {
      requirement: FieldRequirementLevel.Recommended,
    },

    day: {
      requirement: FieldRequirementLevel.Recommended,
    },

    // === Taxonomic Information ===
    scientificName: {
      requirement: FieldRequirementLevel.StronglyRecommended,
      validators: [
        {
          type: "required",
          enforcement: "recommended",
          message: "Scientific name is strongly recommended for taxonomic identification",
        },
      ],
    },

    scientificNameID: {
      requirement: FieldRequirementLevel.StronglyRecommended,
      validators: [
        {
          type: "format",
          enforcement: "recommended",
          params: { format: "url" },
          message: "Scientific name ID should be a valid URI (e.g., WoRMS LSID)",
        },
      ],
    },

    kingdom: {
      requirement: FieldRequirementLevel.Recommended,
    },

    // === Occurrence Information ===
    basisOfRecord: {
      requirement: FieldRequirementLevel.StronglyRecommended,
    },

    occurrenceStatus: {
      requirement: FieldRequirementLevel.StronglyRecommended,
    },

    // === Depth Information (Marine-specific) ===
    minimumDepthInMeters: {
      requirement: FieldRequirementLevel.Recommended,
      validators: [
        {
          type: "range",
          enforcement: "recommended",
          params: { min: 0, max: 11000 },
          message: "Depth should be between 0 and 11000 meters (Mariana Trench)",
        },
      ],
    },

    maximumDepthInMeters: {
      requirement: FieldRequirementLevel.Recommended,
      validators: [
        {
          type: "range",
          enforcement: "recommended",
          params: { min: 0, max: 11000 },
          message: "Depth should be between 0 and 11000 meters",
        },
      ],
    },

    // === Dataset/Record Metadata ===
    datasetName: {
      requirement: FieldRequirementLevel.Recommended,
    },

    institutionCode: {
      requirement: FieldRequirementLevel.Recommended,
    },

    collectionCode: {
      requirement: FieldRequirementLevel.Recommended,
    },

    // === Location Details ===
    country: {
      requirement: FieldRequirementLevel.Recommended,
    },

    countryCode: {
      requirement: FieldRequirementLevel.Recommended,
    },

    locality: {
      requirement: FieldRequirementLevel.Recommended,
    },

    waterBody: {
      requirement: FieldRequirementLevel.Recommended,
    },
  },

  metadata: {
    createdAt: new Date("2024-10-06"),
    updatedAt: new Date("2024-10-06"),
    author: "DarwinKit",
  },
};

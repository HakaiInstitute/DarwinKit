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

import type { ValidationProfile } from "../../schemas/validation-profile.ts";
import { FieldRequirementLevel } from "../../schemas/validation-profile.ts";

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
  extends: "Event", // Inherit field definitions from Event core
  documentationUrl: "https://manual.obis.org/",
  version: "2024",

  fieldOverrides: {
    // === Geographic Location (Required for all OBIS data) ===
    decimalLatitude: {
      requirement: FieldRequirementLevel.Required,
      constraints: [
        {
          type: "range",
          min: -90,
          max: 90,
          inclusive: true,
          message: "Latitude must be between -90 and 90 degrees",
        },
      ],
    },

    decimalLongitude: {
      requirement: FieldRequirementLevel.Required,
      constraints: [
        {
          type: "range",
          min: -180,
          max: 180,
          inclusive: true,
          message: "Longitude must be between -180 and 180 degrees",
        },
      ],
    },

    geodeticDatum: {
      requirement: FieldRequirementLevel.Required,
      constraints: [
        {
          type: "required",
          enforcement: "required",
          allowEmpty: false,
          allowWhitespace: false,
          message: "OBIS requires geodeticDatum (e.g., WGS84, EPSG:4326)",
        },
      ],
    },

    coordinateUncertaintyInMeters: {
      requirement: FieldRequirementLevel.StronglyRecommended,
      constraints: [
        {
          type: "range",
          min: 0,
          inclusive: true,
          message: "Coordinate uncertainty should be a positive number",
        },
      ],
    },

    // === Temporal Information ===
    eventDate: {
      requirement: FieldRequirementLevel.Required,
      constraints: [
        {
          type: "format",
          format: "iso8601",
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
      constraints: [
        {
          type: "required",
          enforcement: "recommended",
          allowEmpty: false,
          allowWhitespace: false,
          message: "Scientific name is strongly recommended for taxonomic identification",
        },
      ],
    },

    scientificNameID: {
      requirement: FieldRequirementLevel.StronglyRecommended,
      constraints: [
        {
          type: "format",
          format: "url",
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
      constraints: [
        {
          type: "range",
          min: 0,
          max: 11000,
          inclusive: true,
          message: "Depth should be between 0 and 11000 meters (Mariana Trench)",
        },
      ],
    },

    maximumDepthInMeters: {
      requirement: FieldRequirementLevel.Recommended,
      constraints: [
        {
          type: "range",
          min: 0,
          max: 11000,
          inclusive: true,
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

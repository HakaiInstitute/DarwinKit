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
      requirement: "required",
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
      requirement: "required",
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
      requirement: "required",
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
      requirement: "recommended",
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
      requirement: "required",
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
      requirement: "recommended",
    },

    month: {
      requirement: "optional",
    },

    day: {
      requirement: "optional",
    },

    // === Taxonomic Information ===
    scientificName: {
      requirement: "recommended",
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
      requirement: "recommended",
      constraints: [
        {
          type: "format",
          format: "url",
          message: "Scientific name ID should be a valid URI (e.g., WoRMS LSID)",
        },
      ],
    },

    kingdom: {
      requirement: "optional",
    },

    // === Occurrence Information ===
    basisOfRecord: {
      requirement: "recommended",
    },

    occurrenceStatus: {
      requirement: "recommended",
    },

    // === Depth Information (Marine-specific) ===
    minimumDepthInMeters: {
      requirement: "optional",
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
      requirement: "optional",
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
      requirement: "optional",
    },

    institutionCode: {
      requirement: "optional",
    },

    collectionCode: {
      requirement: "optional",
    },

    // === Location Details ===
    country: {
      requirement: "optional",
    },

    countryCode: {
      requirement: "optional",
    },

    locality: {
      requirement: "optional",
    },

    waterBody: {
      requirement: "optional",
    },
  },

  metadata: {
    createdAt: new Date("2024-10-06"),
    updatedAt: new Date("2024-10-06"),
    author: "DarwinKit",
  },
};

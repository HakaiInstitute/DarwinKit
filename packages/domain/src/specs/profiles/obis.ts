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
      requirement: "required",
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
      requirement: "required",
      validators: [
        {
          type: "required",
          enforcement: "required",
          message: "OBIS requires geodeticDatum (e.g., WGS84, EPSG:4326)",
        },
      ],
    },

    coordinateUncertaintyInMeters: {
      requirement: "strongly-recommended",
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
      requirement: "required",
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
      requirement: "strongly-recommended",
    },

    month: {
      requirement: "recommended",
    },

    day: {
      requirement: "recommended",
    },

    // === Taxonomic Information ===
    scientificName: {
      requirement: "strongly-recommended",
      validators: [
        {
          type: "required",
          enforcement: "recommended",
          message: "Scientific name is strongly recommended for taxonomic identification",
        },
      ],
    },

    scientificNameID: {
      requirement: "strongly-recommended",
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
      requirement: "recommended",
    },

    // === Occurrence Information ===
    basisOfRecord: {
      requirement: "strongly-recommended",
    },

    occurrenceStatus: {
      requirement: "strongly-recommended",
    },

    // === Depth Information (Marine-specific) ===
    minimumDepthInMeters: {
      requirement: "recommended",
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
      requirement: "recommended",
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
      requirement: "recommended",
    },

    institutionCode: {
      requirement: "recommended",
    },

    collectionCode: {
      requirement: "recommended",
    },

    // === Location Details ===
    country: {
      requirement: "recommended",
    },

    countryCode: {
      requirement: "recommended",
    },

    locality: {
      requirement: "recommended",
    },

    waterBody: {
      requirement: "recommended",
    },
  },

  metadata: {
    createdAt: new Date("2024-10-06"),
    updatedAt: new Date("2024-10-06"),
    author: "DarwinKit",
  },
};

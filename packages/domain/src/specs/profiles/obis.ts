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

import type { Profile } from "../../schemas/validation-profile.ts";
import { FormatConstraint, RangeConstraint, RequiredConstraint } from "../constraints.ts";

export const OBIS_BASE_PROFILE: Profile = {
  id: "obis",
  name: "OBIS Base Requirements",
  description:
    "Core validation requirements for all data to be published to the Ocean Biodiversity Information System (OBIS)",
  extends: "Event",
  documentationUrl: "https://manual.obis.org/",
  version: "2024",

  fieldOverrides: {
    decimalLatitude: {
      requirement: "required",
      constraints: [
        new RangeConstraint({
          min: -90,
          max: 90,
          inclusive: true,
          message: "Latitude must be between -90 and 90 degrees",
        }),
      ],
    },

    decimalLongitude: {
      requirement: "required",
      constraints: [
        new RangeConstraint({
          min: -180,
          max: 180,
          inclusive: true,
          message: "Longitude must be between -180 and 180 degrees",
        }),
      ],
    },

    geodeticDatum: {
      requirement: "required",
      constraints: [
        new RequiredConstraint({
          level: "required",
          allowEmpty: false,
          allowWhitespace: false,
          message: "OBIS requires geodeticDatum (e.g., WGS84, EPSG:4326)",
        }),
      ],
    },

    coordinateUncertaintyInMeters: {
      requirement: "recommended",
      constraints: [
        new RangeConstraint({
          min: 0,
          inclusive: true,
          message: "Coordinate uncertainty should be a positive number",
        }),
      ],
    },

    eventDate: {
      requirement: "required",
      constraints: [
        new FormatConstraint({
          format: "iso8601",
          message:
            "OBIS requires eventDate in ISO 8601 format (YYYY-MM-DD or YYYY-MM-DD/YYYY-MM-DD)",
        }),
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

    scientificName: {
      requirement: "recommended",
      constraints: [
        new RequiredConstraint({
          level: "recommended",
          allowEmpty: false,
          allowWhitespace: false,
          message: "Scientific name is strongly recommended for taxonomic identification",
        }),
      ],
    },

    scientificNameID: {
      requirement: "recommended",
      constraints: [
        new FormatConstraint({
          format: "url",
          message: "Scientific name ID should be a valid URI (e.g., WoRMS LSID)",
        }),
      ],
    },

    kingdom: {
      requirement: "optional",
    },

    basisOfRecord: {
      requirement: "recommended",
    },

    occurrenceStatus: {
      requirement: "recommended",
    },

    minimumDepthInMeters: {
      requirement: "optional",
      constraints: [
        new RangeConstraint({
          min: 0,
          max: 11000,
          inclusive: true,
          message: "Depth should be between 0 and 11000 meters (Mariana Trench)",
        }),
      ],
    },

    maximumDepthInMeters: {
      requirement: "optional",
      constraints: [
        new RangeConstraint({
          min: 0,
          max: 11000,
          inclusive: true,
          message: "Depth should be between 0 and 11000 meters",
        }),
      ],
    },

    datasetName: {
      requirement: "optional",
    },

    institutionCode: {
      requirement: "optional",
    },

    collectionCode: {
      requirement: "optional",
    },

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

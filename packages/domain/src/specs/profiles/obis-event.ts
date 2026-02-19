/**
 * OBIS Event Core Validation Profile
 *
 * Defines validation requirements for Event Core data to be published to OBIS
 * (Ocean Biodiversity Information System).
 *
 * Extends the base OBIS profile with Event-specific requirements.
 *
 * Based on: https://manual.obis.org/format_event.html
 * Version: 2024
 */

import type { ValidationProfile } from "../../schemas/validation-profile.ts";

/**
 * OBIS Event Core Profile
 *
 * Enforces OBIS-specific requirements for Event data, including:
 * - Event identifiers and structure
 * - Hierarchical event relationships
 * - Event-specific metadata
 *
 * Inherits base OBIS requirements for coordinates, dates, and taxonomy.
 */
export const OBIS_EVENT_PROFILE: ValidationProfile = {
  id: "obis-event",
  name: "OBIS Event Core",
  description:
    "Validation requirements for Event Core data to be published to the Ocean Biodiversity Information System (OBIS)",
  targetSchema: "obis",
  extends: "obis", // Inherits all base OBIS requirements
  documentationUrl: "https://manual.obis.org/format_event.html",
  version: "2024",

  fieldOverrides: {
    // === Event Core Fields (Event-specific requirements) ===

    // eventID: Required for Event core
    eventID: {
      requirement: "required",
    },

    // parentEventID: Strongly recommended for hierarchical events
    parentEventID: {
      requirement: "recommended",
    },

    // Event type and metadata
    eventType: {
      requirement: "optional",
    },

    eventRemarks: {
      requirement: "optional",
    },

    // === Location Fields (Event-specific recommendations) ===

    locationID: {
      requirement: "optional",
    },

    locationRemarks: {
      requirement: "optional",
    },

    verbatimCoordinates: {
      requirement: "optional",
    },

    verbatimDepth: {
      requirement: "optional",
    },

    footprintWKT: {
      requirement: "optional",
    },

    stateProvince: {
      requirement: "optional",
    },

    island: {
      requirement: "optional",
    },

    islandGroup: {
      requirement: "optional",
    },

    // === Sampling Protocol (Event-specific) ===

    samplingProtocol: {
      requirement: "recommended",
    },

    sampleSizeValue: {
      requirement: "optional",
    },

    sampleSizeUnit: {
      requirement: "optional",
    },

    samplingEffort: {
      requirement: "optional",
    },
  },

  metadata: {
    createdAt: new Date("2024-10-06"),
    updatedAt: new Date("2024-10-06"),
    author: "DarwinKit",
  },
};

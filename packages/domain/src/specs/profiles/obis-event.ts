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

import type { Profile } from "../../schemas/spec-types.ts";

export const OBIS_EVENT_PROFILE: Profile = {
  id: "obis-event",
  name: "OBIS Event Core",
  description:
    "Validation requirements for Event Core data to be published to the Ocean Biodiversity Information System (OBIS)",
  extends: "obis",
  documentationUrl: "https://manual.obis.org/format_event.html",
  version: "2024",

  fieldOverrides: {
    eventID: {
      requirement: "required",
    },

    parentEventID: {
      requirement: "recommended",
    },

    eventType: {
      requirement: "optional",
    },

    eventRemarks: {
      requirement: "optional",
    },

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

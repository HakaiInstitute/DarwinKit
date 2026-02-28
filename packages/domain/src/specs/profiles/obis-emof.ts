/**
 * OBIS ExtendedMeasurementOrFact (eMoF) Validation Profile
 *
 * Defines validation requirements for eMoF data to be published to OBIS.
 * Extends the base OBIS profile with eMoF-specific requirements.
 *
 * Key rule: At least one of eventID or occurrenceID must be present per row.
 * Neither field is individually required — the oneOfRequired rule handles this.
 *
 * Based on: https://manual.obis.org/format_emof.html
 * Version: 2024
 */

import type { Profile } from "../../schemas/spec-types.ts";
import { OneOfRequiredRule } from "../dataset-rules.ts";

export const OBIS_EMOF_PROFILE: Profile = {
  id: "obis-extendedmeasurementorfact",
  name: "OBIS ExtendedMeasurementOrFact",
  description:
    "Validation requirements for ExtendedMeasurementOrFact data to be published to the Ocean Biodiversity Information System (OBIS)",
  extends: "ExtendedMeasurementOrFact",
  documentationUrl: "https://manual.obis.org/format_emof.html",
  version: "2024",

  fieldOverrides: {
    eventID: {
      requirement: "recommended",
    },
    occurrenceID: {
      requirement: "recommended",
    },
  },

  datasetRules: [
    new OneOfRequiredRule({
      fields: ["eventID", "occurrenceID"],
      level: "required",
      message: 'At least one of "eventID" or "occurrenceID" must be present',
    }),
  ],

  metadata: {
    createdAt: new Date("2024-10-06"),
    updatedAt: new Date("2024-10-06"),
    author: "DarwinKit",
  },
};

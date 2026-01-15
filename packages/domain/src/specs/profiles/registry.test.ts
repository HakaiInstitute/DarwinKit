/**
 * Tests for Profile Registry - resolveDatasetProfile function
 */

import { assertEquals } from "@std/assert";
import type { DatasetConfig } from "../../types/workspace-config.ts";
import { resolveDatasetProfile } from "./registry.ts";

// ============================================================================
// resolveDatasetProfile Tests
// ============================================================================

type ProfileResolutionTestCase = {
  description: string;
  dataset: DatasetConfig;
  expected: {
    id?: string;
    name?: string;
    isUndefined?: boolean;
  };
};

const profileResolutionTestCases: ProfileResolutionTestCase[] = [
  // Explicit profile resolution
  {
    description: "resolves from explicit profile",
    dataset: {
      name: "events",
      spec: "dwc-event",
      path: "./test.csv",
      profile: "obis-event", // Explicit profile takes precedence
      fieldMappings: [],
    },
    expected: {
      id: "obis-event",
      name: "OBIS Event Core",
    },
  },
  {
    description: "explicit profile overrides spec",
    dataset: {
      name: "events",
      spec: "dwc-event", // Would derive "Event"
      path: "./test.csv",
      profile: "obis-event", // But explicit profile takes precedence
      fieldMappings: [],
    },
    expected: {
      id: "obis-event",
      name: "OBIS Event Core",
    },
  },

  // Deriving profile from spec
  {
    description: "derives Event profile from spec",
    dataset: {
      name: "events",
      spec: "dwc-event", // Will derive "Event" profile
      path: "./test.csv",
      fieldMappings: [],
    },
    expected: {
      name: "Event",
    },
  },
  {
    description: "derives Occurrence profile from spec",
    dataset: {
      name: "occurrences",
      spec: "dwc-occurrence", // Will derive "Occurrence" profile
      path: "./test.csv",
      fieldMappings: [],
    },
    expected: {
      name: "Occurrence",
    },
  },
  {
    description: "derives Taxon profile from spec",
    dataset: {
      name: "taxa",
      spec: "dwc-taxon",
      path: "./test.csv",
      fieldMappings: [],
    },
    expected: {
      name: "Taxon",
    },
  },
  {
    description: "derives dnaDerivedData profile from spec",
    dataset: {
      name: "dna",
      spec: "dwc-dnaDerivedData",
      path: "./test.csv",
      fieldMappings: [],
    },
    expected: {
      name: "dnaDerivedData",
    },
  },

  // eMOF (ExtendedMeasurementOrFact) aliases
  {
    description: "handles eMOF alias",
    dataset: {
      name: "measurements",
      spec: "dwc-eMOF", // Alias for ExtendedMeasurementOrFact
      path: "./test.csv",
      fieldMappings: [],
    },
    expected: {
      name: "ExtendedMeasurementOrFact",
    },
  },
  {
    description: "handles extendedMeasurementOrFact full name",
    dataset: {
      name: "measurements",
      spec: "dwc-extendedMeasurementOrFact", // Full name
      path: "./test.csv",
      fieldMappings: [],
    },
    expected: {
      name: "ExtendedMeasurementOrFact",
    },
  },

  // Error cases - undefined results
  {
    description: "returns undefined for invalid spec",
    dataset: {
      name: "unknown",
      spec: "invalid-spec", // Invalid spec identifier
      path: "./test.csv",
      fieldMappings: [],
    },
    expected: {
      isUndefined: true,
    },
  },
  {
    description: "returns undefined for empty spec",
    dataset: {
      name: "events",
      spec: "", // Empty spec
      path: "./test.csv",
      fieldMappings: [],
    },
    expected: {
      isUndefined: true,
    },
  },
];

Deno.test("resolveDatasetProfile", async (t) => {
  for (const testCase of profileResolutionTestCases) {
    await t.step(testCase.description, () => {
      const profile = resolveDatasetProfile(testCase.dataset);

      if (testCase.expected.isUndefined) {
        assertEquals(profile, undefined);
      } else {
        if (testCase.expected.id !== undefined) {
          assertEquals(profile?.id, testCase.expected.id);
        }
        if (testCase.expected.name !== undefined) {
          assertEquals(profile?.name, testCase.expected.name);
        }
      }
    });
  }
});

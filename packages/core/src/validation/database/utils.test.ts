/**
 * Unit tests for validation/database/utils.ts
 *
 * Tests cover:
 * - Table name sanitization for SQL safety
 * - Special character handling
 * - Edge cases
 */

import { assertEquals } from "@std/assert";
import { sanitizeTableName } from "./utils.ts";

// ============================================================================
// sanitizeTableName Tests - Table-Driven Approach
// ============================================================================

/**
 * Test cases for sanitizeTableName function
 * Each case has an input, expected output, and description
 */
const sanitizeTableNameTestCases = [
  // Basic cases
  {
    input: "test123",
    expected: "test123",
    description: "alphanumeric only",
  },
  {
    input: "test_dataset_name",
    expected: "test_dataset_name",
    description: "underscores preserved",
  },
  {
    input: "TestDataSet",
    expected: "TestDataSet",
    description: "mixed case preserved",
  },
  {
    input: "",
    expected: "",
    description: "empty string",
  },

  // Special character replacement
  {
    input: "test-dataset",
    expected: "test_dataset",
    description: "hyphens replaced",
  },
  {
    input: "test dataset name",
    expected: "test_dataset_name",
    description: "spaces replaced",
  },
  {
    input: "test@dataset#name$",
    expected: "test_dataset_name_",
    description: "special characters replaced",
  },
  {
    input: "path/to/dataset.csv",
    expected: "path_to_dataset_csv",
    description: "dots and slashes replaced",
  },
  {
    input: "dataset(2024)",
    expected: "dataset_2024_",
    description: "parentheses replaced",
  },
  {
    input: "test---dataset",
    expected: "test___dataset",
    description: "multiple special chars in a row",
  },
  {
    input: "@#$%^&*()",
    expected: "_________",
    description: "only special characters",
  },

  // Unicode handling
  {
    input: "test_café_dataset",
    expected: "test_caf__dataset",
    description: "unicode characters replaced",
  },

  // Real-world examples
  {
    input: "FC2022-event-data",
    expected: "FC2022_event_data",
    description: "real-world: marine biodiversity survey",
  },
  {
    input: "Marine Survey (2024) - Events",
    expected: "Marine_Survey__2024____Events",
    description: "real-world: spaces and parentheses",
  },
  {
    input: "occurrence_data.csv",
    expected: "occurrence_data_csv",
    description: "real-world: file extension",
  },
];

Deno.test("sanitizeTableName", async (t) => {
  for (const testCase of sanitizeTableNameTestCases) {
    await t.step(testCase.description, () => {
      const result = sanitizeTableName(testCase.input);
      assertEquals(result, testCase.expected);
    });
  }
});

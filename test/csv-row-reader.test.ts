/**
 * Tests for CSV row reader
 */

import {
  assert,
  assertArrayIncludes,
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";
import {
  readCsvFieldValue,
  readCsvFieldValuesBatch,
  readCsvRow,
} from "../packages/core/src/validation/csv-row-reader.ts";
import { expectError, expectSuccess } from "./helpers/effect-test-utils.ts";
import { TEST_DATA_DIR } from "./helpers/paths.ts";

const TEST_CSV_PATH = join(TEST_DATA_DIR, "row-reader-test.csv");

// Create test CSV before tests
async function createTestCsv() {
  const csvContent = `eventID,decimalLatitude,country,notes
E001,45.123,Canada,Normal value
E002,NA,United States,Null value
E003, 91.5 ,Mexico,Whitespace and invalid lat
E004,50.0,Canada,
E005,,United States,Empty lat`;

  await Deno.writeTextFile(TEST_CSV_PATH, csvContent);
}

// Clean up after tests
async function cleanupTestCsv() {
  try {
    await Deno.remove(TEST_CSV_PATH);
  } catch {
    // Ignore if file doesn't exist
  }
}

Deno.test("CSV row reader - single field value", async (t) => {
  await createTestCsv();

  try {
    await t.step("Reads specific field from row 1", async () => {
      await expectSuccess(
        readCsvFieldValue(TEST_CSV_PATH, 1, "eventID"),
        (value) => {
          assertEquals(value, "E001");
        },
      );
    });

    await t.step("Reads null value as string 'NA'", async () => {
      await expectSuccess(
        readCsvFieldValue(TEST_CSV_PATH, 2, "decimalLatitude"),
        (value) => {
          assertEquals(value, "NA");
        },
      );
    });

    await t.step("Preserves whitespace", async () => {
      await expectSuccess(
        readCsvFieldValue(TEST_CSV_PATH, 3, "decimalLatitude"),
        (value) => {
          assertEquals(value, " 91.5 ");
        },
      );
    });

    await t.step("Reads empty value", async () => {
      await expectSuccess(
        readCsvFieldValue(TEST_CSV_PATH, 4, "notes"),
        (value) => {
          assertEquals(value, "");
        },
      );
    });

    await t.step("Reads completely empty cell", async () => {
      await expectSuccess(
        readCsvFieldValue(TEST_CSV_PATH, 5, "decimalLatitude"),
        (value) => {
          assertEquals(value, "");
        },
      );
    });
  } finally {
    await cleanupTestCsv();
  }
});

Deno.test("CSV row reader - multiple fields", async (t) => {
  await createTestCsv();

  try {
    await t.step("Reads multiple fields from same row", async () => {
      const row = await Effect.runPromise(
        readCsvRow(TEST_CSV_PATH, 2, ["eventID", "decimalLatitude", "country"]),
      );

      assertEquals(row.eventID, "E002");
      assertEquals(row.decimalLatitude, "NA");
      assertEquals(row.country, "United States");
    });

    await t.step("Handles empty values in multi-field read", async () => {
      const row = await Effect.runPromise(
        readCsvRow(TEST_CSV_PATH, 5, ["eventID", "decimalLatitude", "notes"]),
      );

      assertEquals(row.eventID, "E005");
      assertEquals(row.decimalLatitude, "");
      assertEquals(row.notes, "Empty lat");
    });
  } finally {
    await cleanupTestCsv();
  }
});

Deno.test("CSV row reader - batch reads", async (t) => {
  await createTestCsv();

  try {
    await t.step("Reads values for multiple rows at once", async () => {
      const values = await Effect.runPromise(
        readCsvFieldValuesBatch(TEST_CSV_PATH, [1, 2, 3], "decimalLatitude"),
      );

      assertEquals(values.size, 3);
      assertEquals(values.get(1), "45.123");
      assertEquals(values.get(2), "NA");
      assertEquals(values.get(3), " 91.5 ");
    });

    await t.step("Returns empty map for empty row list", async () => {
      const values = await Effect.runPromise(
        readCsvFieldValuesBatch(TEST_CSV_PATH, [], "eventID"),
      );

      assertEquals(values.size, 0);
    });

    await t.step("Handles non-contiguous row numbers", async () => {
      const values = await Effect.runPromise(
        readCsvFieldValuesBatch(TEST_CSV_PATH, [1, 3, 5], "country"),
      );

      assertEquals(values.size, 3);
      assertEquals(values.get(1), "Canada");
      assertEquals(values.get(3), "Mexico");
      assertEquals(values.get(5), "United States");
    });
  } finally {
    await cleanupTestCsv();
  }
});

Deno.test("CSV row reader - real data integration", async (t) => {
  const realCsvPath = join(TEST_DATA_DIR, "FC2022_event.csv");

  await t.step("Reads from real FC2022 event data", async () => {
    // This tests against the actual FC2022 data used in example-config
    const value = await Effect.runPromise(
      readCsvFieldValue(realCsvPath, 1, "eventID"),
    );

    // Should read the first eventID from FC2022 data
    assertEquals(typeof value, "string");
    assertExists(value);
    assert(value.length > 0);
  });
});

Deno.test("CSV row reader - error handling: invalid field names", async (t) => {
  await createTestCsv();

  try {
    await t.step("Returns error for non-existent field", async () => {
      await expectError(
        readCsvFieldValue(TEST_CSV_PATH, 1, "nonExistentField"),
        "CsvReadError",
        (error) => {
          // error is automatically typed as CsvReadError!
          assertEquals(error.fieldName, "nonExistentField");
          assert(Array.isArray(error.availableFields));
        },
      );
    });

    await t.step("Provides fuzzy suggestions for typos", async () => {
      await expectError(
        readCsvFieldValue(TEST_CSV_PATH, 1, "eventid"), // lowercase typo
        "CsvReadError",
        (error) => {
          assertEquals(error.fieldName, "eventid");
          assert(Array.isArray(error.suggestions));
          assertArrayIncludes(error.suggestions!, ["eventID"]);
          assertStringIncludes(error.message, "Did you mean");
        },
      );
    });

    await t.step("Suggests closest match for separator variation", async () => {
      await expectError(
        readCsvFieldValue(TEST_CSV_PATH, 1, "decimal_latitude"), // underscore instead of camelCase
        "CsvReadError",
        (error) => {
          assertArrayIncludes(error.suggestions!, ["decimalLatitude"]);
        },
      );
    });

    await t.step("Error in readCsvRow for invalid field", async () => {
      await expectError(
        readCsvRow(TEST_CSV_PATH, 1, ["eventID", "invalidField", "country"]),
        "CsvReadError",
        (error) => {
          assertEquals(error.fieldName, "invalidField");
        },
      );
    });

    await t.step("Error in readCsvFieldValuesBatch for invalid field", async () => {
      await expectError(
        readCsvFieldValuesBatch(TEST_CSV_PATH, [1, 2, 3], "badField"),
        "CsvReadError",
        (error) => {
          assertEquals(error.fieldName, "badField");
        },
      );
    });
  } finally {
    await cleanupTestCsv();
  }
});

Deno.test("CSV row reader - error handling: invalid file paths", async (t) => {
  await t.step("Returns error for non-existent file", async () => {
    await expectError(
      readCsvFieldValue("./non-existent-file.csv", 1, "anyField"),
      "CsvReadError",
      (error) => {
        assertEquals(error.csvPath, "./non-existent-file.csv");
        // Ensure the file path is included in the error message for better UX
        assertStringIncludes(error.message, "./non-existent-file.csv");
      },
    );
  });
});

Deno.test("CSV row reader - error handling: row out of bounds", async (t) => {
  await createTestCsv();

  try {
    await t.step("Returns error when row number exceeds file length", async () => {
      await expectError(
        readCsvFieldValue(TEST_CSV_PATH, 999, "eventID"), // File only has 5 rows
        "CsvReadError",
        (error) => {
          assertEquals(error.rowNumber, 999);
          // Ensure the row number is included in the error message for better UX
          assertStringIncludes(error.message, "999");
        },
      );
    });

    await t.step("Error in readCsvRow for out of bounds row", async () => {
      await expectError(
        readCsvRow(TEST_CSV_PATH, 100, ["eventID", "country"]),
        "CsvReadError",
        (error) => {
          assertEquals(error.rowNumber, 100);
        },
      );
    });
  } finally {
    await cleanupTestCsv();
  }
});

Deno.test("CSV row reader - error messages are helpful", async (t) => {
  await createTestCsv();

  try {
    await t.step("Error message includes suggestions", async () => {
      await expectError(
        readCsvFieldValue(TEST_CSV_PATH, 1, "eventid"),
        "CsvReadError",
        (error) => {
          // Message should help user fix the problem
          assertStringIncludes(error.message, "eventid");
          assertStringIncludes(error.message, "not found");
          assertStringIncludes(error.message, "Did you mean");
          assertStringIncludes(error.message, "eventID");
        },
      );
    });

    await t.step("Error includes all available fields", async () => {
      await expectError(
        readCsvFieldValue(TEST_CSV_PATH, 1, "unknown"),
        "CsvReadError",
        (error) => {
          assertArrayIncludes(error.availableFields!, [
            "eventID",
            "decimalLatitude",
            "country",
            "notes",
          ]);
        },
      );
    });
  } finally {
    await cleanupTestCsv();
  }
});

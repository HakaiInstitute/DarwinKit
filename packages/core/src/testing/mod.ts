/**
 * Testing Utilities Module
 *
 * Provides standardized utilities for testing DarwinKit functionality:
 * - CSV fixture creation and parsing
 * - Temp directory management
 * - Test data generation
 *
 * @module
 */

export {
  // Fixture Helpers
  createCsvFixture,
  // Temp Directory Management
  createTestDirectory,
  type CsvFixture,
  // Data Generation
  generateTestData,
  parseCsvString,
  // CSV Reading
  readCsvFile,
  TEST_DIR_PREFIX,
  // CSV Writing
  toCsvString,
  withTestDirectory,
  writeCsvFile,
  writeCsvFileWithHeaders,
} from "./csv-fixtures.ts";

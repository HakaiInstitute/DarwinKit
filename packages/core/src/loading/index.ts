/**
 * Loading Module
 *
 * Data ingestion utilities for CSV parsing and import.
 *
 * @module loading
 */

// CSV parsing with DuckDB schema inference
export {
  ParsedFileResult,
  ParseError,
  parseFileForWorkspace,
  ParseMetadata,
  type ParseOptions,
} from "./csv-parser.ts";

// CSV import into DuckDB tables
export { getCsvValue, importCsv } from "./csv-import.ts";

// SQL utilities
export {
  formatNullValues,
  type ParsedErrorInfo,
  parseDuckDBError,
  sanitizeTableName,
} from "./sql.ts";

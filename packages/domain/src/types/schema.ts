/**
 * Schema types - derived from Effect schemas
 */

import type * as S from "effect/Schema";
import type { datasetSchemaSchema, fieldSchemaSchema } from "../schemas/schema.ts";

// Field schema derived from DuckDB column metadata
export type FieldSchema = S.Schema.Type<typeof fieldSchemaSchema>;

// Schema for the entire dataset
export type DatasetSchema = S.Schema.Type<typeof datasetSchemaSchema>;

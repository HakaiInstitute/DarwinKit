/**
 * Schema types - derived from Effect schemas
 */

import type { PrimitiveType } from "./common.ts";
import * as S from "effect/Schema";
import { datasetSchemaSchema, fieldSchemaSchema } from "../schemas/schema.ts";

// Field schema derived from DuckDB column metadata
export type FieldSchema = S.Schema.Type<typeof fieldSchemaSchema>;

// Schema for the entire dataset
export type DatasetSchema = S.Schema.Type<typeof datasetSchemaSchema>;

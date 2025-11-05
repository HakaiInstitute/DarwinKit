/**
 * Schema types - pure TypeScript interfaces for shared usage
 */

import type { PrimitiveType } from "./common.ts";

// Field schema derived from DuckDB column metadata
export interface FieldSchema {
  readonly name: string;
  readonly inferredType: string; // Raw DuckDB type string
  readonly primitiveType: PrimitiveType;
  readonly isNullable: boolean;
  readonly defaultValue?: string;
  readonly sampleValues?: ReadonlyArray<string>;
}

// Schema for the entire dataset
// TODO: Should this be represented with Effect Schema/Data so we can extract
// the type from that, then use these tools for parsing efficiently?
export interface DatasetSchema {
  readonly fields: ReadonlyMap<string, FieldSchema>;
  readonly rowCount: number;
  readonly tableName: string;
  readonly inferredAt: Date;
}

// Utility types for schema operations
export interface FieldInfo {
  readonly name: string;
  readonly type: PrimitiveType;
  readonly nullable: boolean;
  readonly samples: ReadonlyArray<string>;
}

export interface SchemaInference {
  readonly success: boolean;
  readonly fields: ReadonlyArray<FieldInfo>;
  readonly errors: ReadonlyArray<string>;
}

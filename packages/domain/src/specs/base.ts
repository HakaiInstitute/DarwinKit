/**
 * Base specification types and interfaces
 */

import * as S from "effect/Schema";
import type { BaseEntity } from "../types/common.ts";
import { optionalString } from "../schemas/util.ts";

/**
 * Core data specification interface
 */
export interface DataSpecification extends BaseEntity {
  readonly name: string;
  readonly version: string;
  readonly namespace: string;
  readonly extensions: readonly string[];
  readonly description?: string;
}

/**
 * Effect Schema for DataSpecification
 */
export const DataSpecificationSchema = S.Struct({
  id: S.String,
  name: S.String,
  version: S.String,
  namespace: S.String,
  extensions: S.Array(S.String),
  description: optionalString,
  createdAt: S.Date,
  updatedAt: S.Date,
});

/**
 * Base specification error for validation failures
 */
export interface SpecificationError {
  readonly code: string;
  readonly message: string;
  readonly fieldName?: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Effect Schema for SpecificationError
 */
export const SpecificationErrorSchema = S.Struct({
  code: S.String,
  message: S.String,
  fieldName: optionalString,
  details: S.optional(S.Record({ key: S.String, value: S.Unknown })),
});

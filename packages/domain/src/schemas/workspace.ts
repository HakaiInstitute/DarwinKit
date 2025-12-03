/**
 * Workspace validation schemas
 */

import * as S from "effect/Schema";
import { datasetSchemaSchema } from "./schema.ts";

export const validFormats = S.Literal("csv", "json");

// Workspace validation schema
export const workspaceSchema = S.Struct({
  id: S.String,
  name: S.String,
  description: S.optional(S.String),
  filePath: S.String,
  format: validFormats,
  schema: datasetSchemaSchema,
  createdAt: S.Date,
  updatedAt: S.Date,
  workspaceDir: S.String,
  dataTableName: S.String,
});

// Workspace info validation schema
export const workspaceInfoSchema = S.Struct({
  id: S.String,
  name: S.String,
  description: S.optional(S.String),
  filePath: S.String,
  format: validFormats,
  rowCount: S.Number,
  fieldCount: S.Number,
  createdAt: S.Date,
  updatedAt: S.Date,
});

// Workspace creation input validation
export const createWorkspaceInputSchema = S.Struct({
  name: S.String.pipe(S.minLength(1)),
  description: S.optional(S.String),
  filePath: S.String.pipe(S.minLength(1)),
});

// Workspace creation options validation
export const createWorkspaceOptionsSchema = S.Struct({
  name: S.String.pipe(S.minLength(1)),
  description: S.optional(S.String),
  filePath: S.String.pipe(S.minLength(1)),
  parseOptions: S.optional(S.Struct({
    sampleSize: S.optional(S.Number),
    maxRows: S.optional(S.Number),
  })),
});

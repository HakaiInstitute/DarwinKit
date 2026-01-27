/**
 * Effect Schema definitions for file-based validation configuration
 */

import * as S from "effect/Schema";

// Validation result schemas
export const validationSummarySchema = S.Struct({
  status: S.Literal("pass", "warn", "fail"),
  errorCount: S.Number,
  warningCount: S.Number,
  criticalErrors: S.Array(S.String),
});

export const nullConversionSchema = S.Struct({
  fieldName: S.String,
  originalValues: S.Array(S.String),
  convertedCount: S.Number,
});

export const typeFailureSchema = S.Struct({
  fieldName: S.String,
  expectedType: S.String,
  failures: S.Array(S.Struct({
    rowNumber: S.Number,
    originalValue: S.String,
    errorMessage: S.String,
  })),
});

export const parseValidationResultSchema = S.Struct({
  rowsProcessed: S.Number,
  nullConversions: S.Array(nullConversionSchema),
  typeFailures: S.Array(typeFailureSchema),
});

export const fieldErrorSchema = S.Struct({
  fieldName: S.String,
  errorType: S.String,
  message: S.String,
  affectedRows: S.Array(S.Number),
  severity: S.Literal("error", "warning"),
});

export const coordinateWarningSchema = S.Struct({
  fieldName: S.String,
  message: S.String,
  affectedRows: S.Array(S.Struct({
    rowNumber: S.Number,
    latitude: S.optional(S.Number),
    longitude: S.optional(S.Number),
  })),
});

export const dateErrorSchema = S.Struct({
  fieldName: S.String,
  message: S.String,
  affectedRows: S.Array(S.Struct({
    rowNumber: S.Number,
    originalValue: S.String,
    parseError: S.String,
  })),
});

export const vocabularyErrorSchema = S.Struct({
  fieldName: S.String,
  invalidValues: S.Array(S.Struct({
    value: S.String,
    rowNumbers: S.Array(S.Number),
    suggestedValues: S.optional(S.Array(S.String)),
  })),
});

export const darwinCoreValidationResultSchema = S.Struct({
  requiredFieldErrors: S.Array(fieldErrorSchema),
  coordinateWarnings: S.Array(coordinateWarningSchema),
  dateErrors: S.Array(dateErrorSchema),
  vocabularyErrors: S.Array(vocabularyErrorSchema),
});

export const fileValidationContextSchema = S.Struct({
  filePath: S.String,
  fileName: S.String,
  schemaUsed: S.String,
  validatedAt: S.Date,
  processingTimeMs: S.Number,
  parsing: parseValidationResultSchema,
  darwinCore: darwinCoreValidationResultSchema,
  summary: validationSummarySchema,
});

export const repositoryValidationResultsSchema = S.Struct({
  configUsed: S.String,
  validatedAt: S.Date,
  totalFiles: S.Number,
  totalProcessingTimeMs: S.Number,
  fileResults: S.Record({ key: S.String, value: fileValidationContextSchema }),
  summary: S.Struct({
    overallStatus: S.Literal("pass", "warn", "fail"),
    filesPassedCount: S.Number,
    filesWithWarningsCount: S.Number,
    filesFailedCount: S.Number,
    totalErrors: S.Number,
    totalWarnings: S.Number,
  }),
});

// Export TypeScript types from schemas
export type FileValidationContext = S.Schema.Type<
  typeof fileValidationContextSchema
>;
export type RepositoryValidationResults = S.Schema.Type<
  typeof repositoryValidationResultsSchema
>;

// Export validation result component types
export type ValidationSummary = S.Schema.Type<typeof validationSummarySchema>;
export type NullConversion = S.Schema.Type<typeof nullConversionSchema>;
export type TypeFailure = S.Schema.Type<typeof typeFailureSchema>;
export type ParseValidationResult = S.Schema.Type<
  typeof parseValidationResultSchema
>;
export type FieldError = S.Schema.Type<typeof fieldErrorSchema>;
export type CoordinateWarning = S.Schema.Type<typeof coordinateWarningSchema>;
export type DateError = S.Schema.Type<typeof dateErrorSchema>;
export type VocabularyError = S.Schema.Type<typeof vocabularyErrorSchema>;
export type DarwinCoreValidationResult = S.Schema.Type<
  typeof darwinCoreValidationResultSchema
>;

export interface ValidationError {
  readonly message: string;
  readonly filePath?: string;
  readonly details?: Record<string, unknown>;
  readonly cause?: Error;
}

import type { DatasetValidationResult, WorkspaceValidationResult } from '@dwkt/domain/types';
import { MissingFieldViolation } from '@dwkt/domain/types';
import { assertEquals, assertStringIncludes } from '@std/assert';
import { renderValidationMarkdown } from './markdown-renderer.ts';

// --- Test Data Factories ---

function makeFieldViolation(overrides: Partial<{
  fieldName: string;
  targetName: string;
  rowNumber: number;
  value: string;
  errorMessage: string;
  severity: 'error' | 'warning' | 'info';
}> = {}) {
  return {
    _tag: 'RangeViolation' as const,
    severity: overrides.severity ?? 'error',
    fieldName: overrides.fieldName ?? 'decimalLatitude',
    targetName: overrides.targetName ?? 'decimalLatitude',
    rowNumber: overrides.rowNumber ?? 1,
    value: overrides.value ?? '-100',
    errorMessage: overrides.errorMessage ?? 'Value -100 out of range [-90, 90]',
  };
}

function makeSchemaViolation(overrides: Partial<{
  fieldName: string;
  targetName: string;
  errorMessage: string;
  severity: 'error' | 'warning' | 'info';
}> = {}) {
  return new MissingFieldViolation({
    severity: overrides.severity ?? 'error',
    fieldName: overrides.fieldName ?? 'eventDate',
    targetName: overrides.targetName ?? 'eventDate',
    errorMessage: overrides.errorMessage ?? 'Missing required field: eventDate',
    reason: 'not_in_csv',
  });
}

function makeEmptyPartitioned<T>(): { errors: T[]; warnings: T[]; info: T[] } {
  return { errors: [], warnings: [], info: [] };
}

function makeCleanDataset(
  overrides: Partial<DatasetValidationResult> = {},
): DatasetValidationResult {
  return {
    datasetName: overrides.datasetName ?? 'events',
    class: overrides.class ?? 'dwc-event',
    filePath: overrides.filePath ?? './data/events.csv',
    rowsProcessed: overrides.rowsProcessed ?? 100,
    processingTimeMs: overrides.processingTimeMs ?? 50,
    status: overrides.status ?? 'pass',
    schemaViolations: overrides.schemaViolations ?? makeEmptyPartitioned(),
    fieldViolations: overrides.fieldViolations ?? makeEmptyPartitioned(),
  };
}

function makeResults(
  overrides: Partial<WorkspaceValidationResult> = {},
): WorkspaceValidationResult {
  return {
    workspaceId: overrides.workspaceId ?? 'test-workspace',
    configPath: overrides.configPath ?? '/path/to/darwinkit.yaml',
    validatedAt: overrides.validatedAt ?? new Date('2026-01-15T10:00:00Z'),
    totalProcessingTimeMs: overrides.totalProcessingTimeMs ?? 150,
    overallStatus: overrides.overallStatus ?? 'pass',
    datasetResults: overrides.datasetResults ?? [makeCleanDataset()],
    summary: overrides.summary ?? {
      totalDatasets: 1,
      datasetsPassedCount: 1,
      datasetsWithWarningsCount: 0,
      datasetsFailedCount: 0,
      totalErrors: 0,
      totalWarnings: 0,
      totalInfo: 0,
      totalRowsProcessed: 100,
    },
  };
}

// --- renderValidationMarkdown ---

Deno.test('clean results - renders header, summary table, and overall summary', () => {
  const result = renderValidationMarkdown(makeResults());
  assertStringIncludes(result, '# 📂 Workspace Validation Results');
  assertStringIncludes(result, '`/path/to/darwinkit.yaml`');
  assertStringIncludes(result, '## Summary Table');
  assertStringIncludes(result, '✅ PASS');
  assertStringIncludes(result, '## 📊 Overall Summary');
  assertEquals(result.includes('### ❌ ERRORS'), false);
});

Deno.test('violations - renders all severity sections with grouped field errors', () => {
  const dataset = makeCleanDataset({
    datasetName: 'occurrences',
    class: 'dwc-occurrence',
    status: 'fail',
    schemaViolations: {
      errors: [makeSchemaViolation({ fieldName: 'eventDate' })],
      warnings: [],
      info: [],
    },
    fieldViolations: {
      errors: [
        makeFieldViolation({ fieldName: 'lat', rowNumber: 1, errorMessage: 'bad lat row 1' }),
        makeFieldViolation({ fieldName: 'lat', rowNumber: 2, errorMessage: 'bad lat row 2' }),
      ],
      warnings: [makeFieldViolation({ severity: 'warning' })],
      info: [makeFieldViolation({ severity: 'info' })],
    },
  });
  const result = renderValidationMarkdown(makeResults({
    datasetResults: [dataset],
    summary: {
      totalDatasets: 1,
      datasetsPassedCount: 0,
      datasetsWithWarningsCount: 0,
      datasetsFailedCount: 1,
      totalErrors: 3,
      totalWarnings: 1,
      totalInfo: 1,
      totalRowsProcessed: 100,
    },
  }));
  // Dataset detail section appears
  assertStringIncludes(result, '## 📊 occurrences (dwc-occurrence)');
  // All severity sections
  assertStringIncludes(result, '### ❌ ERRORS');
  assertStringIncludes(result, '### ⚠️ WARNINGS');
  assertStringIncludes(result, '### ℹ️ INFO');
  // Schema violation content
  assertStringIncludes(result, '**eventDate:**');
  // Field violations grouped
  assertStringIncludes(result, '**lat** (RangeViolation): 2 violations');
  // Summary table shows counts
  assertStringIncludes(result, '❌ FAIL');
  assertStringIncludes(result, '**❌ Errors:** 3');
});

Deno.test('field violation truncation - shows first 3 examples then truncation message', () => {
  const violations = Array.from(
    { length: 6 },
    (_, i) => makeFieldViolation({ fieldName: 'lat', rowNumber: i + 1 }),
  );
  const dataset = makeCleanDataset({
    fieldViolations: { errors: violations, warnings: [], info: [] },
  });
  const result = renderValidationMarkdown(makeResults({ datasetResults: [dataset] }));
  assertStringIncludes(result, 'Row 1:');
  assertStringIncludes(result, 'Row 3:');
  assertStringIncludes(result, '... and 3 more violations');
  assertEquals(result.includes('Row 4:'), false);
});

import { assertEquals, assertStringIncludes } from '@std/assert';
import type {
  CrossDatasetValidationResult,
  DatasetValidationResult,
  WorkspaceValidationResult,
} from '@dwkt/domain/types';
import { CrossDatasetViolation, MissingFieldViolation } from '@dwkt/domain/types';
import {
  getStatusIcon,
  renderCrossDatasetResults,
  renderDatasetDetails,
  renderHeader,
  renderOverallSummary,
  renderSummaryTable,
  renderValidationMarkdown,
  renderViolationSection,
} from './markdown-renderer.ts';

// --- Test Data Factories ---

function makeFieldViolation(overrides: Partial<{
  fieldName: string;
  targetName: string;
  rowNumber: number;
  value: string;
  errorMessage: string;
  validatorType: string;
  enforcement: 'required' | 'recommended' | 'optional';
  severity: 'error' | 'warning' | 'info';
}> = {}) {
  return {
    _tag: 'RangeViolation' as const,
    enforcement: overrides.enforcement ?? 'required',
    severity: overrides.severity ?? 'error',
    fieldName: overrides.fieldName ?? 'decimalLatitude',
    targetName: overrides.targetName ?? 'decimalLatitude',
    rowNumber: overrides.rowNumber ?? 1,
    value: overrides.value ?? '-100',
    errorMessage: overrides.errorMessage ?? 'Value -100 out of range [-90, 90]',
    validatorType: overrides.validatorType ?? 'rangeCheck',
  };
}

function makeSchemaViolation(overrides: Partial<{
  fieldName: string;
  targetName: string;
  errorMessage: string;
  enforcement: 'required' | 'recommended' | 'optional';
  severity: 'error' | 'warning' | 'info';
}> = {}) {
  return new MissingFieldViolation({
    enforcement: overrides.enforcement ?? 'required',
    severity: overrides.severity ?? 'error',
    fieldName: overrides.fieldName ?? 'eventDate',
    targetName: overrides.targetName ?? 'eventDate',
    errorMessage: overrides.errorMessage ?? 'Missing required field: eventDate',
    validatorType: 'schema',
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
    spec: overrides.spec ?? 'dwc-event',
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
    crossDatasetResults: overrides.crossDatasetResults ?? [],
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

// --- getStatusIcon ---

Deno.test('getStatusIcon - maps status to correct emoji', () => {
  assertEquals(getStatusIcon('pass'), '✅');
  assertEquals(getStatusIcon('warn'), '⚠️');
  assertEquals(getStatusIcon('fail'), '❌');
  assertEquals(getStatusIcon('other'), '❓');
});

// --- renderHeader ---

Deno.test('renderHeader - includes title, config path, and date', () => {
  const result = renderHeader('/my/config.yaml');
  assertStringIncludes(result, '# 📂 Workspace Validation Results');
  assertStringIncludes(result, '`/my/config.yaml`');
  assertStringIncludes(result, '**Validation Date:**');
});

// --- renderSummaryTable ---

Deno.test('renderSummaryTable - renders table with dataset row', () => {
  const dataset = makeCleanDataset({
    datasetName: 'my_events',
    spec: 'dwc-event',
    status: 'fail',
    schemaViolations: {
      errors: [makeSchemaViolation()],
      warnings: [],
      info: [],
    },
    fieldViolations: {
      errors: [makeFieldViolation(), makeFieldViolation({ rowNumber: 2 })],
      warnings: [
        makeFieldViolation({ enforcement: 'recommended', severity: 'warning' }),
      ],
      info: [],
    },
  });
  const result = renderSummaryTable([dataset]);
  assertStringIncludes(result, '| Dataset | Spec | Status | Errors | Warnings | Info |');
  assertStringIncludes(result, '| my_events |');
  assertStringIncludes(result, '| dwc-event |');
  assertStringIncludes(result, '❌ FAIL');
  // 1 schema error + 2 field errors = 3
  assertStringIncludes(result, '| 3 |');
  // 1 field warning
  assertStringIncludes(result, '| 1 |');
});

// --- renderViolationSection ---

Deno.test('renderViolationSection - returns empty for no violations', () => {
  assertEquals(renderViolationSection('ERRORS', '❌', [], []), '');
});

Deno.test('renderViolationSection - renders schema violations', () => {
  const result = renderViolationSection(
    'ERRORS',
    '❌',
    [makeSchemaViolation({
      fieldName: 'eventDate',
      errorMessage: 'Missing required field',
    })],
    [],
  );
  assertStringIncludes(result, '### ❌ ERRORS (1)');
  assertStringIncludes(result, '**Schema Issues:**');
  assertStringIncludes(result, '**eventDate:**');
  assertStringIncludes(result, 'Missing required field');
});

Deno.test('renderViolationSection - groups field violations by field', () => {
  const violations = [
    makeFieldViolation({ fieldName: 'lat', rowNumber: 1, errorMessage: 'Row 1 bad' }),
    makeFieldViolation({ fieldName: 'lat', rowNumber: 2, errorMessage: 'Row 2 bad' }),
    makeFieldViolation({ fieldName: 'lon', rowNumber: 3, errorMessage: 'Row 3 bad' }),
  ];
  const result = renderViolationSection('ERRORS', '❌', [], violations);
  assertStringIncludes(result, '**Data Validation Errors:**');
  assertStringIncludes(result, '**lat** (rangeCheck): 2 violations');
  assertStringIncludes(result, '**lon** (rangeCheck): 1 violations');
});

Deno.test('renderViolationSection - truncates after 3 examples per field', () => {
  const violations = Array.from(
    { length: 5 },
    (_, i) => makeFieldViolation({ fieldName: 'lat', rowNumber: i + 1 }),
  );
  const result = renderViolationSection('ERRORS', '❌', [], violations);
  assertStringIncludes(result, '... and 2 more violations');
});

Deno.test('renderViolationSection - no truncation for 3 or fewer', () => {
  const violations = [
    makeFieldViolation({ fieldName: 'lat', rowNumber: 1 }),
    makeFieldViolation({ fieldName: 'lat', rowNumber: 2 }),
  ];
  const result = renderViolationSection('ERRORS', '❌', [], violations);
  assertEquals(result.includes('... and'), false);
});

// --- renderDatasetDetails ---

Deno.test('renderDatasetDetails - returns empty for clean dataset', () => {
  assertEquals(renderDatasetDetails(makeCleanDataset()), '');
});

Deno.test('renderDatasetDetails - renders heading and all severity sections', () => {
  const dataset = makeCleanDataset({
    datasetName: 'occurrences',
    spec: 'dwc-occurrence',
    schemaViolations: {
      errors: [makeSchemaViolation()],
      warnings: [],
      info: [],
    },
    fieldViolations: {
      errors: [],
      warnings: [makeFieldViolation({ enforcement: 'recommended', severity: 'warning' })],
      info: [makeFieldViolation({ enforcement: 'optional', severity: 'info' })],
    },
  });
  const result = renderDatasetDetails(dataset);
  assertStringIncludes(result, '## 📊 occurrences (dwc-occurrence)');
  assertStringIncludes(result, '### ❌ ERRORS');
  assertStringIncludes(result, '### ⚠️ WARNINGS');
  assertStringIncludes(result, '### ℹ️ INFO');
});

// --- renderCrossDatasetResults ---

Deno.test('renderCrossDatasetResults - returns empty for no results', () => {
  assertEquals(renderCrossDatasetResults([]), '');
});

Deno.test('renderCrossDatasetResults - shows valid FK', () => {
  const crossResult: CrossDatasetValidationResult = {
    ruleType: 'foreignKey',
    sourceDataset: 'occurrences',
    sourceField: 'eventID',
    targetDataset: 'events',
    targetField: 'eventID',
    violations: [],
  };
  const result = renderCrossDatasetResults([crossResult]);
  assertStringIncludes(result, '✅ Foreign Key Valid');
  assertStringIncludes(result, '**occurrences.eventID**');
  assertStringIncludes(result, '**events.eventID**');
});

Deno.test('renderCrossDatasetResults - shows FK violations', () => {
  const crossResult: CrossDatasetValidationResult = {
    ruleType: 'foreignKey',
    sourceDataset: 'occurrences',
    sourceField: 'eventID',
    targetDataset: 'events',
    targetField: 'eventID',
    violations: [
      new CrossDatasetViolation({
        enforcement: 'required',
        severity: 'error',
        fieldName: 'eventID',
        targetName: 'eventID',
        rowNumber: 5,
        value: 'EVT-999',
        errorMessage: 'Foreign key not found: EVT-999',
        validatorType: 'foreignKey',
      }),
    ],
  };
  const result = renderCrossDatasetResults([crossResult]);
  assertStringIncludes(result, '❌ Foreign Key Violation');
  assertStringIncludes(result, 'Row 5:');
});

Deno.test('renderCrossDatasetResults - truncates after 5 violations', () => {
  const violations = Array.from({ length: 8 }, (_, i) =>
    new CrossDatasetViolation({
      enforcement: 'required',
      severity: 'error',
      fieldName: 'eventID',
      targetName: 'eventID',
      rowNumber: i + 1,
      value: `EVT-${i}`,
      errorMessage: `Foreign key not found: EVT-${i}`,
      validatorType: 'foreignKey',
    }));
  const crossResult: CrossDatasetValidationResult = {
    ruleType: 'foreignKey',
    sourceDataset: 'occ',
    sourceField: 'eventID',
    targetDataset: 'events',
    targetField: 'eventID',
    violations,
  };
  const result = renderCrossDatasetResults([crossResult]);
  assertStringIncludes(result, '... and 3 more violations');
});

// --- renderOverallSummary ---

Deno.test('renderOverallSummary - renders all summary fields', () => {
  const summary = {
    totalDatasets: 3,
    datasetsPassedCount: 1,
    datasetsWithWarningsCount: 1,
    datasetsFailedCount: 1,
    totalErrors: 10,
    totalWarnings: 5,
    totalInfo: 3,
    totalRowsProcessed: 500,
  };
  const result = renderOverallSummary(summary, 42);
  assertStringIncludes(result, '## 📊 Overall Summary');
  assertStringIncludes(result, '**Datasets processed:** 3');
  assertStringIncludes(result, '**Passed:** 1');
  assertStringIncludes(result, '**Warnings:** 1');
  assertStringIncludes(result, '**Failed:** 1');
  assertStringIncludes(result, '**❌ Errors:** 10');
  assertStringIncludes(result, '**⚠️ Warnings:** 5');
  assertStringIncludes(result, '**ℹ️ Info:** 3');
  assertStringIncludes(result, '**Total rows processed:** 500');
  assertStringIncludes(result, '**Processing time:** 42ms');
});

// --- renderValidationMarkdown ---

Deno.test('renderValidationMarkdown - includes all sections for clean results', () => {
  const result = renderValidationMarkdown(makeResults());
  assertStringIncludes(result, '# 📂 Workspace Validation Results');
  assertStringIncludes(result, '## Summary Table');
  assertStringIncludes(result, '## 📊 Overall Summary');
});

Deno.test('renderValidationMarkdown - omits cross-dataset section when empty', () => {
  const result = renderValidationMarkdown(makeResults({ crossDatasetResults: [] }));
  assertEquals(result.includes('Cross-dataset'), false);
});

Deno.test('renderValidationMarkdown - includes dataset details when violations exist', () => {
  const dataset = makeCleanDataset({
    datasetName: 'test_data',
    spec: 'dwc-event',
    fieldViolations: {
      errors: [makeFieldViolation()],
      warnings: [],
      info: [],
    },
  });
  const result = renderValidationMarkdown(makeResults({ datasetResults: [dataset] }));
  assertStringIncludes(result, '## 📊 test_data (dwc-event)');
  assertStringIncludes(result, '### ❌ ERRORS');
});

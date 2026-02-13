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

Deno.test('test factory - makeResults returns valid structure', () => {
  const results = makeResults();
  assertEquals(results.overallStatus, 'pass');
  assertEquals(results.datasetResults.length, 1);
});

// --- getStatusIcon tests ---

Deno.test('getStatusIcon - pass returns check', () => {
  assertEquals(getStatusIcon('pass'), '✅');
});

Deno.test('getStatusIcon - warn returns warning', () => {
  assertEquals(getStatusIcon('warn'), '⚠️');
});

Deno.test('getStatusIcon - fail returns x', () => {
  assertEquals(getStatusIcon('fail'), '❌');
});

Deno.test('getStatusIcon - unknown returns question', () => {
  assertEquals(getStatusIcon('other'), '❓');
});

// --- renderHeader tests ---

Deno.test('renderHeader - includes config path', () => {
  const result = renderHeader('/my/config.yaml');
  assertStringIncludes(result, '`/my/config.yaml`');
});

Deno.test('renderHeader - includes title', () => {
  const result = renderHeader('/any/path');
  assertStringIncludes(result, '# 📂 Workspace Validation Results');
});

Deno.test('renderHeader - includes validation date', () => {
  const result = renderHeader('/any/path');
  assertStringIncludes(result, '**Validation Date:**');
});

// --- renderSummaryTable tests ---

Deno.test('renderSummaryTable - includes table header', () => {
  const result = renderSummaryTable([makeCleanDataset()]);
  assertStringIncludes(
    result,
    '| Dataset | Spec | Status | Errors | Warnings | Info |',
  );
});

Deno.test('renderSummaryTable - includes dataset row', () => {
  const result = renderSummaryTable([
    makeCleanDataset({ datasetName: 'my_events', spec: 'dwc-event' }),
  ]);
  assertStringIncludes(result, '| my_events |');
  assertStringIncludes(result, '| dwc-event |');
});

Deno.test('renderSummaryTable - shows correct violation counts', () => {
  const dataset = makeCleanDataset({
    schemaViolations: {
      errors: [makeSchemaViolation()],
      warnings: [],
      info: [],
    },
    fieldViolations: {
      errors: [makeFieldViolation(), makeFieldViolation({ rowNumber: 2 })],
      warnings: [
        makeFieldViolation({
          enforcement: 'recommended',
          severity: 'warning',
        }),
      ],
      info: [],
    },
  });
  const result = renderSummaryTable([dataset]);
  // 1 schema error + 2 field errors = 3 errors
  assertStringIncludes(result, '| 3 |');
  // 1 field warning
  assertStringIncludes(result, '| 1 |');
});

Deno.test('renderSummaryTable - shows status icon', () => {
  const result = renderSummaryTable([makeCleanDataset({ status: 'fail' })]);
  assertStringIncludes(result, '❌ FAIL');
});

// --- renderViolationSection tests ---

Deno.test('renderViolationSection - returns empty for no violations', () => {
  const result = renderViolationSection('ERRORS', '❌', [], []);
  assertEquals(result, '');
});

Deno.test('renderViolationSection - includes title with count', () => {
  const result = renderViolationSection(
    'ERRORS',
    '❌',
    [makeSchemaViolation()],
    [],
  );
  assertStringIncludes(result, '### ❌ ERRORS (1)');
});

Deno.test('renderViolationSection - shows schema violations', () => {
  const result = renderViolationSection(
    'ERRORS',
    '❌',
    [
      makeSchemaViolation({
        fieldName: 'eventDate',
        errorMessage: 'Missing required field',
      }),
    ],
    [],
  );
  assertStringIncludes(result, '**Schema Issues:**');
  assertStringIncludes(result, '**eventDate:**');
  assertStringIncludes(result, 'Missing required field');
});

Deno.test('renderViolationSection - shows field violations grouped by field', () => {
  const violations = [
    makeFieldViolation({
      fieldName: 'lat',
      rowNumber: 1,
      errorMessage: 'Row 1 bad',
    }),
    makeFieldViolation({
      fieldName: 'lat',
      rowNumber: 2,
      errorMessage: 'Row 2 bad',
    }),
    makeFieldViolation({
      fieldName: 'lon',
      rowNumber: 3,
      errorMessage: 'Row 3 bad',
    }),
  ];
  const result = renderViolationSection('ERRORS', '❌', [], violations);
  assertStringIncludes(result, '**Data Validation Errors:**');
  assertStringIncludes(result, '**lat** (rangeCheck): 2 violations');
  assertStringIncludes(result, '**lon** (rangeCheck): 1 violations');
});

Deno.test('renderViolationSection - truncates after 3 examples', () => {
  const violations = [
    makeFieldViolation({ fieldName: 'lat', rowNumber: 1 }),
    makeFieldViolation({ fieldName: 'lat', rowNumber: 2 }),
    makeFieldViolation({ fieldName: 'lat', rowNumber: 3 }),
    makeFieldViolation({ fieldName: 'lat', rowNumber: 4 }),
    makeFieldViolation({ fieldName: 'lat', rowNumber: 5 }),
  ];
  const result = renderViolationSection('ERRORS', '❌', [], violations);
  assertStringIncludes(result, '... and 2 more violations');
});

Deno.test('renderViolationSection - no truncation message for 3 or fewer', () => {
  const violations = [
    makeFieldViolation({ fieldName: 'lat', rowNumber: 1 }),
    makeFieldViolation({ fieldName: 'lat', rowNumber: 2 }),
  ];
  const result = renderViolationSection('ERRORS', '❌', [], violations);
  assertEquals(result.includes('... and'), false);
});

// --- renderDatasetDetails tests ---

Deno.test('renderDatasetDetails - returns empty for clean dataset', () => {
  assertEquals(renderDatasetDetails(makeCleanDataset()), '');
});

Deno.test('renderDatasetDetails - includes dataset heading', () => {
  const dataset = makeCleanDataset({
    datasetName: 'occurrences',
    spec: 'dwc-occurrence',
    schemaViolations: {
      errors: [makeSchemaViolation()],
      warnings: [],
      info: [],
    },
  });
  const result = renderDatasetDetails(dataset);
  assertStringIncludes(result, '## 📊 occurrences (dwc-occurrence)');
});

Deno.test('renderDatasetDetails - includes errors section', () => {
  const dataset = makeCleanDataset({
    fieldViolations: {
      errors: [makeFieldViolation()],
      warnings: [],
      info: [],
    },
  });
  const result = renderDatasetDetails(dataset);
  assertStringIncludes(result, '### ❌ ERRORS');
});

Deno.test('renderDatasetDetails - includes warnings section', () => {
  const dataset = makeCleanDataset({
    fieldViolations: {
      errors: [],
      warnings: [
        makeFieldViolation({
          enforcement: 'recommended',
          severity: 'warning',
        }),
      ],
      info: [],
    },
  });
  const result = renderDatasetDetails(dataset);
  assertStringIncludes(result, '### ⚠️ WARNINGS');
});

Deno.test('renderDatasetDetails - includes info section', () => {
  const dataset = makeCleanDataset({
    fieldViolations: {
      errors: [],
      warnings: [],
      info: [
        makeFieldViolation({ enforcement: 'optional', severity: 'info' }),
      ],
    },
  });
  const result = renderDatasetDetails(dataset);
  assertStringIncludes(result, '### ℹ️ INFO');
});

// --- renderCrossDatasetResults tests ---

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
  const violations = Array.from(
    { length: 8 },
    (_, i) =>
      new CrossDatasetViolation({
        enforcement: 'required',
        severity: 'error',
        fieldName: 'eventID',
        targetName: 'eventID',
        rowNumber: i + 1,
        value: `EVT-${i}`,
        errorMessage: `Foreign key not found: EVT-${i}`,
        validatorType: 'foreignKey',
      }),
  );
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

// --- renderOverallSummary tests ---

Deno.test('renderOverallSummary - includes section title', () => {
  const summary = makeResults().summary;
  const result = renderOverallSummary(summary, 150);
  assertStringIncludes(result, '## 📊 Overall Summary');
});

Deno.test('renderOverallSummary - includes dataset counts', () => {
  const summary = {
    totalDatasets: 3,
    datasetsPassedCount: 1,
    datasetsWithWarningsCount: 1,
    datasetsFailedCount: 1,
    totalErrors: 5,
    totalWarnings: 3,
    totalInfo: 2,
    totalRowsProcessed: 500,
  };
  const result = renderOverallSummary(summary, 250);
  assertStringIncludes(result, '**Datasets processed:** 3');
  assertStringIncludes(result, '**Passed:** 1');
  assertStringIncludes(result, '**Warnings:** 1');
  assertStringIncludes(result, '**Failed:** 1');
});

Deno.test('renderOverallSummary - includes violation totals', () => {
  const summary = makeResults({
    summary: {
      totalDatasets: 1,
      datasetsPassedCount: 0,
      datasetsWithWarningsCount: 0,
      datasetsFailedCount: 1,
      totalErrors: 10,
      totalWarnings: 5,
      totalInfo: 3,
      totalRowsProcessed: 200,
    },
  }).summary;
  const result = renderOverallSummary(summary, 100);
  assertStringIncludes(result, '**❌ Errors:** 10');
  assertStringIncludes(result, '**⚠️ Warnings:** 5');
  assertStringIncludes(result, '**ℹ️ Info:** 3');
});

Deno.test('renderOverallSummary - includes processing stats', () => {
  const summary = makeResults().summary;
  const result = renderOverallSummary(summary, 42);
  assertStringIncludes(result, '**Total rows processed:** 100');
  assertStringIncludes(result, '**Processing time:** 42ms');
});

// --- renderValidationMarkdown tests ---

Deno.test('renderValidationMarkdown - includes all sections for clean results', () => {
  const result = renderValidationMarkdown(makeResults());
  assertStringIncludes(result, '# 📂 Workspace Validation Results');
  assertStringIncludes(result, '## Summary Table');
  assertStringIncludes(result, '## 📊 Overall Summary');
});

Deno.test('renderValidationMarkdown - omits cross-dataset section when empty', () => {
  const result = renderValidationMarkdown(
    makeResults({ crossDatasetResults: [] }),
  );
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
  const result = renderValidationMarkdown(
    makeResults({ datasetResults: [dataset] }),
  );
  assertStringIncludes(result, '## 📊 test_data (dwc-event)');
  assertStringIncludes(result, '### ❌ ERRORS');
});

Deno.test('renderValidationMarkdown - returns string (not Effect)', () => {
  const result = renderValidationMarkdown(makeResults());
  assertEquals(typeof result, 'string');
});

import type {
  DatasetValidationResult,
  FieldViolation,
  ValidationStatus,
  WorkspaceValidationResult,
} from '@dwkit/domain/types';
import type { SchemaViolation } from '@dwkit/domain/types';
import * as Match from 'effect/Match';

function getStatusIcon(status: ValidationStatus): string {
  return Match.value(status).pipe(
    Match.when('pass', () => '\u2705'),
    Match.when('warn', () => '\u26A0\uFE0F'),
    Match.when('fail', () => '\u274C'),
    Match.exhaustive,
  );
}

function renderHeader(configPath: string): string {
  return [
    '# \uD83D\uDCC2 Workspace Validation Results',
    '',
    `**Configuration:** \`${configPath}\``,
    '',
    `**Validation Date:** ${new Date().toISOString()}`,
    '',
  ].join('\n');
}

function renderSummaryTable(
  datasets: ReadonlyArray<DatasetValidationResult>,
): string {
  const lines: string[] = [
    '## Summary Table',
    '',
    '| Dataset | Type | Status | Errors | Warnings | Info |',
    '|---------|------|--------|--------|----------|------|',
  ];

  for (const dataset of datasets) {
    const statusIcon = getStatusIcon(dataset.status);
    const statusText = `${statusIcon} ${dataset.status.toUpperCase()}`;

    const errorCount = dataset.schemaViolations.errors.length +
      dataset.fieldViolations.errors.length;
    const warningCount = dataset.schemaViolations.warnings.length +
      dataset.fieldViolations.warnings.length;
    const infoCount = dataset.schemaViolations.info.length +
      dataset.fieldViolations.info.length;

    lines.push(
      `| ${dataset.datasetName} | ${dataset.class} | ${statusText} | ${errorCount} | ${warningCount} | ${infoCount} |`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

export function groupViolationsByField(
  violations: ReadonlyArray<FieldViolation>,
): Map<string, FieldViolation[]> {
  const grouped = new Map<string, FieldViolation[]>();
  for (const violation of violations) {
    if (!grouped.has(violation.fieldName)) {
      grouped.set(violation.fieldName, []);
    }
    grouped.get(violation.fieldName)!.push(violation);
  }
  return grouped;
}

function renderViolationSection(
  title: string,
  icon: string,
  schemaViolations: ReadonlyArray<SchemaViolation>,
  fieldViolations: ReadonlyArray<FieldViolation>,
): string {
  if (schemaViolations.length === 0 && fieldViolations.length === 0) {
    return '';
  }

  const totalCount = schemaViolations.length + fieldViolations.length;
  const lines: string[] = [`### ${icon} ${title} (${totalCount})`, ''];

  if (schemaViolations.length > 0) {
    lines.push('**Schema Issues:**', '');
    for (const violation of schemaViolations) {
      lines.push(`- **${violation.fieldName}:** ${violation.errorMessage}`);
    }
    lines.push('');
  }

  if (fieldViolations.length > 0) {
    lines.push(
      `**Data Validation ${title.charAt(0) + title.slice(1).toLowerCase()}:**`,
      '',
    );
    const byField = groupViolationsByField(fieldViolations);
    for (const [fieldName, violations] of byField) {
      const firstViolation = violations[0];
      lines.push(
        `- **${fieldName}** (${firstViolation._tag}): ${violations.length} violations`,
      );

      const examples = violations.slice(0, 3);
      for (const violation of examples) {
        lines.push(`  - Row ${violation.rowNumber}: ${violation.errorMessage}`);
      }

      if (violations.length > 3) {
        lines.push(
          `  - ... and ${violations.length - 3} more violations`,
        );
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderDatasetDetails(
  dataset: DatasetValidationResult,
): string {
  const hasErrors = dataset.schemaViolations.errors.length > 0 ||
    dataset.fieldViolations.errors.length > 0;
  const hasWarnings = dataset.schemaViolations.warnings.length > 0 ||
    dataset.fieldViolations.warnings.length > 0;
  const hasInfo = dataset.schemaViolations.info.length > 0 ||
    dataset.fieldViolations.info.length > 0;

  if (!hasErrors && !hasWarnings && !hasInfo) {
    return '';
  }

  const sections = [
    `## 📊 ${dataset.datasetName} (${dataset.class})`,
    '',
    renderViolationSection(
      'ERRORS',
      '❌',
      dataset.schemaViolations.errors,
      dataset.fieldViolations.errors,
    ),
    renderViolationSection(
      'WARNINGS',
      '⚠️',
      dataset.schemaViolations.warnings,
      dataset.fieldViolations.warnings,
    ),
    renderViolationSection(
      'INFO',
      'ℹ️',
      dataset.schemaViolations.info,
      dataset.fieldViolations.info,
    ),
  ];

  return sections.filter(Boolean).join('\n');
}

function renderOverallSummary(
  summary: WorkspaceValidationResult['summary'],
  totalProcessingTimeMs: number,
): string {
  return [
    '## 📊 Overall Summary',
    '',
    `**Datasets processed:** ${summary.totalDatasets}  `,
    `**Passed:** ${summary.datasetsPassedCount}${
      summary.datasetsWithWarningsCount > 0
        ? ` (${summary.datasetsWithWarningsCount} with warnings)`
        : ''
    }  `,
    `**Failed:** ${summary.datasetsFailedCount}  `,
    '  ',
    `**❌ Errors:** ${summary.totalErrors}  `,
    `**⚠️ Warnings:** ${summary.totalWarnings}  `,
    `**ℹ️ Info:** ${summary.totalInfo}  `,
    '  ',
    `**Total rows processed:** ${summary.totalRowsProcessed}  `,
    `**Processing time:** ${totalProcessingTimeMs}ms  `,
  ].join('\n');
}

export function renderValidationMarkdown(
  results: WorkspaceValidationResult,
): string {
  return [
    renderHeader(results.configPath),
    renderSummaryTable(results.datasetResults),
    ...results.datasetResults.map(renderDatasetDetails),
    renderOverallSummary(results.summary, results.totalProcessingTimeMs),
  ].filter(Boolean).join('\n');
}

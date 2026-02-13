import type {
  CrossDatasetValidationResult,
  DatasetValidationResult,
  FieldViolation,
  WorkspaceValidationResult,
} from '@dwkt/domain/types';
import type { SchemaViolation } from '@dwkt/domain/types';

export function getStatusIcon(status: string): string {
  switch (status) {
    case 'pass':
      return '\u2705';
    case 'warn':
      return '\u26A0\uFE0F';
    case 'fail':
      return '\u274C';
    default:
      return '\u2753';
  }
}

export function renderHeader(configPath: string): string {
  return [
    '# \uD83D\uDCC2 Workspace Validation Results',
    '',
    `**Configuration:** \`${configPath}\``,
    '',
    `**Validation Date:** ${new Date().toISOString()}`,
    '',
  ].join('\n');
}

export function renderSummaryTable(
  datasets: ReadonlyArray<DatasetValidationResult>,
): string {
  const lines: string[] = [
    '## Summary Table',
    '',
    '| Dataset | Spec | Status | Errors | Warnings | Info |',
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
      `| ${dataset.datasetName} | ${dataset.spec} | ${statusText} | ${errorCount} | ${warningCount} | ${infoCount} |`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

function groupViolationsByField(
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

export function renderViolationSection(
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
        `- **${fieldName}** (${firstViolation.validatorType}): ${violations.length} violations`,
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

export function renderDatasetDetails(
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
    `## 📊 ${dataset.datasetName} (${dataset.spec})`,
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

export function renderCrossDatasetResults(
  crossResults: ReadonlyArray<CrossDatasetValidationResult>,
): string {
  if (crossResults.length === 0) {
    return '';
  }

  const lines: string[] = ['## 🔗 Cross-dataset Validation', ''];

  for (const crossResult of crossResults) {
    if (crossResult.violations.length > 0) {
      lines.push('### ❌ Foreign Key Violation', '');
      lines.push(
        `**${crossResult.sourceDataset}.${crossResult.sourceField}** → **${crossResult.targetDataset}.${crossResult.targetField}**`,
        '',
      );

      const sampleViolations = crossResult.violations.slice(0, 5);
      for (const violation of sampleViolations) {
        lines.push(`- Row ${violation.rowNumber}: ${violation.errorMessage}`);
      }

      if (crossResult.violations.length > 5) {
        lines.push(
          `- ... and ${crossResult.violations.length - 5} more violations`,
        );
      }
      lines.push('');
    } else {
      lines.push('### ✅ Foreign Key Valid', '');
      lines.push(
        `**${crossResult.sourceDataset}.${crossResult.sourceField}** → **${crossResult.targetDataset}.${crossResult.targetField}**`,
        '',
      );
    }
  }

  return lines.join('\n');
}

export function renderOverallSummary(
  summary: WorkspaceValidationResult['summary'],
  totalProcessingTimeMs: number,
): string {
  return [
    '## 📊 Overall Summary',
    '',
    `**Datasets processed:** ${summary.totalDatasets}  `,
    `**Passed:** ${summary.datasetsPassedCount}  `,
    `**Warnings:** ${summary.datasetsWithWarningsCount}  `,
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
    renderCrossDatasetResults(results.crossDatasetResults),
    renderOverallSummary(results.summary, results.totalProcessingTimeMs),
  ].filter(Boolean).join('\n');
}

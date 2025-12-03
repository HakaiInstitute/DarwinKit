/**
 * CLI error presentation
 *
 * Transforms enriched errors into format appropriate for terminal output
 */

import type { EnrichedError } from "./severity.ts";
import { getCliExitCode, getSeverityIcon, getSeverityLabel } from "./severity.ts";

/**
 * CLI error presentation format
 */
export interface CliErrorPresentation {
  readonly icon: string;
  readonly title: string;
  readonly message: string;
  readonly hint?: string;
  readonly suggestedActions?: readonly string[];
  readonly exitCode: number;
}

/**
 * Present error for CLI output
 *
 * Transforms an enriched error into a format suitable for terminal display
 *
 * @example
 * ```typescript
 * import { Output } from '@dwkt/cli/utils/output';
 *
 * const presentation = presentForCli(error);
 * Output.error(`${presentation.icon} ${presentation.title}: ${presentation.message}`);
 * if (presentation.hint) Output.muted(`Hint: ${presentation.hint}`);
 * ```
 */
export function presentForCli(error: EnrichedError): CliErrorPresentation {
  const { metadata, message } = error;

  return {
    icon: getSeverityIcon(metadata.severity),
    title: getSeverityLabel(metadata.severity),
    message: metadata.userMessage || message,
    hint: metadata.hint,
    suggestedActions: metadata.suggestedActions,
    exitCode: getCliExitCode(metadata.severity),
  };
}

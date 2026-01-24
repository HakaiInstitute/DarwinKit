/**
 * Workspace display utilities for CLI commands
 *
 * Shared functions for displaying workspace information consistently
 * across validate, transform, and other commands.
 */

import type { Workspace } from '@dwkt/core';
import { Output } from './output.ts';

/**
 * Display workspace information before running operations
 */
export function displayWorkspaceInfo(workspace: Workspace): void {
  Output.blank();
  Output.section('Workspace Information');
  Output.line(`  Name: ${workspace.getName()}`);
  Output.line(`  Version: ${workspace.getVersion()}`);
  if (workspace.getDescription()) {
    Output.line(`  Description: ${workspace.getDescription()}`);
  }
  Output.line(`  Config: ${workspace.getConfigPath()}`);

  const datasets = workspace.getDatasets();
  Output.line(`  Datasets: ${datasets.length}`);
  for (const dataset of datasets) {
    // Support both profile (new) and spec (legacy) field names
    const profileName = dataset.profile || dataset.spec;
    Output.muted(`    • ${dataset.name} (${profileName})`);
  }
  Output.blank();
}

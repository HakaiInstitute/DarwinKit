/**
 * Validation Module
 *
 * Exports validation functionality for external consumption.
 * Note: Error types and domain utilities should be imported from @dwkit/domain.
 *
 * @module validation
 */

// Workspace validation (main entry point)
export { WorkspaceValidator } from "./workspace-validator.ts";

// Per-table detection core (reusable by transform pipeline)
export { validateTable } from "./table-validator.ts";
export type { TableViolations, ValidateTableOptions } from "./table-validator.ts";

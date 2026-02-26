import type * as Cause from "effect/Cause";
import * as Data from "effect/Data";
import { createTaggedFormatter, prettyPrintCause } from "./cause-formatter.ts";

export class ConfigNotFoundError extends Data.TaggedError("ConfigNotFoundError")<{
  readonly message: string;
  readonly searchedPaths: readonly string[];
  readonly startDirectory: string;
}> {
  get searchDescription(): string {
    return this.searchedPaths.map((p) => `  - ${p}`).join("\n");
  }
}

export class ConfigParseError extends Data.TaggedError("ConfigParseError")<{
  readonly message: string;
  readonly configPath: string;
  readonly cause?: Error;
}> {}

export class ConfigValidationError extends Data.TaggedError("ConfigValidationError")<{
  readonly message: string;
  readonly configPath: string;
  readonly validationErrors: readonly string[];
}> {
  get errorList(): string {
    return this.validationErrors.map((e) => `  - ${e}`).join("\n");
  }
}

export class DatasetFileNotFoundError extends Data.TaggedError("DatasetFileNotFoundError")<{
  readonly message: string;
  readonly datasetName: string;
  readonly filePath: string;
  readonly configPath: string;
}> {}

export class TransformInputNotFoundError extends Data.TaggedError("TransformInputNotFoundError")<{
  readonly message: string;
  readonly inputName: string;
  readonly filePath: string;
  readonly configPath: string;
}> {}

export class ValidationConfigMissingError extends Data.TaggedError("ValidationConfigMissingError")<{
  readonly message: string;
  readonly workspaceName: string;
}> {}

export class NoDatasetsDefinedError
  extends Data.TaggedError("NoDatasetsDefinedError")<{ message: string }> {}

export class WorkspaceValidationError extends Data.TaggedClass("WorkspaceValidationError")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class WorkspaceImportError extends Data.TaggedClass("WorkspaceImportError")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export type WorkspaceOperationError = WorkspaceValidationError | WorkspaceImportError;

export type WorkspaceConfigError =
  | ConfigNotFoundError
  | ConfigParseError
  | ConfigValidationError
  | DatasetFileNotFoundError
  | TransformInputNotFoundError
  | ValidationConfigMissingError
  | NoDatasetsDefinedError;

export const formatWorkspaceConfigError = createTaggedFormatter<WorkspaceConfigError>({
  ConfigNotFoundError: (error) =>
    `Configuration file not found\n\n` +
    `Started searching from: ${error.startDirectory}\n\n` +
    `Searched paths:\n${error.searchDescription}\n\n` +
    `Create a darwinkit.yaml file to define your workspace configuration.`,

  ConfigParseError: (error) =>
    `Failed to parse configuration file\n\n` +
    `File: ${error.configPath}\n` +
    `${error.cause?.message ?? error.message}\n\n` +
    `Check that the file contains valid YAML syntax.`,

  ConfigValidationError: (error) =>
    `Configuration validation failed\n\n` +
    `File: ${error.configPath}\n\n` +
    `Validation errors:\n${error.errorList}\n\n` +
    `Review the configuration schema and fix the errors above.`,

  DatasetFileNotFoundError: (error) =>
    `Dataset file not found\n\n` +
    `Dataset: ${error.datasetName}\n` +
    `Path: ${error.filePath}\n` +
    `Config: ${error.configPath}\n\n` +
    `Check that the path in darwinkit.yaml is correct and the file exists.`,

  TransformInputNotFoundError: (error) =>
    `Transform input file not found\n\n` +
    `Input: ${error.inputName}\n` +
    `Path: ${error.filePath}\n` +
    `Config: ${error.configPath}\n\n` +
    `Check that the path in darwinkit.yaml is correct and the file exists.`,

  ValidationConfigMissingError: (_error) =>
    `Validation configuration missing\n\n` +
    `Add a "validation" section to darwinkit.yaml with datasets to validate.`,

  NoDatasetsDefinedError: (_error) =>
    `No datasets defined for validation\n\n` +
    `Add at least one dataset to the "validation.datasets" array in darwinkit.yaml.`,
});

export function prettyPrintWorkspaceError(
  cause: Cause.Cause<WorkspaceConfigError>,
): string {
  return prettyPrintCause(cause, formatWorkspaceConfigError);
}

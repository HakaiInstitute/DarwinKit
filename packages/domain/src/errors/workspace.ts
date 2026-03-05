import * as Data from "effect/Data";

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

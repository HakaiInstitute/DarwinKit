import * as Data from 'effect/Data';

export class CLIError extends Data.TaggedError('CLIError')<{
  readonly message: string;
  readonly hint?: string;
  readonly exitCode: number;
}> {}

export class OutputError extends Data.TaggedError('OutputError')<{
  readonly message: string;
  readonly outputPath: string;
  readonly cause?: Error;
}> {}

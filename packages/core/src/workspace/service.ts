/**
 * Workspace Service - File-based workspace management
 *
 * Provides functions for creating, loading, and saving workspaces to the filesystem.
 * Uses Effect for type-safe operations and error handling.
 */

import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import { join } from "@std/path";
import { v4 as uuidv4 } from "uuid";
import { ensureDir, readFile, toError, writeFile } from "../utils/effect-utils.ts";

import type {
  CreateWorkspaceOptions,
  DatasetSchema,
  FieldSchema,
  PrimitiveType,
  Workspace,
  WorkspaceInfo,
} from "@dwkt/domain";
import { ErrorCode } from "@dwkt/domain";
import { type ParsedFileResult, parseFileForWorkspace } from "../parsing/csv-parser.ts";

// Error classes for workspace operations
const WorkspaceErrorBase = Data.TaggedClass("WorkspaceError")<{
  readonly message: string;
  readonly code: ErrorCode;
  readonly cause?: Error;
}>;

export class WorkspaceError extends WorkspaceErrorBase {}

export class WorkspaceIOError extends WorkspaceError {
  readonly path: string;

  constructor(props: { message: string; path: string; code: ErrorCode; cause?: Error }) {
    super({ message: props.message, code: props.code, cause: props.cause });
    this.path = props.path;
  }
}

/**
 * Map generic errors to workspace I/O errors with file path
 */
function toWorkspaceIOError(filePath: string, error: Error): WorkspaceIOError {
  return new WorkspaceIOError({
    message: `File operation failed: ${error.message}`,
    path: filePath,
    code: ErrorCode.WORKSPACE_IO_ERROR,
    cause: error,
  });
}

// Result from workspace creation
export class CreateWorkspaceResult extends Data.Class<{
  readonly workspace: Workspace;
  readonly parseResult: ParsedFileResult;
}> {}

/**
 * Workspace service for file-based workspace management
 */
export class WorkspaceService {
  private readonly workspacesDir: string;

  constructor({
    workspacesDir = "./workspaces",
  }: {
    workspacesDir?: string;
  } = {}) {
    this.workspacesDir = workspacesDir;
  }

  /**
   * Create a new workspace from a CSV file
   */
  createFromFile(
    options: CreateWorkspaceOptions,
  ): Effect.Effect<CreateWorkspaceResult, WorkspaceError> {
    const workspacesDir = this.workspacesDir;
    const save = this.save.bind(this);
    const saveSamples = this.saveSamples.bind(this);

    return Effect.gen(function* (_) {
      // Parse the input file - parseFileForWorkspace now returns Effect directly
      const parseResult = yield* _(
        parseFileForWorkspace(options.filePath, options.parseOptions).pipe(
          Effect.mapError((error) =>
            new WorkspaceError({
              message: `Failed to parse file: ${error.message}`,
              code: ErrorCode.PARSE_ERROR,
              cause: error.cause,
            })
          ),
        ),
      );

      // Create workspace metadata
      const id = uuidv4();
      const workspaceDir = join(workspacesDir, `workspace-${id}`);
      const dataTableName = `${id.replace(/-/g, "_")}_data`;

      const workspace: Workspace = {
        id,
        name: options.name,
        description: options.description,
        filePath: options.filePath,
        format: "csv",
        schema: parseResult.schema,
        createdAt: new Date(),
        updatedAt: new Date(),
        workspaceDir,
        dataTableName,
      };

      // Save workspace to filesystem
      yield* _(save(workspace));
      yield* _(saveSamples(workspace.id, parseResult.samples));

      return new CreateWorkspaceResult({
        workspace,
        parseResult,
      });
    });
  }

  /**
   * Load workspace from filesystem
   */
  load(id: string): Effect.Effect<Workspace, WorkspaceError> {
    const workspacesDir = this.workspacesDir;

    return Effect.gen(function* (_) {
      const workspaceDir = join(workspacesDir, `workspace-${id}`);
      const workspaceFile = join(workspaceDir, "workspace.json");

      // Check if workspace exists
      yield* _(
        Effect.tryPromise({
          try: () => Deno.stat(workspaceFile),
          catch: () =>
            new WorkspaceError({
              message: `Workspace not found: ${id}`,
              code: ErrorCode.WORKSPACE_NOT_FOUND,
            }),
        }),
      );

      // Read and parse workspace file
      const workspaceData = yield* _(
        readFile(workspaceFile).pipe(
          Effect.mapError((error) => toWorkspaceIOError(workspaceFile, error)),
        ),
      );

      // Parse JSON - if this fails, it's a defect (file corruption)
      const parsedData = yield* _(
        Effect.try({
          try: () => JSON.parse(workspaceData),
          catch: (error) =>
            new Error(
              `Workspace file corrupted: ${error instanceof Error ? error.message : String(error)}`,
            ),
        }).pipe(Effect.orDie),
      );

      // Parse workspace structure - parseWorkspace returns Effect<Workspace, never>
      // so any failures are defects (not in error channel)
      return yield* _(parseWorkspace(parsedData));
    });
  }

  /**
   * List all workspaces
   */
  list(): Effect.Effect<WorkspaceInfo[], WorkspaceError> {
    const workspacesDir = this.workspacesDir;
    const loadWorkspaceInfo = this.loadWorkspaceInfo.bind(this);

    return Effect.gen(function* (_) {
      // Ensure workspaces directory exists
      yield* _(
        ensureDir(workspacesDir).pipe(
          Effect.mapError((error) => toWorkspaceIOError(workspacesDir, error)),
        ),
      );

      // List workspace directories
      const dirs = yield* _(
        Effect.tryPromise({
          try: async () => {
            const entries = [];
            for await (const entry of Deno.readDir(workspacesDir)) {
              entries.push(entry);
            }
            return entries;
          },
          catch: (error) => toWorkspaceIOError(workspacesDir, toError(error)),
        }),
      );

      // Filter for workspace directories and extract IDs
      const workspaceDirs = dirs
        .filter((dir) => dir.isDirectory && dir.name.startsWith("workspace-"))
        .map((dir) => dir.name.replace("workspace-", ""));

      // Load each workspace info in parallel
      const workspaces = yield* _(
        Effect.all(
          workspaceDirs.map((id: string) => loadWorkspaceInfo(id)),
        ),
      );

      return workspaces;
    });
  }

  /**
   * Load just the workspace info (for listing)
   */
  private loadWorkspaceInfo(id: string): Effect.Effect<WorkspaceInfo, WorkspaceError> {
    const load = this.load.bind(this);

    return Effect.gen(function* (_) {
      // First try to load the full workspace
      const workspace = yield* _(load(id));

      // Convert to WorkspaceInfo
      return {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        filePath: workspace.filePath,
        format: workspace.format,
        rowCount: workspace.schema.rowCount,
        fieldCount: workspace.schema.fields.size,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      };
    });
  }

  /**
   * Save workspace to filesystem
   */
  private save(workspace: Workspace): Effect.Effect<void, WorkspaceError> {
    return Effect.gen(function* (_) {
      const workspaceFile = join(workspace.workspaceDir, "workspace.json");

      // Ensure workspace directory exists
      yield* _(
        ensureDir(workspace.workspaceDir).pipe(
          Effect.mapError((error) => toWorkspaceIOError(workspace.workspaceDir, error)),
        ),
      );

      // Serialize and write workspace
      const serialized = JSON.stringify(encodeWorkspace(workspace), null, 2);
      yield* _(
        writeFile(workspaceFile, serialized).pipe(
          Effect.mapError((error) => toWorkspaceIOError(workspaceFile, error)),
        ),
      );
    });
  }

  /**
   * Save sample data to filesystem
   */
  private saveSamples(
    workspaceId: string,
    samples: ReadonlyMap<string, ReadonlyArray<string>>,
  ): Effect.Effect<void, WorkspaceError> {
    const workspacesDir = this.workspacesDir;
    return Effect.gen(function* (_) {
      const workspaceDir = join(workspacesDir, `workspace-${workspaceId}`);
      const samplesFile = join(workspaceDir, "samples.json");

      // Convert Map to object for JSON serialization
      const samplesObj = Object.fromEntries(samples);
      const serialized = JSON.stringify(samplesObj, null, 2);
      yield* _(
        writeFile(samplesFile, serialized).pipe(
          Effect.mapError((error) => toWorkspaceIOError(samplesFile, error)),
        ),
      );
    });
  }
}

// Workspace parsing and encoding functions
function parseWorkspace(data: unknown): Effect.Effect<Workspace, never> {
  if (typeof data !== "object" || data === null) {
    return Effect.die(
      new Error("Invalid workspace data structure: expected object, got " + typeof data),
    );
  }

  return Effect.gen(function* (_) {
    const obj = data as Record<string, unknown>;
    const schema = yield* _(parseDatasetSchema(obj.schema));

    return {
      id: String(obj.id || ""),
      name: String(obj.name || ""),
      description: obj.description ? String(obj.description) : undefined,
      filePath: String(obj.filePath || ""),
      format: (obj.format === "json" ? "json" : "csv"),
      schema,
      createdAt: obj.createdAt ? new Date(obj.createdAt as string) : new Date(),
      updatedAt: obj.updatedAt ? new Date(obj.updatedAt as string) : new Date(),
      workspaceDir: String(obj.workspaceDir || ""),
      dataTableName: String(obj.dataTableName || ""),
    };
  });
}

function parseDatasetSchema(schemaData: unknown): Effect.Effect<DatasetSchema, never> {
  // TODO: Can this be accomplished via parsing with Effect Schema instead?
  if (typeof schemaData !== "object" || schemaData === null) {
    return Effect.die(
      new Error("Invalid schema data structure: expected object, got " + typeof schemaData),
    );
  }

  return Effect.sync(() => {
    const obj = schemaData as Record<string, unknown>;

    // Handle both array and object formats for fields
    const fieldsMap = new Map<string, FieldSchema>();

    // TODO: This if should be replaced by something more concrete like pattern
    // matching. We have Effect available for parsing and creating objects; perhaps
    // the entire array can be parsed at once rather than iterated over like this?

    // TODO: PARSE obj.fields HERE
    // Use Effect Schema/Data to create these objects in a consistently valid way

    if (Array.isArray(obj.fields)) {
      const fieldsArray = obj.fields as Array<[string, unknown]>;
      for (const [fieldName, fieldData] of fieldsArray) {
        // Type guard for field data
        const data = fieldData as Record<string, unknown>;
        const fieldSchema: FieldSchema = {
          name: String(data.name || fieldName),
          inferredType: String(data.duckdbType || ""),
          primitiveType: data.primitiveType as PrimitiveType,
          isNullable: Boolean(data.isNullable),
          defaultValue: data.defaultValue ? String(data.defaultValue) : undefined,
          sampleValues: Array.isArray(data.sampleValues) ? data.sampleValues as string[] : [],
        };

        fieldsMap.set(fieldName, fieldSchema);
      }
    } else if (typeof obj.fields === "object" && obj.fields !== null) {
      // TODO: Make this case obsolete
      // Old format: object or empty object - just create empty map for now
      // If needed, handle object format fields conversion
    } else if (obj.fields !== undefined) {
      // Invalid fields format is a defect - our workspace files should be valid
      return Effect.die(
        new Error(`Invalid fields format in workspace data: ${typeof obj.fields}`),
      ) as never; // Type assertion needed for return in lambda
    }

    return {
      fields: fieldsMap,
      rowCount: Number(obj.rowCount || 0),
      tableName: String(obj.tableName || ""),
      inferredAt: obj.inferredAt ? new Date(obj.inferredAt as string) : new Date(),
    };
  });
}

function encodeWorkspace(workspace: Workspace): unknown {
  // Convert the schema fields Map to an array for JSON serialization
  const schemaForJson = {
    ...workspace.schema,
    fields: Array.from(workspace.schema.fields.entries()),
  };

  return {
    id: workspace.id,
    name: workspace.name,
    description: workspace.description,
    filePath: workspace.filePath,
    format: workspace.format,
    schema: schemaForJson,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
    workspaceDir: workspace.workspaceDir,
    dataTableName: workspace.dataTableName,
  };
}

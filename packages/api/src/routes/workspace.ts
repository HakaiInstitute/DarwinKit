/**
 * Workspace API routes
 */

import { Hono } from "hono";
import { validator } from "hono/validator";
import * as Effect from "effect/Effect";
import { WorkspaceService } from "@dwkt/core";
import { createWorkspaceOptionsSchema, ErrorCode } from "@dwkt/domain";
import { effectValidator } from "../utils/validation.ts";

const app = new Hono();
const workspaceService = new WorkspaceService();

// Get all workspaces
app.get("/", async (c) => {
  const program = workspaceService.list().pipe(
    Effect.catchTag("WorkspaceError", (error) => {
      // Distinguish error types by code and properties
      if ("path" in error && error.path) {
        // WorkspaceIOError - file system access issue
        console.error("Failed to access workspaces directory:", error);
        return Effect.succeed(
          c.json(
            {
              error: "Failed to access workspaces directory",
              details: error.message,
              path: error.path,
            },
            500,
          ),
        );
      }

      // Generic WorkspaceError
      console.error("Failed to list workspaces:", error);
      return Effect.succeed(
        c.json(
          {
            error: "Failed to list workspaces",
            details: error.message,
          },
          500,
        ),
      );
    }),
    Effect.map((workspaces) => c.json(workspaces)),
  );

  return await Effect.runPromise(program);
});

// Get a specific workspace
app.get("/:id", async (c) => {
  const id = c.req.param("id");

  const program = workspaceService.load(id).pipe(
    Effect.catchTag("WorkspaceError", (error) => {
      // Route based on error code
      if (error.code === ErrorCode.WORKSPACE_NOT_FOUND) {
        // 404 - Workspace doesn't exist (expected user error)
        console.log(`Workspace not found: ${id}`);
        return Effect.succeed(
          c.json(
            {
              error: "Workspace not found",
              workspaceId: id,
            },
            404,
          ),
        );
      }

      if ("path" in error && error.path) {
        // 500 - WorkspaceIOError - file system access issue
        console.error("Failed to read workspace file:", error);
        return Effect.succeed(
          c.json(
            {
              error: "Failed to read workspace",
              details: error.message,
              path: error.path,
            },
            500,
          ),
        );
      }

      // 500 - Other workspace errors (unexpected)
      console.error("Failed to load workspace:", error);
      return Effect.succeed(
        c.json(
          {
            error: "Failed to load workspace",
            details: error.message,
          },
          500,
        ),
      );
    }),
    Effect.map((workspace) => c.json(workspace)),
  );

  return await Effect.runPromise(program);
});

// Create a new workspace
app.post(
  "/",
  validator("json", effectValidator(createWorkspaceOptionsSchema)),
  async (c) => {
    const input = c.req.valid("json");

    const program = workspaceService.createFromFile(input).pipe(
      Effect.catchTag("WorkspaceError", (error) => {
        // Route based on error code for specific HTTP status codes
        if (error.code === ErrorCode.FILE_NOT_FOUND) {
          // 404 - Input file not found (user error)
          console.error(`File not found: ${input.filePath}`);
          return Effect.succeed(
            c.json(
              {
                error: "File not found",
                filePath: input.filePath,
                details: error.message,
              },
              404,
            ),
          );
        }

        if (error.code === ErrorCode.PARSE_ERROR) {
          // 400 - Invalid file format (user error)
          console.error("Failed to parse file:", error);
          return Effect.succeed(
            c.json(
              {
                error: "Invalid file format",
                filePath: input.filePath,
                details: error.message,
              },
              400,
            ),
          );
        }

        if (error.code === ErrorCode.WORKSPACE_ALREADY_EXISTS) {
          // 409 - Workspace already exists (user error)
          console.error("Workspace already exists:", error);
          return Effect.succeed(
            c.json(
              {
                error: "Workspace already exists",
                details: error.message,
              },
              409,
            ),
          );
        }

        if ("path" in error && error.path) {
          // 500 - WorkspaceIOError - file system access issue
          console.error("Failed to write workspace:", error);
          return Effect.succeed(
            c.json(
              {
                error: "Failed to write workspace",
                details: error.message,
                path: error.path,
              },
              500,
            ),
          );
        }

        // 500 - Other workspace errors (unexpected)
        console.error("Failed to create workspace:", error);
        return Effect.succeed(
          c.json(
            {
              error: "Failed to create workspace",
              details: error.message,
            },
            500,
          ),
        );
      }),
      Effect.map((result) => c.json(result.workspace, 201)),
    );

    return await Effect.runPromise(program);
  },
);

export { app as workspaceRoutes };

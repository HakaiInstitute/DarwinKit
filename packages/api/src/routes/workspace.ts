/**
 * Workspace API routes
 */

import { Hono } from "hono";
import * as Effect from "effect/Effect";
import { WorkspaceService } from "@dwkt/core";

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

export { app as workspaceRoutes };

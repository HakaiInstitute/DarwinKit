/**
 * DarwinKit API Server - Consolidated HTTP API
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { workspaceRoutes } from "./src/routes/workspace.ts";
import { authRoutes } from "./src/routes/auth.ts";

const app: Hono = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Routes
app.route("/api/workspaces", workspaceRoutes);
app.route("/auth", authRoutes);

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Export the app type for client typing
export type ApiType = typeof app;

const port = 3001;
console.log(`DarwinKit API server running on port ${port}`);

if (import.meta.main) {
  serve({
    fetch: app.fetch,
    port,
  });
}

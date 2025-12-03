/**
 * Authentication routes
 *
 * NOTE: Authentication is currently unimplemented.
 * These are placeholder stubs for future development.
 */

import { Hono } from "hono";
// import { validator } from "hono/validator";
// import { CredentialSchema, NewUserSchema } from "@dwkt/domain";
// import { effectValidator } from "../utils/validation.ts";

const app = new Hono();

// User signup (STUB - not implemented)
app.post("/signup", (c) => {
  return c.json({ error: "Authentication not implemented" }, 501);
});

// User signin (STUB - not implemented)
app.post("/signin", (c) => {
  return c.json({ error: "Authentication not implemented" }, 501);
});

// Get current user
app.get("/me", (c) => {
  // In a real implementation, this would validate the token
  const authorization = c.req.header("Authorization");
  if (!authorization || !authorization.replace("Bearer ", "")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json({ id: 1, email: "demo@dwkt.com" });
});

export { app as authRoutes };

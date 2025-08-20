import { serve } from "@hono/node-server";
import { Hono, Context, Next } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod/v4";
import { db } from "~/db/index.ts";
import { projects } from "~/db/schema.ts";
import { CredentialSchema } from "~/schemas/auth.ts";
import { NewUserSchema } from "~/schemas/user.ts";

type User = {
  id: number;
  email: string;
};

type Variables = {
  user: User;
};

const app = new Hono<{ Variables: Variables }>();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Auth middleware
const authMiddleware = async (c: Context<{ Variables: Variables }>, next: Next) => {
  const authorization = c.req.header("Authorization");
  if (!authorization) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // For demo purposes, we'll use a simple token validation
  // In production, you'd validate JWT tokens here
  const token = authorization.replace("Bearer ", "");
  if (token === "token") {
    c.set("user", { id: 1, email: "demo@darwinkit.com" });
    await next();
  } else {
    return c.json({ error: "Invalid token" }, 401);
  }
};

// Auth routes
const authRoutes = app
  .post("/auth/signup", zValidator("json", NewUserSchema), (c) => {
    const input = c.req.valid("json");
    return c.json({
      id: 1,
      email: input.email,
      password: input.password,
    }, 201);
  })
  .post("/auth/signin", zValidator("json", CredentialSchema), (c) => {
    return c.json({ token: "token" });
  })
  .get("/auth/me", authMiddleware, (c) => {
    const user = c.get("user");
    return c.json(user);
  });

// Project routes
const projectRoutes = app
  .get("/projects", authMiddleware, zValidator("query", z.object({
    limit: z.coerce.number().int().min(1).max(100).default(10),
    offset: z.coerce.number().int().min(0).default(0),
  })), async (c) => {
    const user = c.get("user");
    const query = c.req.valid("query");
    
    const projectList = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, user.id))
      .orderBy(desc(projects.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    return c.json(projectList);
  })
  .post("/projects", authMiddleware, zValidator("json", z.object({
    title: z.string().min(1),
    description: z.string().default(""),
  })), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    
    const [newProject] = await db
      .insert(projects)
      .values({
        ...input,
        userId: user.id,
      })
      .returning();

    return c.json(newProject, 201);
  })
  .get("/projects/:id", authMiddleware, zValidator("param", z.object({
    id: z.coerce.number().int().min(1),
  })), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    
    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, id),
        eq(projects.userId, user.id),
      ),
      with: { files: true },
    });

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    if (project.userId !== user.id) {
      return c.json({ error: "Access denied" }, 403);
    }

    return c.json(project);
  })
  .put("/projects/:id", authMiddleware, zValidator("param", z.object({
    id: z.coerce.number().int().min(1),
  })), zValidator("json", z.object({
    title: z.string().min(1),
    description: z.string(),
  })), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    
    const [existingProject] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id));

    if (!existingProject) {
      return c.json({ error: "Project not found" }, 404);
    }

    if (existingProject.userId !== user.id) {
      return c.json({ error: "Access denied" }, 403);
    }

    const [updatedProject] = await db
      .update(projects)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();

    return c.json(updatedProject);
  });

// Export the app type for RPC client
export type AppType = typeof authRoutes & typeof projectRoutes;

const port = 3001;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

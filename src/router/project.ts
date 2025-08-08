import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod/v4";
import { retry } from "~/middlewares/retry";
import { projects, projectSchema, projectWithFilesSchema } from "../db/schema";
import { authed } from "../orpc";

export const listProjects = authed
  .use(retry({ times: 3 }))
  .route({
    method: "GET",
    path: "/projects",
    summary: "List all projects",
    tags: ["Projects"],
  })
  .input(
    z.object({
      limit: z.number().int().min(1).max(100).default(10),
      offset: z.number().int().min(0).default(0),
    })
  )
  .output(
    z.array(
      z.object({
        id: z.number(),
        title: z.string(),
        description: z.string(),
        userId: z.number(),
        createdAt: z.date(),
        updatedAt: z.date(),
      })
    )
  )
  .handler(async ({ input, context }) => {
    const projectList = await context.db
      .select()
      .from(projects)
      .where(eq(projects.userId, context.user.id))
      .orderBy(desc(projects.createdAt))
      .limit(input.limit)
      .offset(input.offset);

    return projectList;
  });

export const createProject = authed
  .route({
    method: "POST",
    path: "/projects",
    summary: "Create a project",
    tags: ["Projects"],
  })
  .input(
    z.object({
      title: z.string().min(1),
      description: z.string().default(""),
    })
  )
  .output(
    z.object({
      id: z.number(),
      title: z.string(),
      description: z.string(),
      userId: z.number(),
      createdAt: z.date(),
      updatedAt: z.date(),
    })
  )
  .handler(async ({ input, context }) => {
    const [newProject] = await context.db
      .insert(projects)
      .values({
        ...input,
        userId: context.user.id,
      })
      .returning();

    return newProject;
  });

export const findProject = authed
  .use(retry({ times: 3 }))
  .route({
    method: "GET",
    path: "/projects/{id}",
    summary: "Find a project",
    tags: ["Projects"],
  })
  .input(
    z.object({
      id: z.number().int().min(1),
    })
  )
  .output(projectWithFilesSchema)
  .handler(async ({ input, context }) => {
    const project = await context.db.query.projects.findFirst({
      where: and(eq(projects.id, input.id), eq(projects.userId, context.user.id)),
      with: { files: true },
    });

    if (!project) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    }

    // Check if user owns this project
    if (project.userId !== context.user.id) {
      throw new ORPCError("FORBIDDEN", { message: "Access denied" });
    }

    return project;
  });

export const updateProject = authed
  .route({
    method: "PUT",
    path: "/projects/{id}",
    summary: "Update a project",
    tags: ["Projects"],
  })
  .errors({
    NOT_FOUND: {
      message: "Project not found",
      data: z.object({ id: z.number().int() }),
    },
  })
  .input(projectSchema)
  .output(projectSchema)
  .handler(async ({ input, context, errors }) => {
    const [existingProject] = await context.db
      .select()
      .from(projects)
      .where(eq(projects.id, input.id));

    if (!existingProject) {
      throw errors.NOT_FOUND({ data: { id: input.id } });
    }

    // Check if user owns this project
    if (existingProject.userId !== context.user.id) {
      throw new ORPCError("FORBIDDEN", { message: "Access denied" });
    }

    const [updatedProject] = await context.db
      .update(projects)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, input.id))
      .returning();

    return updatedProject;
  });

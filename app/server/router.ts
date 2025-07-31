import "dotenv/config";

import { eq } from "drizzle-orm";
import { defineEventHandler, toWebRequest } from "@tanstack/react-start/server";
import { invariant } from "@tanstack/react-router";
import { initTRPC, TRPCRouterRecord } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { z } from "zod";

import {
  projects,
  createProjectSchema,
  projectWithFilesSchema,
  ProjectWithFiles,
  SourceFile,
  createFileSchema,
  sourceFiles,
  users,
} from "./db/schema";
import { db } from "./db/index";

const t = initTRPC.context().create({
  transformer: superjson,
});

export interface AppRouterType {
  [key: string]: unknown;
}

export const appRouter = t.router({
  hello: t.procedure.query(() => "Hello world!"),
  registerUser: t.procedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async (req) => {
      console.log(`Registering user: ${req.input}`);
      const result = await db.insert(users).values({
        email: req.input.email,
        password: req.input.password,
      });

      console.log("User registered successfully");
      return { success: true, message: "User registered successfully", result };
    }),
  loginUser: t.procedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async (req) => {
      // Simulate user login logic
      console.log(`Logging in user with email: ${req.input.email}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { success: true, message: "User logged in successfully" };
    }),
  logoutUser: t.procedure.mutation(async () => {
    // Simulate user logout logic
    console.log("Logging out user");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { success: true, message: "User logged out successfully" };
  }),
  projects: t.procedure
    .input(z.object({ userId: z.number() }))
    .query(async (req) => {
      const result = await db.query.projects.findMany({
        with: { files: true },
        where: eq(projects.userId, req.input.userId),
        orderBy: ({ createdAt }, { asc }) => [asc(createdAt)],
      });

      return result;
    }),
  projectWithFiles: t.procedure
    .input(z.object({ id: z.number() }))
    .output(projectWithFilesSchema)
    .query(async (req) => {
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, req.input.id),
        with: { files: true },
        orderBy: ({ createdAt }, { desc }) => [desc(createdAt)],
      });

      invariant(project !== undefined);

      return project;
    }),
  createProject: t.procedure
    .input(createProjectSchema)
    .output(projectWithFilesSchema)
    .mutation(async (req) => {
      const [project] = await db.insert(projects).values(req.input).returning();

      const projectWithFiles: ProjectWithFiles = {
        ...project,
        files: [] as SourceFile[],
      };

      return projectWithFiles;
    }),

  deleteProject: t.procedure
    .input(z.object({ id: z.number() }))
    .output(z.number())
    .mutation(async (req) => {
      const result = await db
        .delete(projects)
        .where(eq(projects.id, req.input.id))
        .returning({ deletedId: projects.id });

      return result[0].deletedId;
    }),

  createFile: t.procedure.input(createFileSchema).mutation(async (req) => {
    // Ensure the project exists before creating a file
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, req.input.projectId),
    });

    invariant(project !== undefined, "Project not found");

    // Upload the file
    // const uploadResult = await uploadFile(req.input.file);
    // invariant(uploadResult !== undefined, "File upload failed");

    const result = await db
      .insert(sourceFiles)
      .values({
        ...req.input,
        name: req.input.name.trim(),
        path: req.input.path.trim(),
      })
      .returning();
    const message = result[0];

    return message;
  }),
} satisfies TRPCRouterRecord);

export type AppRouter = typeof appRouter & AppRouterType;

export default defineEventHandler((event) => {
  const request = toWebRequest(event);

  invariant(request);

  return fetchRequestHandler({
    endpoint: "/trpc",
    req: request,
    router: appRouter,
    createContext() {
      return {};
    },
  });
});

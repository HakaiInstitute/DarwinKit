import { db } from "./";
import {
  ProjectInsert,
  UserInsert,
  users,
  projects,
  sourceFiles,
  SourceFileInsert,
} from "./schema";

const seedData: {
  user: UserInsert;
  projects: ProjectInsert[];
  sourceFiles: SourceFileInsert[];
} = {
  user: {
    email: "steve.adams@hakai.org",
    password: "password123",
  },
  projects: [
    {
      title: "Project 1",
      description: "Description for Project 1",
      userId: 1,
    },
  ],
  sourceFiles: [
    {
      name: "source1.csv",
      path: "/path/to/source1.csv",
      projectId: 1,
    },
  ],
};

const seedUsers = async (): Promise<number> => {
  const [result] = await db
    .insert(users)
    .values(seedData.user)
    .returning({ id: users.id });

  return result.id;
};

const seedProjects = async (userId: number): Promise<number[]> => {
  // Placeholder for project seeding logic
  console.log(`Seeding projects for user ID: ${userId}`);
  const ids = await db
    .insert(projects)
    .values(seedData.projects.map((project) => ({ ...project, userId })))
    .returning({ id: projects.id });

  return ids.map((result) => result.id);
};

const seedSourceFiles = async (projectId: number): Promise<void> => {
  // Placeholder for source file seeding logic
  console.log(`Seeding source files for project ID: ${projectId}`);
  await db
    .insert(sourceFiles)
    .values(seedData.sourceFiles.map((file) => ({ ...file, projectId })));
  console.log(`Source files seeded for project ID: ${projectId}`);
};

export const seedDatabase = async () => {
  try {
    console.log("Starting database seeding...");

    const userId = await seedUsers();
    const projectIds = await seedProjects(userId);
    await Promise.all(
      projectIds.map((projectId) => seedSourceFiles(projectId))
    );

    console.log("Database seeding completed successfully");
    return { success: true };
  } catch (error) {
    console.error("Database seeding failed:", error);
    throw error;
  }
};

import { createFileRoute, ErrorComponent, invariant, useRouter } from "@tanstack/react-router";
import { Button } from "~/components/ui/button.tsx";
import { useCreateProject, useProjects } from "~/hooks/useApi.ts";
import { useAuth } from "~/hooks/useAuth.ts";

export const Route = createFileRoute("/old")({
  component: IndexComponent,
  errorComponent: ErrorComponent,
});

export function IndexComponent() {
  const { user } = useAuth(true);
  const router = useRouter();

  // Query to list projects
  const projectsQuery = useProjects({ limit: 10, offset: 0 });

  // Mutation to create projects
  const createProjectMutation = useCreateProject();

  const createAndNavigateToProject = async ({ title }: { title: string }) => {
    invariant(user, "User must be defined to create a project");
    invariant(title, "Title must be defined to create a project");

    const project = await createProjectMutation.mutateAsync({
      title: title,
      description: `Project created by ${user.email}`,
    });

    await router.navigate({
      to: `/projects/$projectId`,
      params: { projectId: project.id.toString() },
    });
  };

  return (
    <div className="mx-auto min-h-dvh flex flex-col items-stretch justify-center max-w-4xl xl:max-w-7xl px-4 sm:px-6 xl:px-8">
      <h1 className="text-4xl mb-8 font-bold font-serif">DarwinKit Projects</h1>

      <p className="text-lg mb-6">
        Welcome to DarwinKit, a biodiversity mapping tool.
      </p>

      {/* Projects List */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-4">Your Projects</h2>
        {projectsQuery.isLoading && <p className="text-gray-600">Loading projects...</p>}
        {projectsQuery.error && (
          <p className="text-red-600">
            Error loading projects: {projectsQuery.error.message}
          </p>
        )}
        {projectsQuery.data && (
          <div className="space-y-3">
            {projectsQuery.data.length === 0
              ? (
                <p className="text-gray-600 italic">
                  No projects yet. Create your first project!
                </p>
              )
              : (
                projectsQuery.data.map((project) => (
                  <div
                    key={project.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                  >
                    <h3 className="font-medium text-lg">{project.title}</h3>
                    <p className="text-gray-600 text-sm">{project.description}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      Created: {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))
              )}
          </div>
        )}
      </div>

      <Button
        onClick={() => createAndNavigateToProject({ title: "New Project" })}
        disabled={createProjectMutation.isPending}
      >
        {createProjectMutation.isPending ? "Creating..." : "Create New Project"}
      </Button>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { match, P } from "ts-pattern";
import { useAuth } from "../hooks/useAuth";
import { trpcReact } from "../trpc";

export const Route = createFileRoute("/projects/")({
  component: ProjectsComponent,
});

export default function ProjectsComponent() {
  const { user } = useAuth();
  const projects = trpcReact.projects.useQuery({
    userId: user?.id ?? 0,
  });

  return (
    <main className="relative">
      {match(user)
        .with({ id: P.number }, ({ email }) => (
          <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Projects</h1>
            <p className="mb-4">
              Welcome, <strong>{email}</strong>! Here you can manage your
              projects.
            </p>

            <Link
              to="/projects/create"
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Create New Project
            </Link>

            {match(projects)
              .with({ isLoading: true }, () => (
                <p className="mt-4">Loading projects...</p>
              ))
              .with({ data: P.not(undefined) }, ({ data }) => (
                <div className="mt-6">
                  <h2 className="text-xl font-semibold mb-4">Your Projects</h2>
                  <ul>
                    {data.map((project) => (
                      <li key={project.id} className="mt-2">
                        <Link
                          to={`/projects/$projectId`}
                          params={{ projectId: project.id.toString() }}
                          className="text-blue-500 hover:underline"
                        >
                          {project.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
              .with(
                {
                  data: P.array([]),
                },
                () => (
                  <div className="mt-4">
                    <p>No projects found. Start by creating one!</p>
                  </div>
                )
              )
              .with({ error: P.not(undefined) }, ({ error }) => (
                <p className="mt-4 text-red-500">
                  Error loading projects: {String(error)}
                </p>
              ))
              .exhaustive()}
          </div>
        ))
        .otherwise(() => (
          <div className="flex flex-col items-center justify-center h-screen">
            <h1 className="text-4xl font-bold mb-4">Welcome to DarwinKit</h1>

            <Link
              to="/login"
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Log In
            </Link>
          </div>
        ))}
    </main>
  );
}

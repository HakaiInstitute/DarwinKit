import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { match, P } from "ts-pattern";
import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogActions,
} from "./components/ui/dialog";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Icon } from "./components/ui/icon";
import { useAuth } from "../hooks/useAuth";
import { trpcReact } from "../trpc";

export const Route = createFileRoute("/projects/create")({
  component: ProjectsCreateComponent,
});

export default function ProjectsCreateComponent() {
  const { user } = useAuth();

  console.log("User in ProjectsCreateComponent:", user, user === null);

  if (user === null) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-4xl font-bold mb-4">Welcome to DarwinKit</h1>
        <Link
          to="/login"
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Log In
        </Link>
      </div>
    );
  }

  const projects = trpcReact.projects.useQuery({
    userId: user.id,
  });

  return (
    <main className="relative">
      {match(user)
        .with({ id: P.string }, () => (
          <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-8">
              <Link
                to="/projects"
                className="text-sm text-blue-600 hover:text-blue-500 mb-2 inline-block"
              >
                ← Back to Projects
              </Link>
              <h1 className="text-3xl font-bold text-slate-900">
                Create New Project
              </h1>
              <p className="mt-2 text-slate-600">
                Create a new data mapping project to transform your scientific
                datasets
              </p>
            </div>

            {projects.data && projects.data.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-medium text-slate-900 mb-4">
                  Recent Projects
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projects.data.slice(0, 6).map((project) => (
                    <Link
                      key={project.id}
                      to={`/projects/$projectId`}
                      params={{ projectId: project.id.toString() }}
                      className="p-4 border border-slate-200 rounded-lg hover:border-slate-300 hover:shadow-sm transition-all"
                    >
                      <h3 className="font-medium text-slate-900 truncate">
                        {project.title}
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Updated{" "}
                        {new Date(project.updatedAt).toLocaleDateString()}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <NewProject userId={user.id} />
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

const useCreateProject = () => {
  return trpcReact.createProject.useMutation({
    onSuccess: (data) => {
      console.log("Project created successfully:", data);
    },
    onError: (error) => {
      console.error("Error creating project:", error);
    },
  });
};

const NewProject = ({ userId }: { userId: number }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();
  const createProject = useCreateProject();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectTitle.trim()) return;

    setIsSubmitting(true);
    try {
      const project = await createProject.mutateAsync({
        title: projectTitle.trim(),
        description: projectDescription.trim(),
        userId: userId,
      });

      setIsDialogOpen(false);
      setProjectTitle("");

      // Navigate to the new project
      navigate({
        to: "/projects/$projectId",
        params: { projectId: project.id.toString() },
      });
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsDialogOpen(true)}
        className="relative block w-full rounded-lg border-2 border-dashed border-slate-300 p-12 text-center hover:border-slate-400 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none transition-colors"
      >
        <Icon icon="note_add" className="mx-auto h-12 w-12 text-blue-500" />
        <span className="mt-2 block text-sm font-semibold text-slate-900">
          Create a new project
        </span>
        <span className="mt-1 block text-sm text-slate-600">
          Start mapping your scientific data to Darwin Core standards
        </span>
      </button>

      <Dialog open={isDialogOpen} onClose={setIsDialogOpen} size="md">
        <DialogTitle>Create New Project</DialogTitle>
        <DialogDescription>
          Give your project a name and description to get started with data
          mapping.
        </DialogDescription>

        <DialogBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="project-name"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Project Name *
              </label>
              <Input
                id="project-name"
                type="text"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder="e.g., Marine Biodiversity Survey 2024"
                required
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="project-description"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Description (optional)
              </label>
              <Textarea
                id="project-description"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Describe your project, data sources, research goals, methodology, or any other relevant details..."
                rows={4}
              />
              <p className="text-xs text-slate-500 mt-1">
                Rich text formatting will be supported in the future. For now,
                use plain text.
              </p>
            </div>
          </form>
        </DialogBody>

        <DialogActions>
          <Button
            outline
            onClick={() => setIsDialogOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!projectTitle.trim() || isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create Project"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

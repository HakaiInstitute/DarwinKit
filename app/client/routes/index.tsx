import {
  createFileRoute,
  ErrorComponent,
  invariant,
} from "@tanstack/react-router";
import { trpcReact } from "../trpc";
import { router } from "../router";
// import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { useAuth } from "../hooks/useAuth";
import { Button } from "./components/ui/button";

export const Route = createFileRoute("/")({
  component: IndexComponent,
  errorComponent: ErrorComponent,
});

function IndexComponent() {
  const { user } = useAuth(true);
  const createProject = trpcReact.createProject.useMutation();
  const utils = trpcReact.useUtils();

  const createAndNavigateToProject = async ({ title }: { title: string }) => {
    invariant(user, "User must be defined to create a project");
    invariant(title, "Title must be defined to create a project");

    const project = await createProject.mutateAsync({ title, userId: user.id });

    utils.projects.invalidate();

    router.navigate({
      to: `/project/${project.id}`,
      viewTransition: true,
    });
  };

  return (
    <div className="mx-auto min-h-dvh flex flex-col items-stretch justify-center max-w-4xl xl:max-w-7xl px-4 sm:px-6 xl:px-8">
      <h1 className="text-4xl mb-8 font-bold font-serif">Hello</h1>

      <p className="text-lg mb-4">
        Welcome to DarwinKit, a biodiversity mapping tool.
      </p>

      <Button
        onClick={() => createAndNavigateToProject({ title: "New Project" })}
      >
        Create New Project
      </Button>
    </div>
  );
}

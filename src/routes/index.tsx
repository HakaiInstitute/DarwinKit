import { createFileRoute } from "@tanstack/react-router";
import { CreateProjectMutationForm } from "~/components/project-mutation.tsx";
import { ListProjectsQuery } from "~/components/project-query.tsx";
import { Link } from "../components/ui/link.tsx";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold text-blue-600 mb-4">
        DarwinKit - Hono RPC Playground
      </h1>
      <p className="text-gray-700 mb-4">
        Welcome to DarwinKit with Hono RPC backend!
      </p>
      <hr className="my-4 border-gray-300" />
      <Link
        to="/old"
        className="inline-block bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mb-4"
      >
        Go to projects demo
      </Link>
      <CreateProjectMutationForm />
      <hr className="my-4 border-gray-300" />
      <ListProjectsQuery />
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { CreateProjectMutationForm } from "~/components/orpc-mutation";
import { ListProjectsQuery } from "~/components/orpc-query";
import { Link } from "../components/ui/link";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold text-blue-600 mb-4">DarwinKit - oRPC Playground</h1>
      <p className="text-gray-700 mb-4">
        You can visit the{" "}
        <a href="/api" className="text-blue-500 hover:underline">
          Redirect to Scalar API Reference
        </a>{" "}
        page.
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

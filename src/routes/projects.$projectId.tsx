import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { match, P } from "ts-pattern";
import { z } from "zod/v4";
import { Spinner } from "~/components/Spinner";
import { orpc } from "../lib/orpc";

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectIndexComponent,
});

function ProjectIndexComponent() {
  const projectId = Route.useParams({
    select: ({ projectId }) => {
      return z.coerce.number().parse(projectId);
    },
  });
  const projectQuery = useQuery(
    orpc.project.find.queryOptions({
      input: { id: projectId },
    })
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh h-full mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {match(projectQuery)
        .with({ data: P.not(undefined) }, ({ data: project }) => (
          <div className="mx-auto max-w-3xl">
            <h1 className="p-2 text-3xl font-semibold border-b mb-4 font-serif">
              {project.title ? project.title : "Untitled..."}
            </h1>

            <ul className="space-y-4 mb-6">
              {project.files.map((file, idx) => (
                <li key={idx}>
                  {file.name} / {file.path}
                </li>
              ))}
            </ul>
          </div>
        ))
        .with({ isLoading: true }, () => {
          return <Spinner />;
        })
        .with({ error: P.not(undefined) }, (c) => {
          return <span>ERROR: {c.failureReason?.message ?? "unknown"}</span>;
        })
        .exhaustive()}
    </div>
  );
}

// const FileView = ({ file }: { file: SourceFile }) => (
//   <div key={file.id} className={"relative p-4 rounded-lg text-zinc-950"}>
//     <div className="flex gap-4 items-start">
//       <span>{file.name}</span>
//     </div>
//   </div>
// );

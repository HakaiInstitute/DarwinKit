import { useProjects } from "~/hooks/useApi.ts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table.tsx";
import { Button } from "./ui/button.tsx";

export function ListProjectsQuery() {
  const { data, isLoading, error, refetch } = useProjects({
    limit: 50,
    offset: 0,
  });

  if (isLoading) {
    return <p>Loading projects...</p>;
  }

  if (error) {
    return <p>Error loading projects: {error.message}</p>;
  }

  if (!data) {
    return <p>No data available</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Projects</h2>
        <Button onClick={() => refetch()}>
          Refresh Projects
        </Button>
      </div>

      <Table grid>
        <TableHead>
          <TableRow>
            <TableHeader>ID</TableHeader>
            <TableHeader>Title</TableHeader>
            <TableHeader>Description</TableHeader>
            <TableHeader>Created</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.length === 0
            ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted">
                  No projects found. Create your first project!
                </TableCell>
              </TableRow>
            )
            : (
              data.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-mono text-sm">{project.id}</TableCell>
                  <TableCell className="font-medium">{project.title}</TableCell>
                  <TableCell>{project.description}</TableCell>
                  <TableCell>{new Date(project.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))
            )}
        </TableBody>
      </Table>
    </div>
  );
}

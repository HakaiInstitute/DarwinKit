import { useQuery } from "@tanstack/react-query";
import { orpc } from "~/lib/orpc";

export function ListProjectsQuery() {
  const { data, isLoading, error, refetch } = useQuery(
    orpc.project.list.queryOptions({
      input: { limit: 50, offset: 0 },
    })
  );

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
    <div>
      <h2>oRPC and Tanstack Query | List Projects example</h2>

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Description</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ textAlign: "center", padding: "2rem" }}>
                No projects found. Create your first project!
              </td>
            </tr>
          ) : (
            data.map((project) => (
              <tr key={project.id}>
                <td>{project.id}</td>
                <td>{project.title}</td>
                <td>{project.description}</td>
                <td>{new Date(project.createdAt).toLocaleDateString()}</td>
              </tr>
            ))
          )}
        </tbody>

        <tfoot>
          <tr>
            <td colSpan={4}>
              <button type="button" onClick={() => refetch()}>
                Refresh Projects
              </button>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

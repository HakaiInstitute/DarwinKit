import { useCreateProject } from "~/hooks/useApi.ts";

export function CreateProjectMutationForm() {
  const { mutate, isPending, error } = useCreateProject();

  return (
    <div>
      <h2>Hono RPC and TanStack Query | Create Project example</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.target as HTMLFormElement);

          const title = form.get("title") as string;
          const description = (form.get("description") as string | null) ?? "";

          mutate({
            title,
            description,
          });
        }}
      >
        <label>
          Title
          <input type="text" name="title" required />
        </label>
        <label>
          Description
          <textarea name="description" />
        </label>
        <button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create Project"}
        </button>
      </form>

      {error && (
        <p style={{ color: "red" }}>
          Error: {error.message}
        </p>
      )}
    </div>
  );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "~/lib/orpc";

export function CreateProjectMutationForm() {
  const queryClient = useQueryClient();

  const { mutate } = useMutation(
    orpc.project.create.mutationOptions({
      async onSuccess() {
        await queryClient.invalidateQueries({ queryKey: ["project.list"] });
      },
      onError(error) {
        alert(error.message);
      },
    })
  );

  return (
    <div>
      <h2>oRPC and Tanstack Query | Create Project example</h2>

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
        <button type="submit">Create Project</button>
      </form>
    </div>
  );
}

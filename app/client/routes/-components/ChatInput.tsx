import { Field, Label, Textarea } from "@headlessui/react";
import { AnyFieldApi, useForm } from "@tanstack/react-form";
import { z } from "zod";

const formSchema = z.object({
  content: z.string().min(0, "Messages must be at least 1 character long"),
});

function FieldInfo({ field }: { field: AnyFieldApi }) {
  return (
    <>
      {field.state.meta.isTouched && field.state.meta.errors.length ? (
        <em>{field.state.meta.errors.map((err) => err.message).join(",")}</em>
      ) : null}
      {field.state.meta.isValidating ? "Validating..." : null}
    </>
  );
}

export function ChatInput({
  isStreaming,
  onSubmit,
}: {
  isStreaming: boolean;
  onSubmit: ({ content }: { content: string }) => Promise<void>;
}) {
  const messageForm = useForm({
    defaultValues: {
      content: "",
    },
    validators: {
      onChange: formSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        await onSubmit(value);
        messageForm.reset();
      } catch (error) {
        console.error("Error submitting message:", error);
      }
    },
  });

  const handleKeySubmission = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.metaKey) {
      e.preventDefault();
      messageForm.handleSubmit(e);
    }
  };

  return (
    <div className="flex items-start w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          messageForm.handleSubmit();
        }}
        className="relative w-full"
      >
        <div className="rounded-lg bg-white outline-1 -outline-offset-1 outline-gray-300 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-zinc-600">
          <messageForm.Field
            name="content"
            children={(field) => {
              return (
                <Field>
                  <Label htmlFor={field.name} className="sr-only">
                    Send a message
                  </Label>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    rows={3}
                    placeholder="Write your message..."
                    className="block w-full resize-none bg-transparent px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none sm:text-sm/6"
                    onKeyDown={handleKeySubmission}
                    disabled={isStreaming}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    minLength={1}
                    maxLength={20000}
                  />
                  <FieldInfo field={field} />
                </Field>
              );
            }}
          />

          {/* Spacer element to match the height of the toolbar */}
          <div aria-hidden="true" className="py-2">
            {/* Matches height of button in toolbar (1px border + 36px content height) */}
            <div className="py-px">
              <div className="h-9" />
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex justify-between py-2 pr-2 pl-3">
          <div className="flex items-center space-x-5"></div>
          <div className="shrink-0">
            <messageForm.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex items-center rounded-md bg-zinc-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-600 disabled:bg-gray-400"
                >
                  {isSubmitting || isStreaming ? "Generating..." : "Send"}
                </button>
              )}
            />
          </div>
        </div>
      </form>
    </div>
  );
}

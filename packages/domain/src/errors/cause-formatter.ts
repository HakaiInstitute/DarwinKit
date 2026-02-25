import * as Cause from "effect/Cause";

type ErrorFormatter<E> = (error: E) => string;

export function prettyPrintCause<E>(
  cause: Cause.Cause<E>,
  formatter: ErrorFormatter<E>,
): string {
  const failures = Cause.failures(cause);
  const defects = Cause.defects(cause);

  if (Cause.isEmpty(cause)) {
    return "No errors";
  }

  if (defects.length > 0) {
    const defectList = Array.from(defects).map((d) => String(d)).join("\n  - ");
    return `Unexpected defect: ${defectList}\n\nThis indicates a bug. Please report this issue.`;
  }

  if (failures.length > 0) {
    const errorMessages = Array.from(failures).map(formatter);

    if (errorMessages.length > 1) {
      return `Multiple errors occurred:\n\n${
        errorMessages.map((msg, idx) => `${idx + 1}. ${msg}`).join("\n\n")
      }`;
    }

    return errorMessages[0] || "Unknown error";
  }

  return "Unknown error state";
}

export function createTaggedFormatter<
  Errors extends { readonly _tag: string },
>(
  formatters: {
    [K in Errors["_tag"]]: (error: Extract<Errors, { _tag: K }>) => string;
  },
): (error: Errors) => string {
  return (error: Errors) => {
    const formatter = formatters[error._tag as keyof typeof formatters] as (
      error: Errors,
    ) => string;
    return formatter(error);
  };
}

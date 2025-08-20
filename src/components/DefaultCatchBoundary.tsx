import type { ErrorComponentProps } from "@tanstack/react-router";
import { ErrorComponent, rootRouteId, useMatch, useRouter } from "@tanstack/react-router";
import { Button } from "./ui/button.tsx";
import { Link } from "./ui/link.tsx";

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter();
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  });

  console.error(error);

  return (
    <div className="min-w-0 flex-1 p-4 flex flex-col items-center justify-center gap-6">
      <ErrorComponent error={error} />
      <div className="flex gap-2 items-center flex-wrap">
        <Button
          onClick={() => {
            void router.invalidate();
          }}
          className={`px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded text-white uppercase font-extrabold`}
        >
          Try Again
        </Button>
        {isRoot
          ? (
            <Link
              to="/"
              className={`px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded text-white uppercase font-extrabold`}
            >
              Home
            </Link>
          )
          : (
            <Button
              className={`px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded text-white uppercase font-extrabold`}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                globalThis.history.back();
              }}
            >
              Go Back
            </Button>
          )}
      </div>
    </div>
  );
}

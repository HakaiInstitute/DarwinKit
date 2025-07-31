import { createRouter } from "@tanstack/react-router";

import { trpcReact } from "./trpc";
import { routeTree } from "./routeTree.gen";
import { Spinner } from "./routes/-components/Spinner";

export const router = createRouter({
  routeTree,
  scrollRestoration: true,
  defaultPreload: "intent",
  defaultPendingComponent: () => (
    <div
      className={`grow w-full h-full min-h-dvh flex items-center justify-center`}
    >
      <Spinner />
    </div>
  ),
  context: {
    trpc: trpcReact,
  },
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

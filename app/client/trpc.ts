import { createTRPCReact } from "@trpc/react-query";
import {
  splitLink,
  unstable_httpSubscriptionLink,
  createTRPCClient,
  loggerLink,
  unstable_httpBatchStreamLink,
} from "@trpc/client";
import { QueryClient } from "@tanstack/react-query";
import SuperJSON from "superjson";
import type { AppRouter } from "../server/router";
import { createQueryClient } from "../query-client";

const getUrl = () => {
  const base = (() => {
    if (typeof window !== "undefined") return window.location.origin;
    if (process.env.APP_URL) return process.env.APP_URL;
    return `http://localhost:${process.env.PORT ?? 3000}`;
  })();

  return `${base}/trpc`;
};

const config = {
  links: [
    // adds pretty logs to your console in development and logs errors in production
    loggerLink(),
    splitLink({
      condition: (op) => op.type === "subscription",
      true: unstable_httpSubscriptionLink({
        url: getUrl(),
        transformer: SuperJSON,
      }),
      false: unstable_httpBatchStreamLink({
        url: getUrl(),
        transformer: SuperJSON,
      }),
    }),
  ],
};

let clientQueryClientSingleton: QueryClient | undefined = undefined;

export const getQueryClient = () => {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return createQueryClient();
  } else {
    // Browser: use singleton pattern to keep the same query client
    return (clientQueryClientSingleton ??= createQueryClient());
  }
};

export const trpcReact = createTRPCReact<AppRouter>();
export const trpcClient = createTRPCClient<AppRouter>(config);

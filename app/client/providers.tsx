"use client";

import { QueryClientProvider } from "@tanstack/react-query";
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { getQueryClient, trpcReact, trpcClient } from "./trpc";

export function TRPCProviders(props: Readonly<{ children: React.ReactNode }>) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={getQueryClient()}>
      <trpcReact.Provider client={trpcClient} queryClient={queryClient}>
        {props.children}
      </trpcReact.Provider>
      {/* <ReactQueryDevtools initialIsOpen={false} /> */}
    </QueryClientProvider>
  );
}

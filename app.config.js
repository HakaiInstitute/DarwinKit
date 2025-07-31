import { createApp } from "vinxi";
import reactRefresh from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default createApp({
  server: {
    preset: "aws-lambda",
    awsLambda: {
      streaming: true,
    },
  },
  routers: [
    {
      type: "static",
      name: "public",
      dir: "./app/client/public",
    },
    {
      type: "http",
      name: "trpc",
      base: "/trpc",
      handler: "./app/server/router.ts",
      target: "server",
      plugins: () => [],
    },
    {
      type: "spa",
      name: "client",
      handler: "./index.html",
      target: "browser",
      plugins: () => [
        TanStackRouterVite({
          routesDirectory: "./app/client/routes",
          generatedRouteTree: "./app/client/routeTree.gen.ts",
          autoCodeSplitting: true,
        }),
        reactRefresh(),
      ],
    },
  ],
});

import { RPCHandler } from "@orpc/server/fetch";
import { createServerFileRoute } from "@tanstack/react-start/server";
import { db } from "~/db";
import { router } from "~/router/index";

const handler = new RPCHandler(router);

async function handle({ request }: { request: Request }) {
  const { response } = await handler.handle(request, {
    prefix: "/api/rpc",
    context: {
      db: db,
      session: {
        user: { id: 1, password: "Demo User", email: "demo@darwinkit.com" },
      },
    },
  });

  return response ?? new Response("Not Found", { status: 404 });
}

export const ServerRoute = createServerFileRoute("/api/rpc/$").methods({
  HEAD: handle,
  GET: handle,
  POST: handle,
  PUT: handle,
  PATCH: handle,
  DELETE: handle,
});

import { ORPCError, os } from "@orpc/server";
import type { User } from "~/schemas/user";

export const requiredAuthMiddleware = os
  .$context<{ session?: { user?: User } }>()
  .middleware(async ({ context, next }) => {
    const session = context.session ?? (await getSession());

    if (!session.user) {
      throw new ORPCError("UNAUTHORIZED");
    }

    return next({
      context: { user: session.user },
    });
  });

async function getSession(): Promise<{ user?: User }> {
  // const header = getHeaders()

  return new Promise((resolve) => {
    resolve({ user: { id: 1, email: "test@test.contact@unnoq.com", password: "123456" } });
  });
}

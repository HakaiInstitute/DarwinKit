import { os } from "@orpc/server";
import { db } from "../db";

// Middleware to provide the database context to ORPC routes
// Could be used for mocking eventually
export const dbProviderMiddleware = os
  .$context<{ db: typeof db }>()
  .middleware(async ({ next }) => {
    return next({
      context: { db },
    });
  });

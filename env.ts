import { createEnv } from "@t3-oss/env-core";
import process from "node:process";
import * as z from "zod/v4";

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
  },

  clientPrefix: "VITE_",
  client: {},
  // runtimeEnv: process.env,
  emptyStringAsUndefined: true,

  runtimeEnvStrict: {
    DATABASE_URL: process.env.DATABASE_URL,
  },
});

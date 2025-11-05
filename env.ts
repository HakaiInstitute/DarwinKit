import { createEnv } from "@t3-oss/env-core";
import * as z from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
  },

  clientPrefix: "VITE_",
  client: {},
  // runtimeEnv: Deno.env.toObject(),
  emptyStringAsUndefined: true,

  runtimeEnvStrict: {
    DATABASE_URL: Deno.env.get("DATABASE_URL"),
  },
});

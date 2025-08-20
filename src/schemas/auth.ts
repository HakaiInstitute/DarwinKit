import * as z from "zod/v4";

export const CredentialSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const TokenSchema = z.object({
  token: z.string(),
});

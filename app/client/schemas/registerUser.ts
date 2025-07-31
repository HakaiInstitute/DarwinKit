import { z } from "zod/v4";
export const registerSchema = z
  .object({
    id: z.number(),
    email: z.email("Please use a valid email address."),
    password: z
      .string()
      .min(8, "Please use a password at least 8 characters long."),
    passwordConfirm: z
      .string()
      .min(8, "Please use a password at least 8 characters long."),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Passwords do not match.",
    path: ["passwordConfirm"],
  })
  .transform((data) => ({
    id: data.id,
    email: data.email,
    password: data.password,
  }));

export type RegisterUser = z.infer<typeof registerSchema>;

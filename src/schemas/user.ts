import * as z from "zod/v4";

export type NewUser = z.infer<typeof NewUserSchema>;
export type User = z.infer<typeof UserSchema>;

export const NewUserSchema = z
  .object({
    email: z.email(),
    password: z.string(),
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Passwords don't match",
    path: ["passwordConfirm"],
  });

export const UserSchema = z.object({
  id: z.number(),
  email: z.email(),
  password: z.string(),
});

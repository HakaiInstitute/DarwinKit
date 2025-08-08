import { JSON_SCHEMA_REGISTRY } from "@orpc/zod/zod4";
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

JSON_SCHEMA_REGISTRY.add(NewUserSchema, {
  examples: [
    {
      email: "john@doe.com",
      password: "123456",
      passwordConfirm: "123456",
    },
  ],
});

export const UserSchema = z.object({
  id: z.number(),
  email: z.email(),
  password: z.string(),
});

JSON_SCHEMA_REGISTRY.add(UserSchema, {
  examples: [
    {
      id: 1,
      email: "john@doe.com",
      password: "123456",
    },
  ],
});

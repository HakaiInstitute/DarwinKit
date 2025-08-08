import { userSchema } from "~/db/schema";
import { authed, pub } from "../orpc";
import { CredentialSchema, TokenSchema } from "../schemas/auth";
import { NewUserSchema, UserSchema } from "../schemas/user";

export const signup = pub
  .route({
    method: "POST",
    path: "/auth/signup",
    summary: "Sign up a new user",
    tags: ["Authentication"],
  })
  .input(NewUserSchema)
  .output(UserSchema)
  .handler(async ({ input }) => {
    return {
      id: 1,
      email: input.email,
      password: input.password,
    };
  });

export const signin = pub
  .route({
    method: "POST",
    path: "/auth/signin",
    summary: "Sign in a user",
    tags: ["Authentication"],
  })
  .input(CredentialSchema)
  .output(TokenSchema)
  .handler(async () => {
    return { token: "token" };
  });

export const me = authed
  .route({
    method: "GET",
    path: "/auth/me",
    summary: "Get the current user",
    tags: ["Authentication"],
  })
  .output(userSchema)
  .handler(({ context }) => {
    return context.user;
  });

import { type AnyFieldApi, useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod/v4";
import { AuthLayout } from "~/components/ui/auth-layout";
import { Button } from "~/components/ui/button";
import { Field, Label } from "~/components/ui/fieldset";
import { Heading } from "~/components/ui/heading";
import { Input } from "~/components/ui/input";
import { Strong, Text, TextLink } from "~/components/ui/text";
import { useAuth } from "../hooks/useAuth";
import logger from "../utils/test-logger";
// import { Logo } from './logo'

const verifyTokenSearchSchema = z.object({
  token: z.string().optional(),
});

type VerificationState = "unknown" | "pending" | "verified" | "error";

type VerifyTokenSearch = z.infer<typeof verifyTokenSearchSchema>;

export const Route = createFileRoute("/verify-email")({
  component: VerifyEmailComponent,
  validateSearch: (search: Record<string, unknown>): VerifyTokenSearch =>
    verifyTokenSearchSchema.parse(search),
  beforeLoad: ({ search }) => {
    logger.log("beforeLoad", search);
    const { token } = verifyTokenSearchSchema.parse(search);
    if (token) {
      logger.log("Token found in search:", token);
      return { token };
    }
    logger.log("No token found in search");
  },
});

function FieldInfo({ field }: { field: AnyFieldApi }) {
  return (
    <>
      {field.state.meta.isTouched && !field.state.meta.isValid ? (
        <em>{field.state.meta.errors.join(", ")}</em>
      ) : null}
      {field.state.meta.isValidating ? "Validating..." : null}
    </>
  );
}

export function VerifyEmailComponent() {
  const { token } = Route.useSearch();
  const { user } = useAuth();
  const [verified, setVerified] = useState<VerificationState>("unknown");

  const form = useForm({
    defaultValues: {
      email: user?.email ?? "",
      token: token ?? "",
    },
    onSubmit: async ({ value }) => {
      logger.log(`Submitting form with values:`, value);
      const result = true;
      // const result = await verifyEmailByToken(value.token);

      if (result) {
        setVerified("verified");
        logger.log("Email verified successfully");
      } else {
        setVerified("error");
        logger.error("Email verification failed");
      }
    },
  });

  return (
    <AuthLayout>
      <form
        className="grid w-full max-w-sm grid-cols-1 gap-8"
        onSubmit={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await form.handleSubmit();
        }}
      >
        {/* <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" /> */}
        <Heading>Verify Your Email</Heading>
        <Text>Check your inbox and click the registration link.</Text>

        {verified === "pending" && <Text>Verifying...</Text>}
        {verified === "verified" && (
          <Text>Your email has been successfully verified! You can now log in.</Text>
        )}
        {verified === "error" && (
          <Text>There was an error verifying your email. Please try again or contact support.</Text>
        )}
        {verified === "unknown" && (
          <Text>Please enter your email and the verification token you received.</Text>
        )}

        <form.Field
          name="email"
          children={(field) => {
            return (
              <Field>
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                <FieldInfo field={field} />
              </Field>
            );
          }}
        />
        <form.Field
          name="token"
          children={(field) => {
            return (
              <Field>
                <Label htmlFor={field.name}>Token</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                <FieldInfo field={field} />
              </Field>
            );
          }}
        />
        <Button type="submit" className="w-full">
          Verify token
        </Button>

        <Text>
          Don’t have an account?{" "}
          <TextLink to="/register">
            <Strong>Sign up</Strong>
          </TextLink>
        </Text>
      </form>
    </AuthLayout>
  );
}

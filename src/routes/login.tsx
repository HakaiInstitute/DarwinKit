import { type AnyFieldApi, useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { AuthLayout } from "~/components/ui/auth-layout";
import { Button } from "~/components/ui/button";
import { Field, Fieldset, Label } from "~/components/ui/fieldset";
import { Heading } from "~/components/ui/heading";
import { Input } from "~/components/ui/input";
import { Link } from "~/components/ui/link";
import { Strong, Text, TextLink } from "~/components/ui/text";
import { useAuth } from "../hooks/useAuth";

export const Route = createFileRoute("/login")({
  component: LoginComponent,
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

export function LoginComponent() {
  const { user, login } = useAuth();

  const form = useForm({
    defaultValues: {
      email: "steve@steve-adams.me",
      password: "U1tr4.M3g4",
    },
    // validators: {
    //   onChange: loginSchema,
    // },
    onSubmit: async ({ value }) => {
      await login(value.email, value.password);
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

        {user ? (
          <Text>
            <span className="text-xl">
              You&apos;re already logged in as <strong>{user.email}</strong>.
            </span>
            <br />
            <br />
            <span>
              You can{" "}
              <Link className="text-blue-600 hover:text-blue-800" to="/logout">
                click here to log out
              </Link>
            </span>
            .
          </Text>
        ) : (
          <Heading>Sign in to your account</Heading>
        )}

        <Fieldset className="space-y-4">
          <form.Field
            name="email"
            children={(field) => {
              return (
                <Field>
                  <Label htmlFor={field.name}>
                    Email
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </Label>
                  <FieldInfo field={field} />
                </Field>
              );
            }}
          />
          <form.Field
            name="password"
            children={(field) => {
              return (
                <Field>
                  <Label htmlFor={field.name}>
                    Password
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      type="password"
                    />
                  </Label>
                  <FieldInfo field={field} />
                </Field>
              );
            }}
          />
        </Fieldset>
        <Button type="submit" className="w-full">
          Login
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

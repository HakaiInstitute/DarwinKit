import { createFileRoute } from "@tanstack/react-router";
import { AuthLayout } from "./components/ui/auth-layout";
import { Button } from "./components/ui/button";
import { Field, Fieldset, Label } from "./components/ui/fieldset";
import { Heading } from "./components/ui/heading";
import { Input } from "./components/ui/input";
import { Strong, Text, TextLink } from "./components/ui/text";
import { type AnyFieldApi, useForm } from "@tanstack/react-form";
import { UserInsert } from "../../server/db/schema";
import { registerSchema } from "../schemas/registerUser";

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

const registerUser = async (data: UserInsert) => {
  // Simulate an API call
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(`Creating new user with data:`, data);
      resolve(true);
    }, 1000);
  });
};

export const Route = createFileRoute("/register")({
  component: RegisterComponent,
});

export function RegisterComponent() {
  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      passwordConfirm: "",
    },
    validators: {
      onChange: registerSchema,
    },
    onSubmit: async ({ value }) => {
      console.log(`Submitting form with values:`, value);
      const result = await registerUser(value);
      console.log(`Login result:`, result);

      if (result) {
        // Handle successful registration, e.g., redirect to login or show success message
        alert("Registration successful! Please check your email to verify.");
      } else {
        // Handle registration failure, e.g., show error message
        console.log(`Registration failed:`, result);
      }
    },
  });

  return (
    <AuthLayout>
      <form
        className="grid w-full max-w-sm grid-cols-1 gap-8"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        {/* <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" /> */}
        <Heading>Create your account</Heading>
        <Fieldset className="space-y-4">
          <Field>
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
          </Field>
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
          <form.Field
            name="passwordConfirm"
            children={(field) => {
              return (
                <Field>
                  <Label htmlFor={field.name}>
                    Confirm Password
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
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
          children={([canSubmit, isSubmitting]) => (
            <>
              <Button type="submit" className="w-full" disabled={!canSubmit}>
                {isSubmitting ? "Registering..." : "Submit"}
              </Button>
            </>
          )}
        />
        <Text>
          Already have an account?{" "}
          <TextLink to="/login">
            <Strong>Sign in</Strong>
          </TextLink>
        </Text>
      </form>
    </AuthLayout>
  );
}

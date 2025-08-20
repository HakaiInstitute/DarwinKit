import { createFileRoute } from "@tanstack/react-router";
import { AuthLayout } from "~/components/ui/auth-layout.tsx";
import { Button } from "~/components/ui/button.tsx";
import { Heading } from "~/components/ui/heading.tsx";
import { Text } from "~/components/ui/text.tsx";

export const Route = createFileRoute("/logout")({
  component: LogoutComponent,
  beforeLoad: () => {
    // logout();
  },
});

export function LogoutComponent() {
  return (
    <AuthLayout>
      {/* <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" /> */}
      <section className="grid w-full max-w-sm grid-cols-1 gap-8 text-center">
        <Heading>Success! You&apos;re safely logged out.</Heading>

        <Text>Want to sign back in?</Text>
        <Button to="/login">Sign in</Button>
      </section>
    </AuthLayout>
  );
}

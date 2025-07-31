// import { useQuery } from "@tanstack/react-query";
// import { match } from "ts-pattern";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/changelog")({
  component: ChangelogComponent,
});

export default function ChangelogComponent() {
  return (
    <main className="relative">
      <div className="relative mx-auto flex max-w-5xl flex-col px-6 py-8 sm:py-12 lg:px-0">
        <h1 className="text-4xl font-bold tracking-tight lg:text-6xl">
          Changelog
        </h1>
        <h2 className="mt-4 text-2xl">See what&apos;s new</h2>
        <p>Nothing is new.</p>
      </div>
    </main>
  );
}

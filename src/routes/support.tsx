import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/support")({
  component: SupportComponent,
});

export default function SupportComponent() {
  return (
    <main className="relative">
      <div className="relative mx-auto flex max-w-5xl flex-col px-6 py-8 sm:py-12 lg:px-0">
        <h1 className="text-4xl font-bold tracking-tight lg:text-6xl">Support</h1>
        <h2 className="mt-4 text-2xl">Learn to use DarwinKit</h2>
        {/* FAQ */}
        <ul>
          <li className="mt-4">
            <h3 className="text-xl font-semibold">How do I get started?</h3>
            <p className="mt-2">
              To get started, you can check out our{" "}
              <Link to="/" className="text-blue-600 hover:underline">
                Getting Started guide
              </Link>
              .
            </p>
          </li>
          <li className="mt-4">
            <h3 className="text-xl font-semibold">Where can I find the API docs?</h3>
            <p className="mt-2">
              Our API documentation is available{" "}
              <Link to="/" className="text-blue-600 hover:underline">
                here
              </Link>
              .
            </p>
          </li>
          <li className="mt-4">
            <h3 className="text-xl font-semibold">How do I report a bug?</h3>
            <p className="mt-2">
              You can report bugs on our{" "}
              <Link to="/" className="text-blue-600 hover:underline">
                Issues page
              </Link>
              .
            </p>
          </li>
        </ul>
        <p className="mt-2 text-lg">
          If you have any questions or need assistance, please{" "}
          <Link to="/" className="text-blue-600 hover:underline">
            contact us
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

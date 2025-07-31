import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { TRPCProviders } from "./providers";

export function App() {
  return (
    <TRPCProviders>
      <RouterProvider router={router} />
    </TRPCProviders>
  );
}

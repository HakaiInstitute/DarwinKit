import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { StackedLayout } from "../components/ui/stacked-layout.tsx";
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from "../components/ui/navbar.tsx";
import { Sidebar, SidebarBody, SidebarItem, SidebarSection } from "../components/ui/sidebar.tsx";
import { Link } from "../components/ui/link.tsx";
import "../app.css";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  errorComponent: (props: ErrorComponentProps) => {
    return (
      <div>
        <p>
          Error: {props.error.message}
        </p>
      </div>
    );
  },
  notFoundComponent: () => <p>Not Found</p>,
  component: RootComponent,
});

function RootComponent() {
  return (
    <StackedLayout
      navbar={
        <Navbar>
          <NavbarSection>
            <Link to="/" className="text-xl font-semibold">
              DarwinKit
            </Link>
          </NavbarSection>
          <NavbarSpacer />
          <NavbarSection>
            <NavbarItem to="/projects">Projects</NavbarItem>
            <NavbarItem to="/support">Support</NavbarItem>
          </NavbarSection>
        </Navbar>
      }
      sidebar={
        <Sidebar>
          <SidebarBody>
            <SidebarSection>
              <SidebarItem to="/">Home</SidebarItem>
              <SidebarItem to="/projects">Projects</SidebarItem>
              <SidebarItem to="/support">Support</SidebarItem>
              <SidebarItem to="/login">Login</SidebarItem>
              <SidebarItem to="/register">Register</SidebarItem>
            </SidebarSection>
          </SidebarBody>
        </Sidebar>
      }
    >
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </StackedLayout>
  );
}

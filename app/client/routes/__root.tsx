import { Avatar } from "./components/ui/avatar";
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "./components/ui/dropdown";
import {
  Navbar,
  NavbarDivider,
  NavbarItem,
  NavbarLabel,
  NavbarSection,
  NavbarSpacer,
} from "./components/ui/navbar";
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from "./components/ui/sidebar";

import {
  createRootRouteWithContext,
  type LinkProps,
  Outlet,
} from "@tanstack/react-router";
import { Strong } from "./components/ui/text";
import { StackedLayout } from "./components/ui/stacked-layout";
import { Icon } from "./components/ui/icon";
import { trpcReact } from "../trpc";
import { useAuth } from "../hooks/useAuth";

export interface RouterAppContext {
  trpc: typeof trpcReact;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
});

const navItems: { label: string; to: LinkProps["to"] }[] = [
  { label: "Home", to: "/" },
  { label: "Projects", to: "/projects" },
  { label: "Support", to: "/support" },
  { label: "Changelog", to: "/changelog" },
];

function RootComponent() {
  const { user } = useAuth(true);
  const { avatar } = user ?? {};

  return (
    <StackedLayout
      navbar={
        <Navbar>
          <NavbarLabel className="flex items-center gap-2">
            <img src="/logo.svg" className="size-5" /> DarwinKit
          </NavbarLabel>
          <NavbarDivider className="max-lg:hidden" />
          <NavbarSection className="max-lg:hidden">
            {navItems.map(({ label, to }) => (
              <NavbarItem key={label} to={to}>
                {label}
              </NavbarItem>
            ))}
          </NavbarSection>
          <NavbarSpacer />
          <NavbarSection>
            <Dropdown>
              <DropdownButton as={NavbarItem}>
                <Avatar
                  src={avatar || null}
                  square
                  initials={avatar ? undefined : user?.name?.[0] || "AN"}
                />
              </DropdownButton>
              <DropdownMenu className="min-w-64" anchor="bottom end">
                <DropdownItem to="/">
                  <Icon icon="user" />
                  <DropdownLabel>My profile</DropdownLabel>
                </DropdownItem>
                <DropdownItem to="/">
                  <Icon icon="settings" />
                  <DropdownLabel>Settings</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem to="/">
                  <Icon icon="verified_user" />
                  <DropdownLabel>Privacy policy</DropdownLabel>
                </DropdownItem>
                <DropdownItem to="/">
                  <Icon icon="lightbulb" />
                  <DropdownLabel>Share feedback</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem to="/logout">
                  <Icon icon="logout" />
                  <DropdownLabel>Sign out</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </NavbarSection>
        </Navbar>
      }
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <SidebarSection className="flex flex-row items-center gap-2">
              <Avatar square slot="icon" src="/logo.svg" className="size-8" />
              <Strong>DarwinKit</Strong>
            </SidebarSection>
          </SidebarHeader>
          <SidebarBody>
            <SidebarSection>
              <SidebarItem to="/">
                <Icon icon="add_circle" />
                <SidebarLabel>New Project</SidebarLabel>
              </SidebarItem>

              <SidebarItem to="/projects">
                <SidebarLabel>Projects</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
            <SidebarSection className="max-lg:hidden">
              <SidebarHeading>Recent Projects</SidebarHeading>
            </SidebarSection>
            <SidebarSpacer />
            <SidebarSection>
              <SidebarItem to="/support">
                <Icon icon="help" />
                <SidebarLabel>Support</SidebarLabel>
              </SidebarItem>
              <SidebarItem to="/changelog">
                <Icon icon="sparkles" />
                <SidebarLabel>Changelog</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
          </SidebarBody>
          <SidebarFooter className="max-lg:hidden">
            {user ? (
              <Dropdown>
                <DropdownButton as={SidebarItem}>
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar
                      src={user?.avatar}
                      className="size-10"
                      square
                      alt="User avatar"
                      initials={user.name?.[0] || "AN"}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm/5 font-medium text-zinc-950 dark:text-white">
                        {user.name}
                      </span>
                      <span className="block truncate text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
                        {user.email}
                      </span>
                    </span>
                  </span>
                  <Icon icon="expand_less" />
                </DropdownButton>
                <DropdownMenu className="min-w-64" anchor="top start">
                  <DropdownItem to="/">
                    <Icon icon="settings" />
                    <DropdownLabel>Settings</DropdownLabel>
                  </DropdownItem>
                  <DropdownDivider />
                  <DropdownItem to="/">
                    <Icon icon="verified_user" />
                    <DropdownLabel>Privacy policy</DropdownLabel>
                  </DropdownItem>
                  <DropdownItem to="/">
                    <Icon icon="lightbulb" />
                    <DropdownLabel>Share feedback</DropdownLabel>
                  </DropdownItem>
                  <DropdownDivider />
                  <DropdownItem to="/logout">
                    <Icon icon="logout" />
                    <DropdownLabel>Sign out</DropdownLabel>
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            ) : (
              <Dropdown>
                <DropdownButton as={SidebarItem}>
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm/5 font-medium text-zinc-950 dark:text-white">
                        Account
                      </span>
                    </span>
                  </span>
                  <Icon icon="expand_less" />
                </DropdownButton>
                <DropdownMenu className="min-w-64" anchor="top start">
                  <DropdownItem to="/login">
                    <Icon icon="logout" />
                    <DropdownLabel>Log In</DropdownLabel>
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            )}
          </SidebarFooter>
        </Sidebar>
      }
    >
      <Outlet />
    </StackedLayout>
  );
}

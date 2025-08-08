import * as Headless from "@headlessui/react";
import type { LinkProps } from "@tanstack/react-router";
import { Link as TanstackLink } from "@tanstack/react-router";

type ExtendedLinkProps = LinkProps & {
  className?: string;
  ref?: React.Ref<HTMLAnchorElement>;
};

export const Link = (props: ExtendedLinkProps) => {
  return (
    <Headless.DataInteractive>
      <TanstackLink {...props} />
    </Headless.DataInteractive>
  );
};

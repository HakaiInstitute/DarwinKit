import clsx from "clsx";

type HeadingProps = {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
} & React.ComponentPropsWithoutRef<"h1" | "h2" | "h3" | "h4" | "h5" | "h6">;

export function Heading({ className, level = 1, ...props }: HeadingProps) {
  const Element: `h${typeof level}` = `h${level}`;

  return (
    <Element
      {...props}
      className={clsx(
        className,
        "font-semibold text-zinc-950 dark:text-white",
        { "text-4xl/tight": level === 1 },
        { "text-2xl/snug": level === 2 },
        { "text-xl/normal": level === 3 },
        { "text-lg/normal": level === 4 },
        { "text-base/normal": level === 5 },
        { "text-sm/relaxed": level === 6 }
      )}
    />
  );
}

export function Subheading({ className, level = 2, ...props }: HeadingProps) {
  const Element: `h${typeof level}` = `h${level}`;

  return (
    <Element
      {...props}
      className={clsx(
        className,
        "text-base/7 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white"
      )}
    />
  );
}

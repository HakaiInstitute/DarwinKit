import clsx from "clsx";
import { match } from "ts-pattern";

type CardProps = {
  header?: React.ReactNode | string;
  footer?: React.ReactNode | string;
  layer?: 0 | 1 | 2 | 3 | 4 | 5;
} & React.HTMLAttributes<HTMLDivElement>;

export function Card({ header, children, footer, layer = 1 }: CardProps) {
  return (
    <div
      className={clsx(
        "divide-y divide-gray-200 overflow-hidden rounded-lg bg-white shadow-",
        match(layer)
          .with(0, () => "shadow-xs")
          .with(1, () => "shadow-sm")
          .with(2, () => "shadow-md")
          .with(3, () => "shadow-lg")
          .with(4, () => "shadow-xl")
          .with(5, () => "shadow-2xl")
          .exhaustive()
      )}
    >
      {header && <div className="px-4 py-5 sm:px-6">{header}</div>}
      <div className="px-4 py-5 sm:p-6">{children}</div>
      {footer && <div className="px-4 py-4 sm:px-6">{footer}</div>}
    </div>
  );
}

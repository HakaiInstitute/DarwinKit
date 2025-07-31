export interface IconProps {
  icon: string;
  size?: number;
  grade?: number;
  weight?: number;
  fill?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const Icon = (props: IconProps) => {
  const {
    icon,
    size = 16,
    grade = -25,
    weight = 400,
    fill = 0,
    className = '',
    style,
    ...rest
  } = props;

  // Check if className contains Tailwind sizing classes
  const hasTailwindSizing = className && /\b(w-\d+|h-\d+|size-\d+)\b/.test(className);

  const iconStyle: React.CSSProperties = {
    fontVariationSettings: `'FILL' ${fill}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' ${size}`,
    ...(!hasTailwindSizing && { fontSize: size }),
    ...style,
  };

  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={iconStyle}
      {...rest}
    >
      {icon}
    </span>
  );
};

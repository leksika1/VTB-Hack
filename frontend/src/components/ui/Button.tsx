import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button as AdmiralButton, IconButton as AdmiralIconButton, type ButtonAppearance } from '@admiral-ds/react-ui';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse';
type Size = 'md' | 'sm' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

const ADMIRAL_APPEARANCE_MAP: Record<Variant, ButtonAppearance> = {
  primary: 'primary',
  secondary: 'tertiary',
  ghost: 'ghost',
  danger: 'danger',
  inverse: 'tertiary',
};

const ADMIRAL_DIMENSION_MAP: Record<Size, 's' | 'm' | 'l'> = {
  sm: 's',
  md: 'm',
  lg: 'l',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth,
  className = '',
  children,
  disabled,
  type = 'button',
  style,
  ...rest
}: ButtonProps) {
  return (
    <AdmiralButton
      type={type}
      appearance={ADMIRAL_APPEARANCE_MAP[variant]}
      dimension={ADMIRAL_DIMENSION_MAP[size]}
      loading={loading}
      disabled={disabled || loading}
      iconStart={icon ? (
        <span className="flex size-full items-center justify-center">{icon}</span>
      ) : undefined}
      style={{
        width: fullWidth ? '100%' : undefined,
        ...style,
      }}
      className={variant === 'inverse' ? `button-on-blue ${className}` : className}
      {...rest}
    >
      {children}
    </AdmiralButton>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

/** Icon-only button with an accessible name and touch target using Admiral DS */
export function IconButton({
  label,
  children,
  className = '',
  type = 'button',
  disabled,
  ...rest
}: IconButtonProps) {
  return (
    <AdmiralIconButton
      type={type}
      appearance="secondary"
      dimension="m"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`shrink-0 ${className}`}
      {...rest}
    >
      {children}
    </AdmiralIconButton>
  );
}

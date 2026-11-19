import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button as AdmiralButton, IconButton as AdmiralIconButton, type ButtonAppearance } from '@admiral-ds/react-ui';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse' | 'onBrand' | 'dangerGhost' | 'dangerSoft' | 'neutral' | 'brand' | 'outline';
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
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'danger',
  inverse: 'white',
  onBrand: 'ghost',
  dangerGhost: 'ghost',
  dangerSoft: 'secondary',
  neutral: 'secondary',
  brand: 'primary',
  outline: 'secondary',
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
  const appearance = ADMIRAL_APPEARANCE_MAP[variant] || 'primary';
  const dimension = ADMIRAL_DIMENSION_MAP[size] || 'm';

  const customClasses = variant === 'onBrand'
    ? '!text-white !bg-white/10 hover:!bg-white/20'
    : variant === 'dangerGhost'
    ? '!text-danger hover:!bg-danger-soft'
    : variant === 'dangerSoft'
    ? '!bg-danger-soft !text-danger hover:brightness-95'
    : '';

  return (
    <AdmiralButton
      type={type}
      appearance={appearance}
      dimension={dimension}
      loading={loading}
      disabled={disabled || loading}
      iconStart={icon}
      style={{
        width: fullWidth ? '100%' : undefined,
        justifyContent: 'center',
        ...style,
      }}
      className={`font-semibold transition-all duration-150 ${customClasses} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </AdmiralButton>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  tone?: 'default' | 'inverse';
}

/** Icon-only button with an accessible name and touch target using Admiral DS */
export function IconButton({
  label,
  children,
  tone = 'default',
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
      className={`shrink-0 ${tone === 'inverse' ? '!text-white !bg-white/10 hover:!bg-white/20' : ''} ${className}`}
      {...rest}
    >
      {children}
    </AdmiralIconButton>
  );
}

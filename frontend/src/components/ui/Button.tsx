import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse' | 'onBrand' | 'dangerGhost' | 'dangerSoft' | 'neutral';
type Size = 'md' | 'sm' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover disabled:bg-line-strong disabled:text-ink-3',
  secondary: 'bg-accent-soft text-accent-ink hover:brightness-95 disabled:opacity-50',
  ghost: 'bg-transparent text-accent-ink hover:bg-accent-soft disabled:opacity-50',
  danger: 'bg-danger text-white hover:brightness-110 disabled:opacity-50',
  inverse: 'bg-white text-brand hover:bg-white/90 disabled:opacity-60',
  onBrand: 'bg-white/12 text-white hover:bg-white/20 disabled:opacity-60',
  dangerGhost: 'bg-transparent text-danger hover:bg-danger-soft disabled:opacity-50',
  dangerSoft: 'bg-danger-soft text-danger hover:brightness-95 disabled:opacity-50',
  neutral: 'bg-surface-muted text-ink hover:bg-surface-sunken disabled:opacity-50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-5 text-[15px] gap-2',
  lg: 'h-12 px-6 text-base gap-2',
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
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-control font-semibold
        transition-[background-color,filter,color] duration-150 select-none whitespace-nowrap
        ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  tone?: 'default' | 'inverse';
}

/** Icon-only button with an accessible name and a 44px touch target */
export function IconButton({ label, children, tone = 'default', className = '', type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center w-11 h-11 rounded-full shrink-0 transition-colors
        ${tone === 'inverse' ? 'text-white hover:bg-white/15' : 'text-ink-2 hover:bg-surface-sunken hover:text-ink'}
        disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

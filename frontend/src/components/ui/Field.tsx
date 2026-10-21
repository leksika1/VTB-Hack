import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  suffix?: string;
  /** Larger text for the main amount of a form */
  emphasis?: boolean;
}

const inputBase = `w-full h-12 px-4 rounded-[var(--radius-control)] bg-surface-muted border text-ink text-[15px]
  placeholder:text-ink-3 transition-colors focus:outline-none focus:bg-surface focus:border-accent focus:ring-[3px] focus:ring-accent/15`;

export function Field({ label, hint, error, suffix, emphasis, className = '', ...rest }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-ink-2 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${inputBase} ${error ? 'border-danger' : 'border-line'} ${suffix ? 'pr-10' : ''}
            ${emphasis ? 'h-14 text-xl font-semibold tabular' : ''}`}
          {...rest}
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" aria-hidden>
            {suffix}
          </span>
        )}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-[13px] text-ink-3 mt-1.5">
          {hint}
        </p>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-[13px] text-danger mt-1.5" role="alert">
      <CircleAlert size={15} className="shrink-0 mt-px" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Money input: text field with decimal keyboard, accepts «1 500,50» */
export function AmountField(props: Omit<FieldProps, 'type' | 'inputMode' | 'suffix'>) {
  return <Field type="text" inputMode="decimal" autoComplete="off" suffix="₽" {...props} />;
}

/** A banner for errors that do not belong to a single field (e.g. network) */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 p-3.5 rounded-xl bg-danger-soft text-danger text-sm">
      <CircleAlert size={18} className="shrink-0 mt-px" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

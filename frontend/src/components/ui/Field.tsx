import type { InputHTMLAttributes, ReactNode } from 'react';
import { Field as AdmiralField, TextInput } from '@admiral-ds/react-ui';
import { ServiceErrorOutline, ServiceErrorSolid } from '@admiral-ds/icons';

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  suffix?: string;
  /** Larger text for the main amount of a form */
  emphasis?: boolean;
}

export function Field({
  label,
  hint,
  error,
  suffix,
  emphasis,
  className = '',
  disabled,
  required,
  ...rest
}: FieldProps) {
  return (
    <div className={`mb-3 ${className}`}>
      <AdmiralField
        label={label}
        extraText={error ? <FieldError>{error}</FieldError> : hint}
        status={error ? 'error' : undefined}
        disabled={disabled}
        required={required}
      >
        <TextInput
          dimension={emphasis ? 'xl' : 'm'}
          status={error ? 'error' : undefined}
          disabled={disabled}
          iconsAfter={suffix ? <span className="text-ink-3 pr-2 font-medium" aria-hidden>{suffix}</span> : undefined}
          style={emphasis ? { fontSize: '1.25rem', fontWeight: 600 } : undefined}
          {...rest}
        />
      </AdmiralField>
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span id={id} className="inline-flex items-center gap-1.5 text-[13px] text-danger" role="alert">
      <ServiceErrorOutline width={15} height={15} className="shrink-0" aria-hidden />
      <span>{children}</span>
    </span>
  );
}

/** Money input: text field with decimal keyboard, accepts «1 500,50» */
export function AmountField(props: Omit<FieldProps, 'type' | 'inputMode' | 'suffix'>) {
  return <Field type="text" inputMode="decimal" autoComplete="off" suffix="₽" {...props} />;
}

/** A banner for errors that do not belong to a single field (e.g. network) */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 p-3.5 rounded-xl bg-danger-soft text-danger text-sm border border-danger/20">
      <ServiceErrorSolid width={18} height={18} className="shrink-0 mt-0.5 text-danger" aria-hidden />
      <span className="flex-1">{children}</span>
    </div>
  );
}

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { InputField, NotificationItem, NotificationItemContent } from '@admiral-ds/react-ui';
import { ServiceErrorOutline } from '@admiral-ds/icons';

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
  const id = useId();
  const detailId = `${id}-detail`;
  return (
    <InputField
      {...rest}
      id={id}
      label={label}
      className={`input-soft-border ${className}`}
      extraText={error ? <FieldError id={detailId}>{error}</FieldError> : hint && <span id={detailId}>{hint}</span>}
      aria-describedby={error || hint ? detailId : rest['aria-describedby']}
      aria-invalid={error ? true : undefined}
      dimension={emphasis ? 'xl' : 'm'}
      status={error ? 'error' : undefined}
      disabled={disabled}
      required={required}
      displayCharacterCounter={false}
      iconsAfter={suffix && <span className="pr-2 text-ink-2" aria-hidden>{suffix}</span>}
    />
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
    <NotificationItem status="error" displayStatusIcon isBorderHidden>
      <NotificationItemContent>{children}</NotificationItemContent>
    </NotificationItem>
  );
}

import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { FormError } from './Field';

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
  error?: string | null;
  tone?: 'danger' | 'primary';
}

export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel, pending, error, tone = 'danger' }: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onCancel} disabled={pending}>
            Отмена
          </Button>
          <Button variant={tone} fullWidth onClick={onConfirm} loading={pending}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-[15px] text-ink-2">
        {children}
        {error && <FormError>{error}</FormError>}
      </div>
    </Modal>
  );
}

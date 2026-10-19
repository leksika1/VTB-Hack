import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-card)] flex items-center justify-center mb-4 text-[var(--color-text-muted)]">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-1.5">{title}</h3>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-xs mb-5">{description}</p>
      {action}
    </div>
  );
}

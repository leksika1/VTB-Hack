import type { ReactNode } from 'react';
import { Refresh } from './icons';
import styled from 'styled-components';
import { T, skeletonAnimationMixin } from '@admiral-ds/react-ui';
import { ServiceErrorOutline } from '@admiral-ds/icons';
import { Button } from './Button';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, compact }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'py-6 px-4' : 'py-12 px-6'}`}>
      <div className="w-12 h-12 rounded-full bg-accent-soft text-accent-ink flex items-center justify-center mb-3" aria-hidden>
        {icon}
      </div>
      <T font="Subtitle/Subtitle 2" className="text-ink block">
        {title}
      </T>
      {description && <p className="text-sm text-ink-2 max-w-xs mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A request failed. Looks different from «no data» on purpose and always offers a retry. */
export function ErrorState({ message, onRetry, retrying }: { message: string; onRetry: () => void; retrying?: boolean }) {
  return (
    <div role="alert" className="flex flex-col items-center text-center py-12 px-6">
      <div className="w-12 h-12 rounded-full bg-danger-soft text-danger flex items-center justify-center mb-3" aria-hidden>
        <ServiceErrorOutline width={24} height={24} />
      </div>
      <T font="Subtitle/Subtitle 1" className="text-ink block">
        Не удалось загрузить данные
      </T>
      <p className="text-sm text-ink-2 max-w-xs mt-1">{message}</p>
      <Button className="mt-4" variant="secondary" icon={<Refresh size={16} />} loading={retrying} onClick={onRetry}>
        Повторить
      </Button>
    </div>
  );
}

export const Skeleton = styled.div.attrs({ 'aria-hidden': true })`
  border-radius: var(--admiral-border-radius-Medium);
  background: var(--admiral-color-Neutral_Neutral10);
  ${skeletonAnimationMixin}
`;

/** Placeholder for a whole page while the first request is in flight */
export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Загрузка">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-52 w-full rounded-[var(--radius-card)]" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
      </div>
    </div>
  );
}

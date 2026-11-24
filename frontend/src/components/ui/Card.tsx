import type { ReactNode } from 'react';
import { T } from '@admiral-ds/react-ui';

export interface CardProps {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div';
  /** Accent highlights a pending action with a tinted surface. */
  tone?: 'default' | 'brand' | 'accent';
}

export function Card({ children, className = '', as: Tag = 'section', tone = 'default' }: CardProps) {
  return (
    <Tag
      className={`rounded-card ${tone === 'brand' ? 'brand-surface' : tone === 'accent' ? 'bg-accent-soft' : 'bg-surface'} ${className}`}
    >
      {children}
    </Tag>
  );
}

export interface SectionHeaderProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  id?: string;
}

export function SectionHeader({ title, subtitle, action, id }: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-4">
      <div className="min-w-0 flex-[1_1_11rem]">
        <T font="Header/H5" as="h2" id={id} className="text-ink block">
          {title}
        </T>
        {subtitle && <T as="p" font="Body/Body 2 Long" className="text-ink-2 mt-1">{subtitle}</T>}
      </div>
      {action && <div className="shrink-0 -my-1">{action}</div>}
    </div>
  );
}

/** Page title row used by every section */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-6">
      <T font="Header/H2" as="h1" className="text-ink block">
        {title}
      </T>
      {children}
    </div>
  );
}

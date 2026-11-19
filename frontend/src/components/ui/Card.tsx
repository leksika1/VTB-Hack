import type { ReactNode } from 'react';
import { T } from '@admiral-ds/react-ui';

export interface CardProps {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div';
  /** brand — the single navy-gradient block of a page; accent — a card waiting for an action, with an accent glow */
  tone?: 'default' | 'brand' | 'accent';
}

export function Card({ children, className = '', as: Tag = 'section', tone = 'default' }: CardProps) {
  return (
    <Tag
      className={`rounded-card ${tone === 'brand' ? 'brand-surface' : `bg-surface ${tone === 'accent' ? 'shadow-accent' : 'shadow-card'}`} ${className}`}
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
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <T font="Header/H4" as="h2" id={id} className="!font-semibold text-ink leading-tight block">
          {title}
        </T>
        {subtitle && <p className="text-sm text-ink-2 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 -my-1">{action}</div>}
    </div>
  );
}

/** Page title row used by every section */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-5">
      <T font="Header/H2" as="h1" className="!font-bold text-ink tracking-tight block">
        {title}
      </T>
      {children}
    </div>
  );
}

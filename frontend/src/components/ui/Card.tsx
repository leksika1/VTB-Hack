import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div';
  /** brand — the single navy-gradient block of a page */
  tone?: 'default' | 'brand';
}

export function Card({ children, className = '', as: Tag = 'section', tone = 'default' }: CardProps) {
  return (
    <Tag
      className={`rounded-[var(--radius-card)] ${tone === 'brand' ? 'brand-surface' : 'bg-surface shadow-[var(--shadow-card)]'} ${className}`}
    >
      {children}
    </Tag>
  );
}

interface SectionHeaderProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  id?: string;
}

export function SectionHeader({ title, subtitle, action, id }: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-semibold text-ink leading-tight">
          {title}
        </h2>
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
      <h1 className="text-2xl sm:text-[28px] font-bold text-ink tracking-tight">{title}</h1>
      {children}
    </div>
  );
}

import { useId, useState, type ReactNode } from 'react';
import { T } from '@admiral-ds/react-ui';
import { ChevronDown } from './icons';

export function Disclosure({ title, children, className = '' }: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className={className}>
      <T
        as="button"
        font="Subtitle/Subtitle 2"
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((expanded) => !expanded)}
        className="flex w-full items-center justify-between gap-3 rounded-control px-3 py-3 text-left text-ink transition-colors hover:bg-surface-muted aria-expanded:bg-surface-muted"
      >
        {title}
        <ChevronDown size={20} className={`shrink-0 text-ink-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </T>
      <div id={id} className="collapsible" data-open={open} inert={!open}>
        <div>{children}</div>
      </div>
    </div>
  );
}

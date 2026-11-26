import { useEffect, useId, useRef } from 'react';
import { T } from '@admiral-ds/react-ui';
import type { User } from '../../types';
import { useUIStore } from '../../store/uiStore';
import { ProfileSettings } from '../family/ProfileSettings';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Misc';

export function ProfileDropdown({ user }: { user: User }) {
  const open = useUIStore((state) => state.profileOpen);
  const setOpen = useUIStore((state) => state.setProfileOpen);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const titleId = `${id}-title`;

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || root.current?.contains(target)) return;
      if (!target.closest('[role="dialog"], [role="alertdialog"]')) setOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [open, setOpen]);

  return (
    <div ref={root} className="relative min-w-0" onKeyDown={(event) => {
      if (event.key !== 'Escape' || !open || !event.currentTarget.contains(event.target as Node)) return;
      event.stopPropagation();
      setOpen(false);
      event.currentTarget.querySelector('button')?.focus();
    }}>
      <Button variant="ghost" size="lg" className="min-w-0 max-w-full !px-2 lg:!px-3"
        onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={open ? id : undefined}
        aria-label={`Профиль: ${user.name}`}>
        <span className="!inline-flex min-w-0 max-w-full items-center gap-2">
          <Avatar user={user} size="sm" />
          <span className="hidden min-w-0 max-w-32 truncate lg:block">{user.name}</span>
        </span>
      </Button>
      {open && (
        <section id={id} aria-labelledby={titleId}
          className="absolute right-0 top-full z-10 mt-2 max-h-[calc(100dvh-6.5rem)] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-card border border-line bg-surface shadow-[var(--shadow-pop)]">
          <T as="h2" id={titleId} font="Subtitle/Subtitle 1" className="border-b border-line px-5 py-3.5">
            Настройки профиля
          </T>
          <ProfileSettings />
        </section>
      )}
    </div>
  );
}

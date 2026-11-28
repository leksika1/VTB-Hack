import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { T } from '@admiral-ds/react-ui';
import { signOut } from '../../api/client';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import type { User } from '../../types';
import { useUIStore } from '../../store/uiStore';
import { ProfileSettings } from '../family/ProfileSettings';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Misc';
import { Eye, LogOut, Settings } from '../ui/icons';
import { Presence } from '../ui/Presence';
import { usePresenceClosing } from '../ui/presenceContext';

export function ProfileDropdown({ user, mobile }: { user: User; mobile: boolean }) {
  const settingsOpen = useUIStore((state) => state.profileOpen);
  const profileSection = useUIStore((state) => state.profileSection);
  const setSettingsOpen = useUIStore((state) => state.setProfileOpen);
  const logout = useAsyncAction(signOut);
  const [menuOpen, setMenuOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const settingsId = useId();
  const titleId = `${settingsId}-title`;

  const focusTrigger = useCallback(() => {
    root.current?.querySelector<HTMLButtonElement>('[data-profile-trigger]')?.focus();
  }, []);
  const closeAll = useCallback(() => {
    setMenuOpen(false);
    setSettingsOpen(false);
  }, [setSettingsOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen && (!settingsOpen || mobile)) return;
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || root.current?.contains(target)) return;
      if (!target.closest('[role="dialog"], [role="alertdialog"]')) closeAll();
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [closeAll, menuOpen, mobile, settingsOpen]);

  useEffect(() => {
    if (!menuOpen && !settingsOpen) return;
    const dismissOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target;
      if (target instanceof Element && target.closest('[role="dialog"], [role="alertdialog"]')) return;
      event.preventDefault();
      closeAll();
      focusTrigger();
    };
    document.addEventListener('keydown', dismissOnEscape);
    return () => document.removeEventListener('keydown', dismissOnEscape);
  }, [closeAll, focusTrigger, menuOpen, settingsOpen]);

  const openSettings = (section: 'settings' | 'access') => {
    setMenuOpen(false);
    setSettingsOpen(true, section);
  };

  const handleMenuKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!menuOpen || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown'
          ? (current + 1) % items.length
          : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const onSignOut = async () => {
    setMenuOpen(false);
    setSettingsOpen(false);
    await logout.run();
  };

  return (
    <div ref={root} className="relative min-w-0" onKeyDown={handleMenuKeys}
      onBlur={(event) => {
        if (menuOpen && !event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
      }}>
      <Button variant="ghost" size="lg" data-profile-trigger
        className="min-w-0 max-w-full !px-1 sm:!px-2 lg:!px-3"
        onClick={() => {
          if (settingsOpen) {
            setSettingsOpen(false);
            return;
          }
          setMenuOpen((open) => !open);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' || menuOpen) return;
          event.preventDefault();
          setMenuOpen(true);
        }}
        aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined}
        aria-current={mobile && settingsOpen ? 'page' : undefined} aria-label={`Профиль: ${user.name}`}>
        <span className="!inline-flex min-w-0 max-w-full items-center gap-2">
          <Avatar user={user} size="sm" />
          <span className="min-w-0 max-w-32 truncate max-sm:hidden">{user.name}</span>
        </span>
      </Button>

      <Presence show={menuOpen}>
        <ProfileMenu id={menuId} onSettings={() => openSettings('settings')}
          onAccess={() => openSettings('access')} onSignOut={onSignOut} />
      </Presence>
      {!mobile && (
        <Presence show={settingsOpen}>
          <ProfilePanel id={settingsId} titleId={titleId} focusSection={profileSection} />
        </Presence>
      )}
    </div>
  );
}

function ProfileMenu({ id, onSettings, onAccess, onSignOut }: {
  id: string;
  onSettings: () => void;
  onAccess: () => void;
  onSignOut: () => void;
}) {
  const closing = usePresenceClosing();
  return (
    <div id={id} role="menu" aria-label="Меню профиля" inert={closing}
      className={`profile-panel absolute right-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-2 shadow-[var(--shadow-pop)] ${closing ? 'profile-panel-out' : ''}`}>
      <Button role="menuitem" variant="ghost" fullWidth className="!justify-start" icon={<Settings size={18} />} onClick={onSettings}>
        Настройки
      </Button>
      <Button role="menuitem" variant="ghost" fullWidth className="!justify-start" icon={<Eye size={18} />} onClick={onAccess}>
        Доступ к семейному бюджету
      </Button>
      <Button role="menuitem" variant="ghost" fullWidth className="!justify-start" icon={<LogOut size={18} />} onClick={onSignOut}>
        Выйти
      </Button>
    </div>
  );
}

function ProfilePanel({ id, titleId, focusSection }: {
  id: string;
  titleId: string;
  focusSection: 'settings' | 'access';
}) {
  const closing = usePresenceClosing();
  return (
    <section id={id} aria-labelledby={titleId} inert={closing}
      className={`profile-panel absolute right-0 top-full z-10 mt-2 max-h-[calc(100dvh-6.5rem)] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-card border border-line bg-surface shadow-[var(--shadow-pop)] ${closing ? 'profile-panel-out' : ''}`}>
      <T as="h2" id={titleId} font="Subtitle/Subtitle 1" className="border-b border-line px-5 py-3.5">
        Настройки профиля
      </T>
      <ProfileSettings focusSection={focusSection} />
    </section>
  );
}

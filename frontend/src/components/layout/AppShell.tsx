import { useEffect, type ReactNode } from 'react';
import { LayoutDashboard, ReceiptText, ClipboardList, Users, type LucideIcon } from 'lucide-react';
import type { Tab } from '../../types';
import { useUIStore } from '../../store/uiStore';
import { useCurrentUser, useFamilyStore, useIsParent } from '../../store/familyStore';
import { useDataStore } from '../../store/dataStore';
import { Avatar, Badge } from '../ui/Misc';

const NAV: { tab: Tab; label: string; icon: LucideIcon }[] = [
  { tab: 'overview', label: 'Обзор', icon: LayoutDashboard },
  { tab: 'operations', label: 'Операции', icon: ReceiptText },
  { tab: 'plan', label: 'План', icon: ClipboardList },
  { tab: 'family', label: 'Семья', icon: Users },
];

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[10px] bg-brand shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 22 22" fill="none">
        <circle cx="8" cy="7" r="3" fill="#fff" />
        <circle cx="15" cy="8.2" r="2.4" fill="#7ea6ff" />
        <path d="M2.8 18c0-3.2 2.3-5.4 5.2-5.4s5.2 2.2 5.2 5.4" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" />
        <path d="M12.3 14c.8-.8 1.7-1.2 2.7-1.2 2.4 0 4.2 1.9 4.2 4.9" stroke="#7ea6ff" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const tab = useUIStore((s) => s.tab);
  const setTab = useUIStore((s) => s.setTab);
  const family = useFamilyStore((s) => s.family);
  const user = useCurrentUser();
  // The plan (budget and payments) is for adults only
  const isParent = useIsParent();
  const nav = isParent ? NAV : NAV.filter((n) => n.tab !== 'plan');
  // Unread family events live on the «Семья» page; the tab carries their count
  const unread = useDataStore((s) => s.unreadNotifications);
  const unreadLabel = (t: Tab) => (t === 'family' && unread > 0 ? `, непрочитанных событий: ${unread}` : '');

  // Each section opens from its top instead of inheriting the previous scroll position
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur border-b border-line">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1 lg:flex-none lg:w-64">
            <BrandMark />
            <div className="min-w-0 leading-tight">
              <div className="text-[13px] text-ink-3">Общий план</div>
              <div className="text-[15px] font-semibold text-ink truncate" title={family?.name}>
                {family?.name}
              </div>
            </div>
          </div>

          <DesktopNav nav={nav} tab={tab} onSelect={setTab} unread={unread} unreadLabel={unreadLabel} />
          {/* Demo data looks real, so the mark stays on every screen size */}
          {family?.isDemo && <span className="shrink-0 relative sm:left-3"><Badge tone="warning">Демо</Badge></span>}

          {user && (
            <button
              type="button"
              onClick={() => setTab('family')}
              className="flex items-center gap-2.5 h-12 pl-1 pr-1 rounded-control hover:bg-surface-sunken transition-colors lg:w-32 lg:justify-center"
              aria-label={`Вы: ${user.name}. Управление семьёй`}
            >
              <Avatar user={user} />
              <span className="hidden gap-2 lg:flex text-sm text-center leading-tight">
                <span className="block font-medium text-ink">{user.name}</span>
              </span>
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-5 sm:pt-7 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-12">
        {children}
      </main>

      <nav
        aria-label="Разделы"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]"
      >
        <div className={`grid ${nav.length === 4 ? 'grid-cols-4' : 'grid-cols-3'} max-w-lg mx-auto`}>
          {nav.map(({ tab: t, label, icon: Icon }) => {
            const active = tab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-current={active ? 'page' : undefined}
                aria-label={`${label}${unreadLabel(t)}`}
                className={`h-16 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors duration-(--dur-tab) ease-(--ease-out)
                  ${active ? 'text-accent-ink' : 'text-ink-3 hover:text-ink'}`}
              >
                <span className={`relative w-14 h-7 rounded-full flex items-center justify-center transition-colors duration-(--dur-tab) ease-(--ease-out) ${active ? 'bg-accent-soft' : ''}`}>
                  <Icon size={21} strokeWidth={active ? 2.3 : 1.9} aria-hidden />
                  {t === 'family' && (
                    <span className="absolute -top-1 right-1.5">
                      <UnreadCount count={unread} />
                    </span>
                  )}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

import { TabMenu, type TabProps, Badge as AdmiralBadge } from '@admiral-ds/react-ui';

interface DesktopNavProps {
  nav: typeof NAV;
  tab: Tab;
  onSelect: (tab: Tab) => void;
  unread: number;
  unreadLabel: (tab: Tab) => string;
}

/** Section tabs using Admiral DS TabMenu */
function DesktopNav({ nav, tab, onSelect, unread }: DesktopNavProps) {
  const tabs: TabProps[] = nav.map(({ tab: t, label, icon: Icon }) => ({
    id: t,
    content: label,
    icon: <Icon size={18} />,
    badge: t === 'family' && unread > 0 ? unread : undefined,
  }));

  return (
    <nav aria-label="Разделы" className="hidden lg:flex flex-1 justify-center">
      <TabMenu
        dimension="m"
        tabs={tabs}
        activeTab={tab}
        onChange={(id) => onSelect(id as Tab)}
        underline={false}
      />
    </nav>
  );
}

function UnreadCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <AdmiralBadge appearance="info" dimension="s" aria-hidden>
      {count > 99 ? '99+' : count}
    </AdmiralBadge>
  );
}


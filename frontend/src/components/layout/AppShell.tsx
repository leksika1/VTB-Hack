import { useEffect, type ReactNode } from 'react';
import { Badge as AdmiralBadge, HorizontalTab, HorizontalTabs, T } from '@admiral-ds/react-ui';
import styled from 'styled-components';
import { Dashboard, Receipt, Clipboard, Users, Calendar } from '../ui/icons';
import { Button } from '../ui/Button';
import type { Tab } from '../../types';
import { useUIStore } from '../../store/uiStore';
import { useCurrentUser, useFamilyStore, useIsParent } from '../../store/familyStore';
import { useDataStore } from '../../store/dataStore';
import { Avatar, Badge } from '../ui/Misc';

const NAV: { tab: Tab; label: string; icon: typeof Users }[] = [
  { tab: 'overview', label: 'Обзор', icon: Dashboard },
  { tab: 'operations', label: 'Операции', icon: Receipt },
  { tab: 'plan', label: 'План', icon: Clipboard },
  { tab: 'calendar', label: 'Календарь', icon: Calendar },
  { tab: 'family', label: 'Семья', icon: Users },
];

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[10px] bg-brand shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Users size={size * 0.65} className="text-white" />
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const storedTab = useUIStore((s) => s.tab);
  const setTab = useUIStore((s) => s.setTab);
  const family = useFamilyStore((s) => s.family);
  const user = useCurrentUser();
  // The plan (budget and payments) is for adults only
  const isParent = useIsParent();
  const tab = !isParent && (storedTab === 'plan' || storedTab === 'calendar') ? 'overview' : storedTab;
  const nav = isParent ? NAV : NAV.filter((n) => n.tab !== 'plan' && n.tab !== 'calendar');
  // Unread family events live on the «Семья» page; the tab carries their count
  const unread = useDataStore((s) => s.unreadNotifications);
  const unreadLabel = (t: Tab) => (t === 'family' && unread > 0 ? `, непрочитанных событий: ${unread}` : '');

  // Each section opens from its top instead of inheriting the previous scroll position
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-surface">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 lg:h-20 flex items-center gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1 lg:flex-none lg:w-48">
            <BrandMark />
            <div className="min-w-0 leading-tight">
              <T as="div" font="Caption/Caption 1" color="Neutral/Neutral 70">Общий план</T>
              <T as="div" font="Subtitle/Subtitle 2" className="truncate" title={family?.name}>
                {family?.name}
              </T>
            </div>
          </div>

          <SectionNavigation nav={nav} tab={tab} onSelect={setTab} unread={unread} unreadLabel={unreadLabel} />
          {/* Demo data looks real, so the mark stays on every screen size */}
          {family?.isDemo && <span className="shrink-0 relative sm:left-3"><Badge tone="warning">Демо</Badge></span>}

          {user && (
            <Button
              variant="ghost"
              size="lg"
              className="!px-2 lg:!px-3"
              onClick={() => setTab('family')}
              aria-label={`Вы: ${user.name}. Управление семьёй`}
            >
              <span className="!inline-flex min-w-0 items-center gap-2">
                <Avatar user={user} size="sm" />
                <span className="hidden max-w-32 truncate lg:block">{user.name}</span>
              </span>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-5 sm:pt-9 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-12">
        <div id="section-content" role="tabpanel" aria-labelledby={`section-${tab}`}>{children}</div>
      </main>

    </div>
  );
}

const SectionTab = styled(HorizontalTab)`
  &,
  &:focus-visible {
    border-radius: var(--radius-control);
  }

  @media (max-width: 1023px) {
    height: 56px;
    padding-inline: 4px;
  }
`;

interface SectionNavigationProps {
  nav: typeof NAV;
  tab: Tab;
  onSelect: (tab: Tab) => void;
  unread: number;
  unreadLabel: (tab: Tab) => string;
}

function SectionNavigation({ nav, tab, onSelect, unread, unreadLabel }: SectionNavigationProps) {
  return (
    <nav aria-label="Разделы" className="fixed inset-x-0 bottom-0 bg-surface pb-[env(safe-area-inset-bottom)] lg:static lg:mx-auto lg:pb-0">
      <HorizontalTabs
        className="mx-auto max-w-2xl"
        role="tablist"
        aria-label="Разделы приложения"
        dimension="m"
        selectedTabId={tab}
        tabsId={nav.map((item) => item.tab)}
        tabIsDisabled={() => false}
        onSelectTab={(id) => onSelect(id as Tab)}
        renderTab={(id, selected, chooseTab) => {
          const item = nav.find((entry) => entry.tab === id);
          if (!item) return null;
          const Icon = item.icon;
          return (
            <SectionTab key={id} id={`section-${id}`} tabId={id} dimension="m" adaptive="fill"
              selected={selected} onSelectTab={chooseTab} aria-selected={selected}
              aria-controls="section-content" aria-label={item.label + unreadLabel(item.tab)}>
              <span className="flex items-center gap-2 max-lg:flex-col max-lg:gap-0.5 max-lg:text-xs">
                <Icon size={20} aria-hidden />
                {item.label}
              </span>
              {id === 'family' && unread > 0 && (
                <AdmiralBadge className="max-lg:absolute max-lg:right-0 max-lg:top-0" appearance="info" dimension="s" aria-hidden>
                  {unread > 99 ? '99+' : unread}
                </AdmiralBadge>
              )}
            </SectionTab>
          );
        }}
      />
    </nav>
  );
}

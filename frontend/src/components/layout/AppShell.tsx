import { useEffect, type ReactNode } from 'react';
import { HorizontalTab, HorizontalTabs, T } from '@admiral-ds/react-ui';
import styled from 'styled-components';
import { Dashboard, Receipt, BarChart, Users, Calendar, ArrowLeft } from '../ui/icons';
import { ProfileDropdown } from './ProfileDropdown';
import type { Tab } from '../../types';
import { useUIStore } from '../../store/uiStore';
import { useCurrentUser, useFamilyStore } from '../../store/familyStore';
import { Badge } from '../ui/Misc';
import { Button } from '../ui/Button';
import { Card, PageHeader } from '../ui/Card';
import { ProfileSettings } from '../family/ProfileSettings';
import { useMediaQuery } from '../../utils/theme';

const NAV: { tab: Tab; label: string; icon: typeof Users }[] = [
  { tab: 'overview', label: 'Обзор', icon: Dashboard },
  { tab: 'records', label: 'Записи', icon: Receipt },
  { tab: 'analytics', label: 'Аналитика', icon: BarChart },
  { tab: 'calendar', label: 'Календарь', icon: Calendar },
  { tab: 'family', label: 'Семья', icon: Users },
];

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[14px] bg-brand shrink-0"
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
  const profileOpen = useUIStore((s) => s.profileOpen);
  const profileSection = useUIStore((s) => s.profileSection);
  const setProfileOpen = useUIStore((s) => s.setProfileOpen);
  const mobile = useMediaQuery('(max-width: 1023px)');
  const profilePage = mobile && profileOpen;
  const tab = storedTab;

  // Each section opens from its top instead of inheriting the previous scroll position
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab, profilePage]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 app-header">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 lg:h-20 flex items-center gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <button type="button" onClick={() => setTab('family')} aria-label="Открыть раздел «Семья»"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-control text-left">
            <BrandMark />
            <span className="min-w-0 leading-tight">
              <T as="span" font="Caption/Caption 1" color="Neutral/Neutral 70" className="block">Общий план</T>
              <T as="span" font="Subtitle/Subtitle 2" className="block truncate" title={family?.name}>
                {family?.name}
              </T>
            </span>
          </button>

          <SectionNavigation nav={NAV} tab={tab} profilePage={profilePage} onSelect={setTab} />
          <div className="flex min-w-0 items-center justify-end gap-2">
            {/* Demo data looks real, so the mark stays on every screen size */}
            {family?.isDemo && <span className="shrink-0"><Badge tone="warning">Демо</Badge></span>}

            {user && <ProfileDropdown user={user} mobile={mobile} />}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 pt-5 sm:pt-8 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-12">
        <div id="section-content" role="tabpanel" aria-labelledby={`section-${tab}`} hidden={profilePage}>{children}</div>
        {profilePage && (
          <div className="animate-tab-in">
            <PageHeader title="Настройки профиля">
              <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} />} onClick={() => setProfileOpen(false)}>Назад</Button>
            </PageHeader>
            <Card><ProfileSettings focusSection={profileSection} /></Card>
          </div>
        )}
      </main>

    </div>
  );
}

const SectionTab = styled(HorizontalTab)`
  && {
    min-width: 0;
    height: 44px;
    padding-inline: 12px;
    border-radius: var(--radius-control);
    color: var(--nav-ink);
    transition: background-color 180ms ease, color 180ms ease;
  }

  &&:hover {
    background: var(--nav-hover);
    color: var(--nav-active-ink);
  }

  &&[aria-selected='true'] {
    background: var(--nav-active);
    color: var(--nav-active-ink);
  }

  &&:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  @media (min-width: 1024px) {
    && {
      flex: 0 0 auto;
      width: auto;
    }
  }

  @media (max-width: 1023px) {
    && {
      height: 52px;
      padding-inline: 2px;
    }
  }
`;

interface SectionNavigationProps {
  nav: typeof NAV;
  tab: Tab;
  profilePage: boolean;
  onSelect: (tab: Tab) => void;
}

function SectionNavigation({ nav, tab, profilePage, onSelect }: SectionNavigationProps) {
  return (
    <nav aria-label="Разделы" className="section-navigation">
      <HorizontalTabs
        className="section-tabs mx-auto max-w-lg gap-1 lg:max-w-none"
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
          const active = selected && !profilePage;
          return (
            <SectionTab key={id} id={`section-${id}`} tabId={id} dimension="m" adaptive="fill"
              selected={active} onSelectTab={chooseTab} aria-selected={active}
              aria-controls="section-content" aria-label={item.label}>
              <span className="flex items-center gap-2 max-lg:flex-col max-lg:gap-0.5 max-lg:text-[10px]">
                <Icon size={20} aria-hidden />
                {item.label}
              </span>
            </SectionTab>
          );
        }}
      />
    </nav>
  );
}

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
              <div className="text-[13px] text-ink-3">Семейный бюджет</div>
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

/** onAccent — on the selected (accent-filled) tab the counter turns white, otherwise it would vanish */
interface DesktopNavProps {
  nav: typeof NAV;
  tab: Tab;
  onSelect: (tab: Tab) => void;
  unread: number;
  unreadLabel: (tab: Tab) => string;
}

/** Section tabs with one accent pill that slides to the selected tab (duration: --dur-tab in index.css) */
function DesktopNav({ nav, tab, onSelect, unread, unreadLabel }: DesktopNavProps) {
  const refs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  // Slides only after the user picks a tab: on the first placement it would fly in from the left edge
  const [animated, setAnimated] = useState(false);

  useLayoutEffect(() => {
    const place = () => {
      const el = refs.current[tab];
      if (!el) return;
      const next = { left: el.offsetLeft, width: el.offsetWidth };
      setPill((prev) => (prev && prev.left === next.left && prev.width === next.width ? prev : next));
    };
    place();
    // Widths change when the unread counter appears or the font loads
    const observer = new ResizeObserver(place);
    Object.values(refs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [tab, nav.length]);

  return (
    <nav aria-label="Разделы" className="hidden lg:flex flex-1 justify-center">
      <div className="relative flex gap-1">
        {pill && (
          <span
            aria-hidden
            className={`absolute inset-y-0 rounded-full bg-accent ${animated ? 'transition-[left,width] duration-(--dur-tab) ease-(--ease-out)' : ''}`}
            style={{ left: pill.left, width: pill.width }}
          />
        )}
        {nav.map(({ tab: t, label }) => {
          const active = tab === t;
          return (
            <button
              key={t}
              ref={(el) => {
                refs.current[t] = el;
              }}
              type="button"
              onClick={() => {
                setAnimated(true);
                onSelect(t);
              }}
              aria-current={active ? 'page' : undefined}
              aria-label={`${label}${unreadLabel(t)}`}
              className={`relative h-10 px-4 rounded-full text-[15px] font-medium inline-flex items-center gap-1.5
                transition-colors duration-(--dur-tab) ease-(--ease-out)
                ${active ? 'text-ink-inverse' : 'text-ink-2 hover:text-ink hover:bg-accent-soft'}`}
            >
              {label}
              {t === 'family' && <UnreadCount count={unread} onAccent={active} />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function UnreadCount({ count, onAccent }: { count: number; onAccent?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold leading-5 text-center tabular transition-colors duration-(--dur-tab)
        ${onAccent ? 'bg-white text-accent-ink' : 'bg-accent text-white'}`}
      aria-hidden
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

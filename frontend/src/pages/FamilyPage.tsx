import { useEffect, useState } from 'react';
import { BadgeCheck, Bell, Check, Eye, Landmark, LogOut, Monitor, Moon, Pencil, PiggyBank, ShieldCheck, Sparkles, Sun, UserPlus, Users, X } from 'lucide-react';
import type { AppNotification, Me, User } from '../types';
import {
  approveMember,
  errorMessage,
  getMe,
  getOidcConfig,
  leaveFamily,
  listNotifications,
  markNotificationsRead,
  removeMember,
  startDemo,
  startOidc,
  switchDemoUser,
  unlinkOidc,
  type OidcConfig,
} from '../api/client';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useDataStore } from '../store/dataStore';
import { useFamilyStore, useIsParent } from '../store/familyStore';
import { useUIStore, type Theme } from '../store/uiStore';
import { formatCurrency } from '../utils/currency';
import { plural } from '../utils/date';
import { InvitePanel } from '../components/family/InvitePanel';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { Avatar, Badge } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorState, Skeleton } from '../components/ui/Feedback';
import { Presence } from '../components/ui/Presence';

export function FamilyPage() {
  const family = useFamilyStore((s) => s.family);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const openModal = useUIStore((s) => s.openModal);
  const isParent = useIsParent();
  if (!family) return null;
  const children = family.members.filter((m) => m.role === 'child');

  return (
    <>
      <PageHeader title="Семья" />

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <div className="space-y-5 min-w-0">
          <Card tone="brand" className="p-5 sm:p-6">
            <div className="flex items-center gap-4 mb-5">
              <span className="w-12 h-12 rounded-full bg-accent-soft text-accent-ink flex items-center justify-center shrink-0" aria-hidden>
                <Users size={22} />
              </span>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-ink break-words">{family.name}</h2>
                <p className="text-ink-2">
                  {family.members.length} {plural(family.members.length, 'участник', 'участника', 'участников')}
                </p>
              </div>
            </div>
            <ul className="divide-y divide-line">
              {family.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-3">
                  <Avatar user={m} />
                  <span className="flex-1 min-w-0 font-medium text-ink truncate">{m.name}</span>
                  {m.role === 'child' && <Badge>Ребёнок</Badge>}
                  {m.id === currentUserId && <Badge tone="accent">Вы</Badge>}
                </li>
              ))}
            </ul>
            {family.members.length === 1 && (
              <p className="text-ink-2 mt-3">Пока вы один. Пригласите партнёра — расходы и план станут общими.</p>
            )}
          </Card>

          {isParent && children.length > 0 && <AllowancesCard members={children} />}
          {isParent && !family.isDemo && <JoinRequestsCard />}
          {isParent && (
            <Card className="p-5">
              <SectionHeader title="Приглашение" subtitle="Отправьте ссылку — по ней увидят название семьи и смогут присоединиться" />
              <InvitePanel />
            </Card>
          )}
          <EventsCard />
        </div>

        <div className="space-y-5 min-w-0">
          <Card className="p-5">
            <SectionHeader title="Правила общего пространства" />
            <ul className="space-y-3.5 text-[15px]">
              <Rule icon={<Eye size={18} />}>
                Участники видят только общие расходы и платежи, которые внесли сюда. Личные счета и покупки вне приложения не видны.
              </Rule>
              <Rule icon={<Pencil size={18} />}>
                Бюджет месяца, обязательные платежи и расходы — общие: любой взрослый может их исправить, например указать, кто платил.
                Ребёнок меняет только свои траты.
              </Rule>
              <Rule icon={<UserPlus size={18} />}>
                По ссылке-приглашению входят сразу. Вошедший по коду семьи видит данные только после подтверждения взрослым.
              </Rule>
              <Rule icon={<ShieldCheck size={18} />}>
                Права проверяются на сервере: скрытая кнопка не даёт доступа к чужим данным.
              </Rule>
            </ul>
            {isParent && !family.isDemo && (
              <Button className="mt-5" variant="secondary" icon={<UserPlus size={16} />} onClick={() => openModal({ type: 'invite' })}>
                Пригласить участника
              </Button>
            )}
          </Card>

          {!family.isDemo && <VtbIdCard />}
          <AppearanceCard />
          <DemoCard />
          <LeaveCard />
        </div>
      </div>
    </>
  );
}

function Rule({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="text-accent-ink shrink-0 mt-0.5" aria-hidden>
        {icon}
      </span>
      <span className="text-ink-2">{children}</span>
    </li>
  );
}

/** Adults set each child's pocket money; spent and left come from the server */
function AllowancesCard({ members }: { members: User[] }) {
  const allowances = useDataStore((s) => s.allowances);
  const openModal = useUIStore((s) => s.openModal);

  return (
    <Card className="p-5">
      <SectionHeader title="Карманные деньги" subtitle="Лимит трат ребёнка на неделю или месяц. Без него ребёнок может только просить покупки." />
      <ul className="divide-y divide-line">
        {members.map((child) => {
          const a = allowances.find((x) => x.memberId === child.id);
          return (
            <li key={child.id} className="py-3 first:pt-1 last:pb-1 flex items-center gap-3">
              <Avatar user={child} />
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-ink truncate">{child.name}</span>
                <span className="block text-sm text-ink-2">
                  {a
                    ? `${formatCurrency(a.amount)} ${a.period === 'week' ? 'в неделю' : 'в месяц'} · осталось ${formatCurrency(a.left)}`
                    : 'Не назначены'}
                </span>
              </span>
              <Button size="sm" variant="secondary" icon={<PiggyBank size={15} />} onClick={() => openModal({ type: 'allowanceForm', memberId: child.id })}>
                {a ? 'Изменить' : 'Назначить'}
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const EVENTS_SHORT = 6;

/** What happened in the family: requests, decisions, limits, goals, members (server notifications, §9) */
function EventsCard() {
  const unread = useDataStore((s) => s.unreadNotifications);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const markRead = useAsyncAction(markNotificationsRead);

  // Reloaded when the unread counter changes: a new event arrived through the live stream
  useEffect(() => {
    let alive = true;
    listNotifications().then(
      (list) => {
        if (!alive) return;
        setItems(list);
        setError(null);
      },
      (e) => {
        if (alive) setError(errorMessage(e));
      }
    );
    return () => {
      alive = false;
    };
  }, [unread, attempt]);

  const hasUnread = items?.some((n) => !n.readAt) ?? false;
  const shown = expanded ? items ?? [] : (items ?? []).slice(0, EVENTS_SHORT);

  return (
    <Card className="p-5">
      <SectionHeader
        title="События"
        subtitle="Запросы, решения, лимиты и цели — то, что касается вас"
        action={
          hasUnread && (
            <Button
              size="sm"
              variant="ghost"
              loading={markRead.pending}
              onClick={async () => {
                const res = await markRead.run();
                if (res.ok) setItems((list) => list?.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() })) ?? null);
              }}
            >
              Прочитать все
            </Button>
          )
        }
      />
      {error && !items ? (
        <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : !items ? (
        <div className="space-y-3" aria-busy="true" aria-label="Загрузка событий">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-ink-2 py-2">Пока ничего не произошло. Здесь появятся запросы на покупку, решения по ним и предупреждения о лимитах.</p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {shown.map((n) => (
              <li key={n.id} className="py-2.5 first:pt-1 last:pb-1 flex gap-3">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.readAt ? 'bg-transparent' : 'bg-accent'}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[15px] break-words ${n.readAt ? 'text-ink-2' : 'text-ink font-medium'}`}>
                    {n.title}
                    {!n.readAt && <span className="sr-only"> (новое)</span>}
                  </span>
                  {n.body && <span className="block text-sm text-ink-2 break-words">{n.body}</span>}
                  <span className="block text-[13px] text-ink-3">
                    {new Date(n.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {items.length > EVENTS_SHORT && (
            <Button size="sm" variant="ghost" className="mt-2 -ml-3.5" icon={<Bell size={15} />} onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Свернуть' : `Все события (${items.length})`}
            </Button>
          )}
        </>
      )}
      {markRead.error && <p role="alert" className="text-sm text-danger mt-2">{markRead.error}</p>}
    </Card>
  );
}

/** People who joined by code: they see nothing of the family until an adult lets them in */
function JoinRequestsCard() {
  const pending = useFamilyStore((s) => s.family?.pendingMembers ?? []);
  if (pending.length === 0) return null;

  return (
    <Card className="p-5 border border-warning/40">
      <SectionHeader
        title="Заявки на вход"
        subtitle="Вошли по коду семьи и ждут подтверждения. Пока вы не подтвердите вход, они не видят данных семьи."
      />
      <ul className="divide-y divide-line">
        {pending.map((m) => (
          <JoinRequestRow key={m.id} member={m} />
        ))}
      </ul>
    </Card>
  );
}

function JoinRequestRow({ member }: { member: User }) {
  const addToast = useUIStore((s) => s.addToast);
  const approve = useAsyncAction(approveMember);
  const decline = useAsyncAction(removeMember);
  const busy = approve.pending || decline.pending;
  const error = approve.error ?? decline.error;

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <Avatar user={member} />
        <span className="flex-1 min-w-0">
          <span className="block font-medium text-ink truncate">{member.name}</span>
          <span className="block text-sm text-ink-2">{member.role === 'child' ? 'Ребёнок' : 'Взрослый'}</span>
        </span>
        <Button
          size="sm"
          icon={<Check size={15} />}
          loading={approve.pending}
          disabled={busy}
          onClick={async () => {
            const res = await approve.run(member.id);
            if (res.ok) addToast(`${member.name} теперь в семье`);
          }}
        >
          Принять
        </Button>
        <Button
          size="sm"
          variant="dangerGhost"
          icon={<X size={15} />}
          loading={decline.pending}
          disabled={busy}
          aria-label={`Отклонить заявку ${member.name}`}
          onClick={async () => {
            const res = await decline.run(member.id);
            if (res.ok) addToast(`Заявка ${member.name} отклонена`, 'info');
          }}
        >
          <span className="hidden sm:inline">Отклонить</span>
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-danger mt-2">{error}</p>}
    </li>
  );
}

/** VTB ID: sign in through the bank instead of a device token. Shown only when the backend has it enabled */
function VtbIdCard() {
  const addToast = useUIStore((s) => s.addToast);
  const [config, setConfig] = useState<OidcConfig | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [linking, setLinking] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const unlink = useAsyncAction(unlinkOidc);

  useEffect(() => {
    let alive = true;
    getOidcConfig().then((c) => {
      if (!alive) return;
      setConfig(c);
      if (c.enabled) getMe().then((m) => alive && setMe(m), () => {});
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!config) return null;
  if (!config.enabled || !me) {
    return (
      <Card className="p-5">
        <SectionHeader title={config.providerName} />
        <p className="text-ink-2">
          Вход через банк выключен на сервере. Чтобы включить, задайте в настройках бэкенда OIDC_ENABLED=true (для демо — ещё
          OIDC_MOCK=true).
        </p>
      </Card>
    );
  }

  const link = async () => {
    setLinking(true);
    try {
      await startOidc('link');
    } catch (e) {
      addToast(errorMessage(e), 'error');
      setLinking(false);
    }
  };

  return (
    <Card className="p-5">
      <SectionHeader
        title={config.providerName}
        action={me.vtbLinked ? <Badge tone="success" icon={<BadgeCheck size={12} aria-hidden />}>Привязан</Badge> : undefined}
      />
      {me.vtbLinked ? (
        <>
          <p className="text-ink-2">
            Входите через банк на любом устройстве — откроется ваш аккаунт в семье. Отвязать можно в любой момент.
          </p>
          <Button className="mt-4" variant="dangerGhost" onClick={() => setConfirmUnlink(true)}>
            Отвязать {config.providerName}
          </Button>
        </>
      ) : (
        <>
          <p className="text-ink-2">Привяжите {config.providerName}, чтобы входить через банк на любом устройстве без приглашения.</p>
          <Button className="mt-4" variant="outline" icon={<Landmark size={16} />} loading={linking} onClick={link}>
            Привязать {config.providerName}
          </Button>
        </>
      )}
      <Presence show={confirmUnlink}>
        <ConfirmDialog
          title={`Отвязать ${config.providerName}?`}
          confirmLabel="Отвязать"
          pending={unlink.pending}
          error={unlink.error}
          onCancel={() => setConfirmUnlink(false)}
          onConfirm={async () => {
            const res = await unlink.run();
            if (!res.ok) return;
            setConfirmUnlink(false);
            setMe({ ...me, vtbLinked: false });
            addToast(`${config.providerName} отвязан`, 'info');
          }}
        >
          <p>Войти через банк в этот аккаунт будет нельзя, пока вы не привяжете его снова. Текущая сессия останется.</p>
        </ConfirmDialog>
      </Presence>
    </Card>
  );
}

const THEMES: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Светлая', icon: <Sun size={16} /> },
  { value: 'dark', label: 'Тёмная', icon: <Moon size={16} /> },
  { value: 'system', label: 'Как в системе', icon: <Monitor size={16} /> },
];

function AppearanceCard() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  return (
    <Card className="p-5">
      <SectionHeader title="Оформление" />
      <div role="radiogroup" aria-label="Тема" className="grid grid-cols-3 gap-1 p-1 rounded-[var(--radius-control)] bg-surface-sunken">
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={theme === t.value}
            onClick={() => setTheme(t.value)}
            className={`h-10 rounded-[10px] text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors
              ${theme === t.value ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-2 hover:text-ink'}`}
          >
            {t.icon}
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

/** Everything that exists only for demonstrating the prototype is grouped and labelled here */
function DemoCard() {
  const family = useFamilyStore((s) => s.family);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const simulateErrors = useUIStore((s) => s.simulateErrors);
  const setSimulateErrors = useUIStore((s) => s.setSimulateErrors);
  const addToast = useUIStore((s) => s.addToast);
  const setTab = useUIStore((s) => s.setTab);
  const switchUser = useAsyncAction(switchDemoUser);
  const demo = useAsyncAction(startDemo);
  const [confirmDemo, setConfirmDemo] = useState(false);
  if (!family) return null;

  const onSwitch = async (id: string, name: string) => {
    const res = await switchUser.run(id);
    if (res.ok) addToast(`Теперь вы действуете как ${name}`, 'info');
  };

  return (
    <Card className="p-5 border border-dashed border-warning/50">
      <SectionHeader
        title="Режим демонстрации"
        subtitle="Инструменты для показа прототипа. В настоящем приложении их не будет."
        action={<Badge tone="warning" icon={<Sparkles size={12} aria-hidden />}>Демо</Badge>}
      />

      {family.isDemo && (
        <div className="mb-5">
          <h3 className="text-sm font-medium text-ink-2 mb-2">Действовать от имени</h3>
          <div className="flex flex-wrap gap-2">
            {family.members.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={m.id === currentUserId}
                disabled={switchUser.pending}
                onClick={() => m.id !== currentUserId && onSwitch(m.id, m.name)}
                className={`h-11 pl-1.5 pr-4 rounded-full border inline-flex items-center gap-2 text-[15px] font-medium transition-colors
                  ${m.id === currentUserId ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong text-ink hover:border-ink-3'}`}
              >
                <Avatar user={m} size="sm" />
                {m.name}
              </button>
            ))}
          </div>
          <p className="text-[13px] text-ink-3 mt-2">
            Два участника в одном браузере — только для показа. Совместную работу нужно проверять в разных сессиях.
          </p>
          {switchUser.error && <p role="alert" className="text-sm text-danger mt-2">{switchUser.error}</p>}
        </div>
      )}

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={simulateErrors}
          onChange={(e) => setSimulateErrors(e.target.checked)}
          className="mt-1 w-5 h-5 accent-[var(--accent)] shrink-0"
        />
        <span>
          <span className="block font-medium text-ink">Имитировать ошибки сервера</span>
          <span className="block text-sm text-ink-2">Все запросы будут завершаться ошибкой — чтобы показать, как приложение их обрабатывает.</span>
        </span>
      </label>

      <Button className="mt-5" variant="secondary" icon={<Sparkles size={16} />} onClick={() => setConfirmDemo(true)}>
        Загрузить демо-семью
      </Button>

      <Presence show={confirmDemo}>
        <ConfirmDialog
          title="Заменить данные демо-семьёй?"
          confirmLabel="Загрузить"
          tone="primary"
          pending={demo.pending}
          error={demo.error}
          onCancel={() => setConfirmDemo(false)}
          onConfirm={async () => {
            const res = await demo.run();
            if (!res.ok) return;
            setConfirmDemo(false);
            setTab('overview');
            addToast('Загружена демо-семья Смирновых');
          }}
        >
          <p>
            Откроется пример «Семья Смирновых» — песочница: изменения в ней не затрагивают вашу семью. Вернуться
            в свою семью — кнопкой «Выйти из демо».
          </p>
        </ConfirmDialog>
      </Presence>
    </Card>
  );
}

function LeaveCard() {
  const family = useFamilyStore((s) => s.family);
  const savedFamily = useFamilyStore((s) => s.savedSession?.family ?? null);
  const addToast = useUIStore((s) => s.addToast);
  const setTab = useUIStore((s) => s.setTab);
  const leave = useAsyncAction(leaveFamily);
  const [confirm, setConfirm] = useState(false);
  const demo = family?.isDemo ?? false;
  // In the demo the button only closes the sandbox; the real account is never touched
  const back = demo && savedFamily ? savedFamily.name : null;

  const onLeave = async () => {
    const res = await leave.run();
    if (!res.ok) return;
    setTab('overview');
    addToast(demo ? (back ? `Вы вернулись в «${back}»` : 'Демо закрыто') : 'Вы вышли из семьи', 'info');
  };

  return (
    <div className="px-1">
      <Button variant="dangerGhost" icon={<LogOut size={16} />} onClick={() => setConfirm(true)}>
        {demo ? 'Выйти из демо' : 'Выйти из семьи'}
      </Button>
      <Presence show={confirm}>
        <ConfirmDialog
          title={demo ? 'Выйти из демо?' : 'Выйти из семьи?'}
          confirmLabel="Выйти"
          tone={demo ? 'primary' : undefined}
          pending={leave.pending}
          error={leave.error}
          onCancel={() => setConfirm(false)}
          onConfirm={onLeave}
        >
          {demo ? (
            <p>
              Демо-семья закроется, изменения в ней не сохранятся.{' '}
              {back ? <>Вы вернётесь в свою семью «{back}».</> : 'Вы вернётесь на начальный экран.'}
            </p>
          ) : (
            <p>
              Вы перестанете видеть общий бюджет «{family?.name}». Чтобы вернуться, понадобится новое приглашение.
            </p>
          )}
        </ConfirmDialog>
      </Presence>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Bell, Check, Deposit, Users, CloseIcon } from '../components/ui/icons';
import { T } from '@admiral-ds/react-ui';
import type { AppNotification, User } from '../types';
import {
  approveMember,
  errorMessage,
  listNotifications,
  markNotificationsRead,
  removeMember,
} from '../api/client';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useDataStore } from '../store/dataStore';
import { useFamilyStore, useIsParent } from '../store/familyStore';
import { useUIStore } from '../store/uiStore';
import { formatCurrency } from '../utils/currency';
import { plural } from '../utils/date';
import { InvitePanel } from '../components/family/InvitePanel';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { Avatar, Badge } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { ErrorState, Skeleton } from '../components/ui/Feedback';
import { Disclosure } from '../components/ui/Disclosure';

export function FamilyPage() {
  const family = useFamilyStore((s) => s.family);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
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
                <T as="h2" font="Header/H4" color="Special/Static White" className="break-words">{family.name}</T>
                <p className="text-ink-2">
                  {family.members.length} {plural(family.members.length, 'участник', 'участника', 'участников')}
                </p>
              </div>
            </div>
            <ul className="member-grid">
              {family.members.map((m) => (
                <li key={m.id} className="flex min-w-0 items-center gap-2 family-member-tile">
                  <Avatar user={m} />
                  <span className="flex-1 min-w-0 font-medium text-ink truncate">{m.name}</span>
                  {m.role === 'child' && <span className="account-tag shrink-0">Ребёнок</span>}
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

        </div>

        <div className="space-y-5 min-w-0">
          <EventsCard />
          <FamilyFaq />
        </div>
      </div>
    </>
  );
}

const FAQ = [
  ['Как пополнить общий счёт?', 'Откройте «Обзор» и нажмите «Пополнить общий счёт». Сумма увеличит остаток и отразится во взносах участника.'],
  ['Откуда берётся сумма к внесению?', 'Из доли участника в разделённых покупках и платежах вычитаются его взносы и личная оплата разделённых покупок. Покупки с общего счёта без деления уменьшают остаток счёта.'],
  ['Как пригласить участника?', 'Отправьте ссылку из раздела «Семья» для быстрого входа. При входе по коду доступ к бюджету появится после подтверждения взрослым.'],
  ['Кто видит данные бюджета?', 'Взрослые участники видят общий бюджет, запланированные платежи и покупки, добавленные в приложение. Личные счета и покупки вне приложения остаются приватными. Доступ проверяется на сервере.'],
  ['Кто может изменить записи?', 'Любой взрослый участник может изменить бюджет месяца, обязательные платежи и покупки, в том числе исправить, кто платил. Ребёнок может изменить только свои покупки.'],
  ['Что видит ребёнок?', 'Ребёнок видит свои карманные деньги, свои покупки и семейные цели. Взрослые задают лимит карманных денег.'],
] as const;

function FamilyFaq() {
  return (
    <Card className="px-3 py-3">
      <h2 className="px-3 py-2 font-semibold">Частые вопросы</h2>
      <div className="space-y-1">
        {FAQ.map(([question, answer]) => (
          <Disclosure key={question} title={question}>
            <p className="text-sm text-ink-2">{answer}</p>
          </Disclosure>
        ))}
      </div>
    </Card>
  );
}

/** Adults set each child's pocket money; spent and left come from the server */
function AllowancesCard({ members }: { members: User[] }) {
  const allowances = useDataStore((s) => s.allowances);
  const openModal = useUIStore((s) => s.openModal);

  return (
    <Card className="p-5">
      <SectionHeader title="Карманные деньги" subtitle="Лимит трат ребёнка на неделю или месяц. Сумму можно изменить в любой момент." />
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
                    ? `${formatCurrency(a.amount)} ${a.period === 'week' ? 'в неделю' : 'в месяц'}, осталось ${formatCurrency(a.left)}`
                    : 'Не назначены'}
                </span>
              </span>
              <Button size="sm" variant="secondary" icon={<Deposit size={15} />} onClick={() => openModal({ type: 'allowanceForm', memberId: child.id })}>
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
        subtitle="Лимиты бюджета, семейные цели и изменения в семье"
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
        <p className="text-ink-2 py-2">Здесь появятся предупреждения о лимитах и другие события семьи.</p>
      ) : (
        <>
          <ul className="space-y-1">
            {shown.map((n) => (
              <li key={n.id} className={`rounded-lg px-3 py-2.5 ${n.readAt ? '' : 'bg-accent-soft'}`}>
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
    <Card className="p-5">
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
          variant="ghost"
          icon={<CloseIcon size={15} />}
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

import { Check, Users, CloseIcon } from '../components/ui/icons';
import { T } from '@admiral-ds/react-ui';
import type { User } from '../types';
import {
  approveMember,
  rejectMember,
} from '../api/client';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useFamilyStore } from '../store/familyStore';
import { useUIStore } from '../store/uiStore';
import { plural } from '../utils/date';
import { InvitePanel } from '../components/family/InvitePanel';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { Avatar, Badge } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { Disclosure } from '../components/ui/Disclosure';

export function FamilyPage() {
  const family = useFamilyStore((s) => s.family);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  if (!family) return null;

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
                  {m.isOwner && <span className="account-tag shrink-0">Владелец</span>}
                  {m.id === currentUserId && <Badge tone="accent">Вы</Badge>}
                </li>
              ))}
            </ul>
            {family.members.length === 1 && (
              <p className="text-ink-2 mt-3">Пока вы один. Пригласите партнёра — расходы и план станут общими.</p>
            )}
          </Card>

          {!family.isDemo && <JoinRequestsCard canDecide={!!family.isOwner} />}
          {(
            <Card className="p-5">
              <SectionHeader title="Приглашение" subtitle="Отправьте ссылку — по ней увидят название семьи и смогут присоединиться" />
              <InvitePanel />
            </Card>
          )}

        </div>

        <div className="space-y-5 min-w-0">
          <FamilyFaq />
        </div>
      </div>
    </>
  );
}

const FAQ = [
  ['Как пополнить общий счёт?', 'Откройте «Обзор» и нажмите «Пополнить общий счёт». Сумма увеличит остаток и отразится во взносах участника.'],
  ['Откуда берётся сумма к внесению?', 'Из доли участника в разделённых покупках и платежах вычитаются его взносы и личная оплата разделённых покупок. Покупки с общего счёта без деления уменьшают остаток счёта.'],
  ['Где посмотреть взносы семьи?', 'Откройте «Аналитика» → «Взносы и доли». Там видны доли участников, суммы к внесению и последние пополнения за выбранный месяц.'],
  ['Как разделить покупку?', 'При записи покупки выберите источник и способ деления: поровну, в долях или без деления. Если задать доли вручную, их сумма должна быть 100%.'],
  ['Как оплатить обязательный платёж?', 'Для платежей с общего счёта доступна кнопка «Оплатить сейчас». Она фиксирует списание в семейном бюджете. Если вы уже рассчитались с поставщиком, нажмите «Записать оплату».'],
  ['Что происходит со взносом в цель?', 'Общий счёт и накопления по выбранной цели увеличиваются на сумму взноса.'],
  ['Как пригласить участника?', 'Отправьте ссылку или код. Новый участник получит доступ к бюджету после подтверждения владельцем.'],
  ['Кто видит данные бюджета?', 'Все подтверждённые участники видят общий бюджет, платежи и покупки. Доступ проверяется на сервере.'],
  ['Кто может изменить записи?', 'Любой подтверждённый участник может изменить бюджет, обязательные платежи и покупки. Составом семьи управляет владелец.'],
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

/** People who joined by code: all members see requests, only the owner sees decision buttons. */
function JoinRequestsCard({ canDecide }: { canDecide: boolean }) {
  const pending = useFamilyStore((s) => s.family?.pendingMembers ?? []);
  if (pending.length === 0) return null;

  return (
    <Card className="p-5">
      <SectionHeader
        title="Заявки на вход"
        subtitle="Ожидающие не видят бюджет до решения владельца семьи."
      />
      <ul className="divide-y divide-line">
        {pending.map((m) => (
          <JoinRequestRow key={m.id} member={m} canDecide={canDecide} />
        ))}
      </ul>
    </Card>
  );
}

function JoinRequestRow({ member, canDecide }: { member: User; canDecide: boolean }) {
  const addToast = useUIStore((s) => s.addToast);
  const approve = useAsyncAction(approveMember);
  const decline = useAsyncAction(rejectMember);
  const busy = approve.pending || decline.pending;
  const error = approve.error ?? decline.error;

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <Avatar user={member} />
        <span className="flex-1 min-w-0">
          <span className="block font-medium text-ink truncate">{member.name}</span>
          <span className="block text-sm text-ink-2">Ожидает подтверждения</span>
        </span>
        {canDecide && <>
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
        </>}
      </div>
      {error && <p role="alert" className="text-sm text-danger mt-2">{error}</p>}
    </li>
  );
}

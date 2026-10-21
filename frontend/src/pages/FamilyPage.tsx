import { useState } from 'react';
import { Check, Copy, Eye, LogOut, Monitor, Moon, Pencil, Share2, ShieldCheck, Sparkles, Sun, UserPlus, Users } from 'lucide-react';
import { leaveFamily, switchDemoUser } from '../api/client';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useFamilyStore } from '../store/familyStore';
import { useUIStore, type Theme } from '../store/uiStore';
import { loadDemoData } from '../utils/demoData';
import { plural } from '../utils/date';
import { buildInviteUrl } from '../components/family/invite';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { Avatar, Badge } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Presence } from '../components/ui/Presence';

export function FamilyPage() {
  const family = useFamilyStore((s) => s.family);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const openModal = useUIStore((s) => s.openModal);
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
                  {m.id === currentUserId && <Badge tone="accent">Вы</Badge>}
                </li>
              ))}
            </ul>
            {family.members.length === 1 && (
              <p className="text-ink-2 mt-3">Пока вы один. Пригласите партнёра — расходы и план станут общими.</p>
            )}
          </Card>

          <InviteCard />
        </div>

        <div className="space-y-5 min-w-0">
          <Card className="p-5">
            <SectionHeader title="Правила общего пространства" />
            <ul className="space-y-3.5 text-[15px]">
              <Rule icon={<Eye size={18} />}>
                Участники видят только общие расходы и платежи, которые внесли сюда. Личные счета и покупки вне приложения не видны.
              </Rule>
              <Rule icon={<Pencil size={18} />}>
                Изменять и удалять можно только свои расходы. Бюджет месяца и обязательные платежи — общие: их может менять любой участник.
              </Rule>
              <Rule icon={<ShieldCheck size={18} />}>
                Права проверяются на сервере: скрытая кнопка не даёт доступа к чужим данным.
              </Rule>
            </ul>
            <Button className="mt-5" variant="secondary" icon={<UserPlus size={16} />} onClick={() => openModal({ type: 'invite' })}>
              Пригласить участника
            </Button>
          </Card>

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

function InviteCard() {
  const family = useFamilyStore((s) => s.family);
  const addToast = useUIStore((s) => s.addToast);
  const [copied, setCopied] = useState(false);
  if (!family) return null;
  const url = buildInviteUrl(family);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      addToast('Ссылка-приглашение скопирована');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast('Не удалось скопировать. Выделите ссылку и скопируйте вручную.', 'error');
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: `Приглашение в «${family.name}»`, url });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <Card className="p-5">
      <SectionHeader title="Приглашение" subtitle="Отправьте ссылку партнёру — по ней он увидит название семьи и сможет присоединиться" />
      <div className="rounded-xl bg-surface-muted border border-line px-3.5 py-3 text-sm text-ink-2 break-all select-all">{url}</div>
      <div className="flex flex-wrap items-center gap-2.5 mt-3">
        <Button icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={copy}>
          {copied ? 'Скопировано' : 'Скопировать ссылку'}
        </Button>
        {typeof navigator.share === 'function' && (
          <Button variant="secondary" icon={<Share2 size={16} />} onClick={share}>
            Поделиться
          </Button>
        )}
      </div>
      <p className="text-sm text-ink-3 mt-3">
        Код семьи: <span className="font-mono font-semibold text-ink tracking-wider">{family.inviteCode}</span>
      </p>
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
          onCancel={() => setConfirmDemo(false)}
          onConfirm={() => {
            loadDemoData();
            setConfirmDemo(false);
            setTab('overview');
            addToast('Загружена демо-семья Смирновых');
          }}
        >
          <p>Текущая семья, бюджеты, расходы и платежи в этом браузере будут заменены примером «Семья Смирновых».</p>
        </ConfirmDialog>
      </Presence>
    </Card>
  );
}

function LeaveCard() {
  const family = useFamilyStore((s) => s.family);
  const addToast = useUIStore((s) => s.addToast);
  const leave = useAsyncAction(leaveFamily);
  const [confirm, setConfirm] = useState(false);

  const onLeave = async () => {
    const res = await leave.run();
    if (res.ok) addToast('Вы вышли из семьи', 'info');
  };

  return (
    <div className="px-1">
      <Button variant="dangerGhost" icon={<LogOut size={16} />} onClick={() => setConfirm(true)}>
        Выйти из семьи
      </Button>
      <Presence show={confirm}>
        <ConfirmDialog
          title="Выйти из семьи?"
          confirmLabel="Выйти"
          pending={leave.pending}
          error={leave.error}
          onCancel={() => setConfirm(false)}
          onConfirm={onLeave}
        >
          <p>
            Вы перестанете видеть общий бюджет «{family?.name}». Чтобы вернуться, понадобится новое приглашение.
          </p>
        </ConfirmDialog>
      </Presence>
    </div>
  );
}

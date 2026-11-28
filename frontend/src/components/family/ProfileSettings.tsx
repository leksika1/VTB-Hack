import { useEffect, useRef, useState } from 'react';
import { RadioButton, T } from '@admiral-ds/react-ui';
import type { Me } from '../../types';
import { errorMessage, getMe, getOidcConfig, leaveFamily, startOidc, switchDemoUser, unlinkOidc, type OidcConfig } from '../../api/client';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useFamilyStore } from '../../store/familyStore';
import { useUIStore, type Theme } from '../../store/uiStore';
import { switchTheme } from '../../utils/theme';
import { Bank, LogOut, Verified } from '../ui/icons';
import { Card, SectionHeader } from '../ui/Card';
import { Badge } from '../ui/Misc';
import { Button } from '../ui/Button';
import { ChoiceChip } from '../ui/ChoiceChip';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Presence } from '../ui/Presence';

export function ProfileSettings({ focusSection = 'settings' }: { focusSection?: 'settings' | 'access' }) {
  const demo = useFamilyStore((state) => state.family?.isDemo);
  return (
    <div className="divide-y divide-line">
      {!demo && <ParticipantIdCard />}
      {!demo && <VtbIdCard />}
      <AccessCard focus={focusSection === 'access'} />
      <AppearanceCard />
      {demo && <DemoCard />}
      <LeaveCard />
    </div>
  );
}

function AccessCard({ focus }: { focus: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus) return;
    const timer = window.setTimeout(() => {
      ref.current?.focus({ preventScroll: true });
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.clearTimeout(timer);
  }, [focus]);

  return (
    <div ref={ref} tabIndex={-1} aria-labelledby="profile-access-title" className="rounded-card outline-none">
      <Card className="p-5">
        <SectionHeader id="profile-access-title" title="Доступ и видимость данных" />
        <div className="space-y-2 text-ink-2">
          <p>Общий счёт и операции видят все подтверждённые участники семьи.</p>
          <p>Личные покупки по карте видны только вам, пока вы не добавите их в общий бюджет.</p>
        </div>
      </Card>
    </div>
  );
}

function ParticipantIdCard() {
  const addToast = useUIStore((s) => s.addToast);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let alive = true;
    getMe().then((value) => alive && setMe(value), () => { });
    return () => { alive = false; };
  }, []);

  if (!me?.loginId) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(me.loginId!);
      addToast('Личный ID скопирован', 'info');
    } catch {
      addToast('Не удалось скопировать ID', 'error');
    }
  };
  return (
    <Card className="p-5">
      <SectionHeader title="Личный ID для входа" />
      <p className="text-ink-2">Храните его как пароль: по этому ID можно открыть только ваш профиль участника.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <code className="rounded-control bg-surface-muted px-3 py-2 text-lg font-semibold tracking-wider">{me.loginId}</code>
        <Button variant="secondary" size="sm" onClick={copy}>Скопировать</Button>
      </div>
    </Card>
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
      if (c.enabled) getMe().then((m) => alive && setMe(m), () => { });
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
        action={me.vtbLinked ? <Badge tone="success" icon={<Verified size={12} aria-hidden />}>Привязан</Badge> : undefined}
      />
      {me.vtbLinked ? (
        <>
          <p className="text-ink-2">
            Входите через банк на любом устройстве — откроется ваш аккаунт в семье. Отвязать можно в любой момент.
          </p>
          <Button className="mt-4" variant="ghost" onClick={() => setConfirmUnlink(true)}>
            Отвязать {config.providerName}
          </Button>
        </>
      ) : (
        <>
          <p className="text-ink-2">Привяжите {config.providerName}, чтобы входить через банк на любом устройстве без приглашения.</p>
          <Button className="mt-4" variant="secondary" icon={<Bank size={16} />} loading={linking} onClick={link}>
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

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'system', label: 'Как в системе' },
];

function AppearanceCard() {
  const theme = useUIStore((s) => s.theme);
  return (
    <Card className="p-5">
      <SectionHeader title="Тема" />
      <fieldset className="flex flex-wrap gap-x-6 gap-y-3">
        <legend className="sr-only">Выберите тему</legend>
        {THEMES.map((t) => (
          <RadioButton key={t.value} name="theme-choice" value={t.value} checked={theme === t.value}
            onChange={() => switchTheme(t.value)}>
            {t.label}
          </RadioButton>
        ))}
      </fieldset>
    </Card>
  );
}

/** Everything that exists only for demonstrating the prototype is grouped and labelled here */
function DemoCard() {
  const family = useFamilyStore((s) => s.family);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const addToast = useUIStore((s) => s.addToast);
  const switchUser = useAsyncAction(switchDemoUser);
  if (!family) return null;

  const onSwitch = async (id: string, name: string) => {
    const res = await switchUser.run(id);
    if (res.ok) addToast(`Теперь вы действуете как ${name}`, 'info');
  };

  return (
    <Card className="p-5">
      <SectionHeader
        title="Режим демонстрации"
        subtitle="Инструменты для показа прототипа. В настоящем приложении их не будет."
      />

      <div>
        <T as="h3" font="Subtitle/Subtitle 2" className="mb-2">Действовать от имени</T>
        <div className="flex flex-wrap gap-2">
          {family.members.map((m) => (
            <ChoiceChip
              key={m.id}
              dimension="m"
              selected={m.id === currentUserId}
              disabled={switchUser.pending}
              onClick={() => m.id !== currentUserId && onSwitch(m.id, m.name)}
            >
              {m.name}
            </ChoiceChip>
          ))}
        </div>
        <p className="text-[13px] text-ink-3 mt-2">
          Два участника в одном браузере — только для показа. Совместную работу нужно проверять в разных сессиях.
        </p>
        {switchUser.error && <p role="alert" className="text-sm text-danger mt-2">{switchUser.error}</p>}
      </div>
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
    <div className="px-5 py-3">
      <Button variant="ghost" icon={<LogOut size={16} />} onClick={() => setConfirm(true)}>
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

import { useEffect, useState, type ClipboardEvent, type FormEvent } from 'react';
import { ArrowLeft, Bank, Play, Deposit } from '../components/ui/icons';
import { NotificationItem, NotificationItemButtonPanel, NotificationItemContent, ProgressPage, T } from '@admiral-ds/react-ui';
import type { InvitePreview } from '../types';
import {
  clearLinkToken,
  createFamily,
  errorMessage,
  getInvitePreview,
  getLinkToken,
  getOidcConfig,
  joinFamily,
  loginById,
  startDemo,
  startOidc,
  type OidcConfig,
} from '../api/client';
import { useAsyncAction, useRequestId } from '../hooks/useAsyncAction';
import { useUIStore } from '../store/uiStore';
import { buildInviteUrl, clearInviteFromUrl } from '../components/family/invite';
import { plural } from '../utils/date';
import { BrandMark } from '../components/layout/AppShell';
import { Field, FormError } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Feedback';

type Mode = 'create' | 'join' | 'login';

interface OnboardingPageProps {
  /** Code from an invite link (?invite=…) */
  invite: string | null;
  onInviteDismiss: () => void;
}

/** «Войти через ВТБ ID» is shown only when the backend has the bank sign-in enabled */
function useOidcConfig(): OidcConfig | null {
  const [config, setConfig] = useState<OidcConfig | null>(null);
  useEffect(() => {
    let alive = true;
    getOidcConfig().then((c) => alive && setConfig(c));
    return () => {
      alive = false;
    };
  }, []);
  return config;
}

export function OnboardingPage({ invite, onInviteDismiss }: OnboardingPageProps) {
  const [mode, setMode] = useState<Mode | null>(invite ? 'join' : getLinkToken() ? 'create' : null);
  const addToast = useUIStore((s) => s.addToast);
  const [demoPending, setDemoPending] = useState(false);
  const oidc = useOidcConfig();
  const [oidcPending, setOidcPending] = useState(false);
  // The bank confirmed the person, but no family member is linked to this VTB ID yet
  const [vtbConfirmed, setVtbConfirmed] = useState(() => getLinkToken() !== null);
  const dismissInvite = () => {
    clearInviteFromUrl();
    onInviteDismiss();
  };

  const signInWithBank = async () => {
    if (!oidc?.enabled) {
      addToast('Вход через ВТБ ID выключен на сервере: в настройках бэкенда нужно задать OIDC_ENABLED=true', 'error');
      return;
    }
    setOidcPending(true);
    try {
      await startOidc('login', invite);
      // The page is navigating to the bank; keep the spinner
    } catch (e) {
      addToast(errorMessage(e), 'error');
      setOidcPending(false);
    }
  };

  return (
    <div className="welcome">
      <header className="welcome-brand"><BrandMark size={36} /><T font="Header/H5">Общий план</T></header>
      <main className="welcome-layout">
        <section className="welcome-story" aria-label="Семейный бюджет">
          <T as="h2" font="Header/H1" color="Special/Static White">Общий план для всей семьи</T>
          <T as="p" font="Body/Body 1 Long" color="Special/Static White" className="mt-3 max-w-sm">Общий счёт, взносы и платежи по расписанию.</T>
          <div className="welcome-goal" aria-label="Пример семейной цели">
            <div className="welcome-goal-heading">
              <span className="welcome-goal-icon"><Deposit size={26} aria-hidden /></span>
              <div>
                <T as="div" font="Caption/Caption 1" color="Neutral/Neutral 70">Цель демо-семьи</T>
                <T as="div" font="Subtitle/Subtitle 2">Стиральная машина</T>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-2">
              <T font="Header/H3">45 000 ₽</T>
              <T font="Body/Body 2 Short" color="Neutral/Neutral 70">из 60 000 ₽</T>
            </div>
            <ProgressPage percent={75} role="progressbar" aria-label="Накоплено на цель" aria-valuemin={0} aria-valuemax={100} aria-valuenow={75} />
          </div>
        </section>
        <section className="welcome-panel">
          {vtbConfirmed && (
            <NotificationItem status="success" displayStatusIcon isBorderHidden className="mb-6">
              <NotificationItemContent>
                {oidc?.providerName ?? 'ВТБ ID'} подтверждён. Создайте семью или присоединитесь по приглашению, чтобы в следующий раз войти через банк.
              </NotificationItemContent>
              <NotificationItemButtonPanel>
                <Button size="sm" variant="ghost" onClick={() => {
                  clearLinkToken();
                  setVtbConfirmed(false);
                }}>
                  Не привязывать
                </Button>
              </NotificationItemButtonPanel>
            </NotificationItem>
          )}

          {invite && mode === 'join' ? (
            <JoinForm
              invite={invite}
              onJoined={onInviteDismiss}
              onCancel={() => {
                dismissInvite();
                setMode('create');
              }}
            />
          ) : (
            <>
              {mode && <Button size="sm" variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => setMode(null)}>Назад</Button>}
              <T as="h1" font="Header/H3" className="mt-3">
                {mode === 'create' ? 'Новая семья' : mode === 'join' ? 'Вход по приглашению'
                  : mode === 'login' ? 'Вход по личному ID' : 'Войти в Общий план'}
              </T>
              <div className="mt-6 space-y-3">
                {mode === 'create' ? <CreateForm /> : mode === 'join' ? <JoinForm invite={null} />
                  : mode === 'login' ? <LoginForm /> : (
                  <>
                    {oidc?.enabled && !vtbConfirmed && (
                      <Button fullWidth size="lg" icon={<Bank size={18} />} loading={oidcPending} onClick={signInWithBank}>
                        Войти через {oidc.providerName}
                      </Button>
                    )}
                    <Button fullWidth size="lg" variant="secondary" onClick={() => setMode('create')}>Создать семью</Button>
                    <Button fullWidth variant="ghost" onClick={() => setMode('login')}>Войти по личному ID</Button>
                    <Button fullWidth variant="ghost" onClick={() => setMode('join')}>У меня есть приглашение</Button>
                  </>
                )}
              </div>
            </>
          )}
          {invite && oidc?.enabled && !vtbConfirmed && (
            <Button className="mt-4" fullWidth variant="secondary" loading={oidcPending} onClick={signInWithBank}>Войти через {oidc.providerName}</Button>
          )}
          <div className="mt-6 flex justify-center">
            <Button
              variant="ghost"
              icon={<Play size={17} />}
              loading={demoPending}
              onClick={async () => {
                setDemoPending(true);
                try {
                  await startDemo();
                  dismissInvite();
                  addToast('Открыт семейный демо-бюджет');
                } catch (e) {
                  addToast(errorMessage(e), 'error');
                } finally {
                  setDemoPending(false);
                }
              }}
            >
              Открыть демо
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}

function LoginForm() {
  const addToast = useUIStore((s) => s.addToast);
  const login = useAsyncAction(loginById);
  const [loginId, setLoginId] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!loginId.trim()) return;
    const result = await login.run(loginId);
    if (result.ok) addToast(`Открыта семья «${result.value.name}»`);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field
        label="Личный ID участника"
        value={loginId}
        onChange={(event) => setLoginId(event.target.value.toUpperCase())}
        placeholder="XXXXX-XXXXX"
        maxLength={11}
        autoComplete="username"
        error={submitted && !loginId.trim() ? 'Введите личный ID' : login.errorField === 'loginId' ? login.error : null}
      />
      {login.error && login.errorField !== 'loginId' && <FormError>{login.error}</FormError>}
      <Button type="submit" fullWidth size="lg" loading={login.pending}>Войти</Button>
    </form>
  );
}

function CreateForm() {
  const addToast = useUIStore((s) => s.addToast);
  const requestId = useRequestId();
  const create = useAsyncAction(createFamily);
  const [familyName, setFamilyName] = useState('');
  const [userName, setUserName] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!familyName.trim() || !userName.trim()) return;
    const res = await create.run(familyName, userName, requestId);
    if (res.ok) addToast(`Семья «${res.value.name}» создана. Пригласите партнёра на вкладке «Семья».`);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field
        label="Название семьи"
        value={familyName}
        onChange={(e) => setFamilyName(e.target.value)}
        placeholder="Например, Семья Ивановых"
        maxLength={80}
        autoComplete="off"
        error={submitted && !familyName.trim() ? 'Придумайте название' : null}
      />
      <Field
        label="Как вас зовут"
        value={userName}
        onChange={(e) => setUserName(e.target.value)}
        placeholder="Имя"
        maxLength={60}
        autoComplete="given-name"
        error={submitted && !userName.trim() ? 'Укажите имя — его увидят участники' : create.errorField === 'userName' ? create.error : null}
      />
      {create.error && !create.errorField && <FormError>{create.error}</FormError>}
      <Button type="submit" fullWidth size="lg" loading={create.pending}>
        Создать семью
      </Button>
    </form>
  );
}

function JoinForm({
  invite,
  onCancel,
  onJoined,
}: {
  invite: string | null;
  onCancel?: () => void;
  onJoined?: () => void;
}) {
  const addToast = useUIStore((s) => s.addToast);
  const requestId = useRequestId();
  const join = useAsyncAction(joinFamily);
  const [code, setCode] = useState(invite ?? '');
  const [userName, setUserName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const preview = useInvitePreview(invite);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!code.trim() || !userName.trim()) return;
    const res = await join.run(code, userName, requestId);
    if (!res.ok) return;
    clearInviteFromUrl();
    // An invite link never equals family.inviteCode, so App cannot infer the join source on its own.
    onJoined?.();
    if (res.value.pending) addToast('Заявка отправлена. Ждём подтверждения владельца семьи.', 'info');
    else addToast(`Вы присоединились к «${res.value.name}»`);
  };

  if (invite && preview.status === 'loading') {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Загружаем приглашение">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (invite && preview.status === 'error') {
    return (
      <div className="space-y-4">
        <T as="h1" font="Header/H3">Приглашение не открылось</T>
        <FormError>{preview.error}</FormError>
        {onCancel && (
          <Button variant="secondary" fullWidth onClick={onCancel}>
            Создать свою семью
          </Button>
        )}
      </div>
    );
  }

  const info = preview.status === 'ready' ? preview.value : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {info && (
        <>
          <p className="text-ink-2">Вас пригласили в семейное пространство</p>
          <T as="h1" font="Header/H3" className="break-words">«{info.familyName}»</T>
          <p className="text-ink-2">
            {info.membersCount} {plural(info.membersCount, 'участник', 'участника', 'участников')},{' '}
            вы войдёте как участник
          </p>
          <p className="text-ink-2">
            Вы будете видеть общий план, расходы и платежи и сможете добавлять свои.
            {info.needsApproval && ' Вход подтверждает владелец семьи — до этого данные бюджета не видны.'}
          </p>
        </>
      )}
      {!invite && (
        <CodeField
          label="Код приглашения"
          value={code}
          onChange={setCode}
          error={submitted && !code.trim() ? 'Введите код' : join.errorField === 'code' ? join.error : null}
        />
      )}
      <Field
        label="Как вас зовут"
        value={userName}
        onChange={(e) => setUserName(e.target.value)}
        placeholder="Имя"
        maxLength={60}
        autoComplete="given-name"
        error={submitted && !userName.trim() ? 'Укажите имя — его увидят участники' : join.errorField === 'userName' ? join.error : null}
      />
      {join.error && join.errorField !== 'code' && join.errorField !== 'userName' && <FormError>{join.error}</FormError>}
      {invite && join.errorField === 'code' && <FormError>{join.error}</FormError>}
      <Button type="submit" fullWidth size="lg" loading={join.pending}>
        Присоединиться
      </Button>
      {onCancel && (
        <Button variant="ghost" fullWidth onClick={onCancel}>
          Создать свою семью вместо этого
        </Button>
      )}
    </form>
  );
}

type Loadable<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; error: string } | { status: 'idle' };

/** The family behind an invite link, from the server — the link itself carries only the code */
function useInvitePreview(code: string | null): Loadable<InvitePreview> {
  const [state, setState] = useState<Loadable<InvitePreview>>(code ? { status: 'loading' } : { status: 'idle' });
  useEffect(() => {
    if (!code) return;
    let alive = true;
    getInvitePreview(code).then(
      (value) => alive && setState({ status: 'ready', value }),
      (e) => alive && setState({ status: 'error', error: errorMessage(e) })
    );
    return () => {
      alive = false;
    };
  }, [code]);
  return state;
}

const CODE_LENGTH = 6;

function CodeField({ label, value, onChange, error }: { label: string; value: string; onChange: (code: string) => void; error?: string | null }) {
  const clean = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').trim();
    let pasted = text;
    try {
      pasted = new URL(text).searchParams.get('invite') ?? text;
    } catch {
      // Not a link: a bare code
    }
    const code = clean(pasted);
    if (code.length > CODE_LENGTH) {
      e.preventDefault();
      window.location.assign(buildInviteUrl(code));
    } else if (code.length === CODE_LENGTH) {
      e.preventDefault();
      onChange(code);
    }
  };

  return (
    <Field
      label={label}
      hint="Шесть символов из приглашения. Вход подтвердит владелец семьи."
      value={value}
      onChange={(e) => onChange(clean(e.target.value).slice(0, CODE_LENGTH))}
      onPaste={onPaste}
      placeholder="Например, A1B2C3"
      maxLength={CODE_LENGTH}
      autoComplete="one-time-code"
      autoCapitalize="characters"
      spellCheck={false}
      error={error}
    />
  );
}

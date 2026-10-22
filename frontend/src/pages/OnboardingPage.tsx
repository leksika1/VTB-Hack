import { useEffect, useId, useState, type ClipboardEvent, type FormEvent } from 'react';
import { BadgeCheck, Calculator, CalendarClock, Landmark, Sparkles, Users } from 'lucide-react';
import type { InvitePreview } from '../types';
import {
  clearLinkToken,
  createFamily,
  errorMessage,
  getInvitePreview,
  getLinkToken,
  getOidcConfig,
  joinFamily,
  startDemo,
  startOidc,
  type OidcConfig,
} from '../api/client';
import { useAsyncAction, useRequestId } from '../hooks/useAsyncAction';
import { useUIStore } from '../store/uiStore';
import { buildInviteUrl, clearInviteFromUrl } from '../components/family/invite';
import { plural } from '../utils/date';
import { BrandMark } from '../components/layout/AppShell';
import { Field, FieldError, FormError } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Feedback';

type Mode = 'create' | 'join';

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
  const [mode, setMode] = useState<Mode>(invite ? 'join' : 'create');
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
    <div className="min-h-dvh grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">

      <aside className="hidden lg:flex flex-col relative justify-center p-12 text-white bg-[linear-gradient(150deg,var(--brand)_0%,var(--brand-2)_100%)]">
        <div className="absolute top-0 mt-10">
          <BrandMark size={44} />
          <span className="text-lg font-semibold">Семейный бюджет</span>
        </div>

        <div className="max-w-md -top-5 relative">
          <h2 className="text-4xl font-bold leading-tight">Решайте о покупках вместе — с учётом будущих платежей</h2>
          <ul className="mt-8 space-y-5 text-[17px] text-brand-ink-2">
            <Promo icon={<Calculator size={20} />}>«Можем ли купить холодильник?» — ответ с расчётом за пару секунд</Promo>
            <Promo icon={<CalendarClock size={20} />}>Аренда, сад, коммуналка заранее резервируются и не теряются</Promo>
            <Promo icon={<Users size={20} />}>Общий план на двоих: каждый видит те же цифры</Promo>
          </ul>
        </div>

      </aside>

      <main className="flex items-center justify-center px-4 py-6 sm:px-8">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <BrandMark size={40} />
            <span className="text-lg font-semibold text-ink">Семейный бюджет</span>
          </div>

          {vtbConfirmed && (
            <div className="mb-6 flex gap-3 rounded-xl bg-success-soft px-4 py-3 text-[15px] text-ink">
              <BadgeCheck size={20} className="shrink-0 mt-0.5 text-success" aria-hidden />
              <div className="min-w-0">
                <p>
                  {oidc?.providerName ?? 'ВТБ ID'} подтверждён, но пока не привязан ни к одной семье. Создайте семью или
                  присоединитесь по приглашению — в следующий раз войдёте через банк сразу.
                </p>
                <button
                  type="button"
                  className="mt-1 text-sm font-medium text-accent-ink hover:underline"
                  onClick={() => {
                    clearLinkToken();
                    setVtbConfirmed(false);
                  }}
                >
                  Не привязывать
                </button>
              </div>
            </div>
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
              <h1 className="text-[28px] font-bold text-ink leading-tight text-nowrap">
                {mode === 'create' ? 'Создайте семейное пространство' : 'Присоединиться по коду'}
              </h1>
              <p className="text-ink-2 mt-2">
                {mode === 'create'
                  ? 'Задайте название — затем пригласите партнёра по ссылке.'
                  : 'Введите код, который вам прислали, или откройте ссылку-приглашение.'}
              </p>

              <div role="tablist" aria-label="Способ входа" className="grid grid-cols-2 gap-1 p-1 mt-6 rounded-[var(--radius-control)] bg-surface-sunken">
                {(['create', 'join'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => setMode(m)}
                    className={`h-10 rounded-[10px] text-[15px] font-medium transition-colors
                      ${mode === m ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-2 hover:text-ink'}`}
                  >
                    {m === 'create' ? 'Новая семья' : 'У меня есть код'}
                  </button>
                ))}
              </div>

              <div className="mt-6">{mode === 'create' ? <CreateForm /> : <JoinForm invite={null} />}</div>
            </>
          )}

          {oidc && !vtbConfirmed && (
            <div className="mt-6">
              <div className="flex items-center gap-3 text-sm text-ink-3 mb-4" aria-hidden>
                <span className="h-px flex-1 bg-line" />
                или
                <span className="h-px flex-1 bg-line" />
              </div>
              <Button variant="outline" fullWidth size="lg" icon={<Landmark size={18} />} loading={oidcPending} onClick={signInWithBank}>
                Войти через {oidc.providerName}
              </Button>
              <p className="text-sm text-ink-3 mt-2 px-1">
                Уже есть семья — откроется ваш аккаунт. Нет — после входа создадите семью или присоединитесь по приглашению.
              </p>
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-line flex justify-center">
            <Button
              variant="ghost"
              icon={<Sparkles size={17} />}
              loading={demoPending}
              onClick={async () => {
                setDemoPending(true);
                try {
                  await startDemo();
                  dismissInvite();
                  addToast('Загружена демо-семья Смирновых');
                } catch (e) {
                  addToast(errorMessage(e), 'error');
                } finally {
                  setDemoPending(false);
                }
              }}
            >
              Посмотреть на примере демо-семьи
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function Promo({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="w-10 h-10 rounded-full bg-white/12 text-white flex items-center justify-center shrink-0" aria-hidden>
        {icon}
      </span>
      <span className="pt-2">{children}</span>
    </li>
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
    // Link and child codes never equal family.inviteCode, so App cannot tell on its own that the invite is used
    onJoined?.();
    if (res.value.pending) addToast('Заявка отправлена. Ждём, когда взрослый участник подтвердит вход.', 'info');
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
        <h1 className="text-[28px] font-bold text-ink leading-tight">Приглашение не открылось</h1>
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
          <h1 className="text-[28px] font-bold text-ink leading-tight break-words">«{info.familyName}»</h1>
          <p className="text-ink-2">
            {info.membersCount} {plural(info.membersCount, 'участник', 'участника', 'участников')} ·{' '}
            {info.role === 'child' ? 'вы войдёте как ребёнок' : 'вы войдёте как взрослый участник'}
          </p>
          <p className="text-ink-2">
            {info.role === 'child'
              ? 'Вы будете видеть свои расходы и карманные деньги и сможете просить о покупках.'
              : 'Вы будете видеть общий план, расходы и платежи и сможете добавлять свои.'}
            {info.needsApproval && ' Вход по коду подтверждает взрослый участник семьи — до этого данные семьи не видны.'}
          </p>
        </>
      )}
      {!invite && (
        <CodeField
          label="Код приглашения (вход подтверждает взрослый участник)"
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

/**
 * Six cells over one real input: native typing, backspace, paste and autofill keep working.
 * A pasted invite link opens the invite screen; a 16-character link code does not fit the cells, so it goes there too.
 */
function CodeField({ label, value, onChange, error }: { label: string; value: string; onChange: (code: string) => void; error?: string | null }) {
  const id = useId();
  const [focused, setFocused] = useState(false);
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
    }
  };

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-2 mb-1.5">
        {label}
      </label>
      <div className="relative grid grid-cols-6 gap-2">
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const active = focused && i === Math.min(value.length, CODE_LENGTH - 1);
          return (
            <span
              key={i}
              aria-hidden
              className={`h-12 flex items-center justify-center rounded-[var(--radius-control)] border font-mono text-xl font-semibold text-ink transition-colors
                ${active ? 'bg-surface border-accent ring-[3px] ring-accent/15' : error ? 'bg-surface-muted border-danger' : 'bg-surface-muted border-line'}`}
            >
              {value[i] ?? ''}
            </span>
          );
        })}
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(clean(e.target.value).slice(0, CODE_LENGTH))}
          onPaste={onPaste}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={CODE_LENGTH}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="absolute inset-0 w-full h-full opacity-0 cursor-text"
        />
      </div>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { Calculator, CalendarClock, Sparkles, Users } from 'lucide-react';
import { createFamily, errorMessage, joinFamily, startDemo } from '../api/client';
import { useAsyncAction, useRequestId } from '../hooks/useAsyncAction';
import { useUIStore } from '../store/uiStore';
import { clearInviteFromUrl } from '../components/family/invite';
import { BrandMark } from '../components/layout/AppShell';
import { Field, FormError } from '../components/ui/Field';
import { Button } from '../components/ui/Button';

type Mode = 'create' | 'join';

interface OnboardingPageProps {
  invite: { code: string; familyName: string | null } | null;
  onInviteDismiss: () => void;
}

export function OnboardingPage({ invite, onInviteDismiss }: OnboardingPageProps) {
  const [mode, setMode] = useState<Mode>(invite ? 'join' : 'create');
  const addToast = useUIStore((s) => s.addToast);
  const [demoPending, setDemoPending] = useState(false);
  const dismissInvite = () => {
    clearInviteFromUrl();
    onInviteDismiss();
  };

  return (
    <div className="min-h-dvh grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="hidden lg:flex flex-col justify-between p-12 text-white bg-[linear-gradient(150deg,var(--brand)_0%,var(--brand-2)_100%)]">
        <div className="flex items-center gap-3">
          <BrandMark size={44} />
          <span className="text-lg font-semibold">Семейный бюджет</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-4xl font-bold leading-tight">Решайте о покупках вместе — с учётом будущих платежей</h2>
          <ul className="mt-8 space-y-5 text-[17px] text-brand-ink-2">
            <Promo icon={<Calculator size={20} />}>«Можем ли купить холодильник?» — ответ с расчётом за пару секунд</Promo>
            <Promo icon={<CalendarClock size={20} />}>Аренда, сад, коммуналка заранее резервируются и не теряются</Promo>
            <Promo icon={<Users size={20} />}>Общий план на двоих: каждый видит те же цифры</Promo>
          </ul>
        </div>
        <p className="text-sm text-brand-ink-2">Прототип. Данные хранятся только в этом браузере.</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <BrandMark size={40} />
            <span className="text-lg font-semibold text-ink">Семейный бюджет</span>
          </div>

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
              <h1 className="text-[28px] font-bold text-ink leading-tight">
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

          <div className="mt-10 pt-6 border-t border-line">
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
            <p className="text-sm text-ink-3 mt-1 px-1">Готовый бюджет, расходы и платежи — чтобы оценить приложение без ввода данных.</p>
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
        maxLength={60}
        autoComplete="off"
        error={submitted && !familyName.trim() ? 'Придумайте название' : null}
      />
      <Field
        label="Как вас зовут"
        value={userName}
        onChange={(e) => setUserName(e.target.value)}
        placeholder="Имя"
        maxLength={40}
        autoComplete="given-name"
        error={submitted && !userName.trim() ? 'Укажите имя — его увидят участники' : null}
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
  invite: { code: string; familyName: string | null } | null;
  onCancel?: () => void;
  onJoined?: () => void;
}) {
  const addToast = useUIStore((s) => s.addToast);
  const requestId = useRequestId();
  const join = useAsyncAction(joinFamily);
  const [code, setCode] = useState(invite?.code ?? '');
  const [userName, setUserName] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!code.trim() || !userName.trim()) return;
    const res = await join.run(code, invite?.familyName ?? null, userName, requestId);
    if (!res.ok) return;
    clearInviteFromUrl();
    // Link and child codes never equal family.inviteCode, so App cannot tell on its own that the invite is used
    onJoined?.();
    addToast(`Вы присоединились к «${res.value.name}»`);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {invite && (
        <>
          <p className="text-ink-2">Вас пригласили в семейное пространство</p>
          <h1 className="text-[28px] font-bold text-ink leading-tight break-words">«{invite.familyName || 'Семья'}»</h1>
          <p className="text-ink-2">После присоединения вы будете видеть общий план, расходы и платежи и сможете добавлять свои.</p>
        </>
      )}
      {!invite && (
        <Field
          label="Код приглашения"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="6 символов"
          maxLength={6}
          autoComplete="off"
          autoCapitalize="characters"
          className="[&_input]:font-mono [&_input]:tracking-[0.2em]"
          error={submitted && !code.trim() ? 'Введите код' : join.errorField === 'code' ? join.error : null}
        />
      )}
      <Field
        label="Как вас зовут"
        value={userName}
        onChange={(e) => setUserName(e.target.value)}
        placeholder="Имя"
        maxLength={40}
        autoComplete="given-name"
        error={submitted && !userName.trim() ? 'Укажите имя — его увидят участники' : null}
      />
      {join.error && join.errorField !== 'code' && join.errorField !== 'userName' && <FormError>{join.error}</FormError>}
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
